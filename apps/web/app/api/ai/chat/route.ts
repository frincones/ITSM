import { NextRequest } from 'next/server';

import { openai } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/* -------------------------------------------------------------------------- */
/*  POST /api/ai/chat — AI Chat (Portal + Internal)                            */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  // ── Auth (optional for portal) ───────────────────────────────────────────
  const client = getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json();

  // ── Portal Mode ──────────────────────────────────────────────────────────
  if (body.portalContext) {
    const {
      orgId, orgName, userName: portalUserName, userEmail: portalUserEmail,
      conversationId, attachments,
    } = body.portalContext as {
      orgId?: string;
      orgName?: string;
      userName?: string;
      userEmail?: string;
      conversationId?: string;
      attachments?: Array<{ path: string; fileName: string; fileType: string }>;
    };

    const portalMessages = body.messages as Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>;

    if (!portalMessages?.length) {
      return Response.json({ error: 'messages required' }, { status: 400 });
    }

    const lastUserMsg = portalMessages.filter(m => m.role === 'user').pop()?.content ?? '';
    const lastAiMsg = portalMessages.filter(m => m.role === 'assistant').pop()?.content ?? '';

    // Check if user explicitly wants a ticket OR the AI triggered creation
    const userWantsTicket = /crear\s*ticket|no\s*se\s*resolvi|no\s*resol|abrir\s*caso|necesito\s*ticket|crear\s*caso|escalar|crea\s*el\s*ticket|crealo|si\s*crea|por\s*favor\s*crea|adelante|procede/i.test(lastUserMsg);
    const aiTriggered = /CREAR_TICKET_AHORA/i.test(lastAiMsg);
    // Also detect: user says short confirmation after AI offered to create ticket
    const aiOfferedTicket = /crear.*ticket|proceder.*ticket|voy a crear/i.test(lastAiMsg);
    const userConfirms = /^(si|sí|ok|dale|gracias|por favor|claro|adelante|procede|hazlo|crealo)\b/i.test(lastUserMsg.trim());

    const wantsTicket = userWantsTicket || aiTriggered || (aiOfferedTicket && userConfirms);

    // Fetch AI context
    let aiContext = '';
    const svc = getServiceClient();

    if (orgId) {
      try {
        const { data: orgData } = await svc
          .from('organizations')
          .select('ai_context')
          .eq('id', orgId)
          .maybeSingle();
        aiContext = orgData?.ai_context ?? '';
      } catch { /* optional */ }
    }

    const portalSystemPrompt = `You are the AI support assistant for ${orgName ?? 'the organization'}.
You help employees resolve IT issues. You speak in Spanish by default.

Rules:
- Always try to help first before creating a ticket
- Be friendly, professional, and concise
- If the user says it's not resolved, offer to create a ticket
- Classify tickets as: incident, request, warranty, support, or backlog
- Detect urgency from context (low, medium, high, critical)
- Users CAN attach files (screenshots, documents). When a message contains "[Archivos adjuntos: ...]", acknowledge the files and note them as evidence for the ticket.
- NEVER say you cannot receive files. Files are uploaded and will be attached to the ticket automatically.
- When the user confirms they want to create a ticket (e.g., "si", "crealo", "por favor", "adelante", "ok crea el ticket"), include in your response EXACTLY this phrase: "CREAR_TICKET_AHORA" (the system will detect this and create the ticket automatically). Do NOT just talk about creating the ticket — you must include that trigger phrase.
${aiContext ? `
## Application Context for ${orgName}
${aiContext}

## Classification Rules
- Feature works but user is confused → support
- Feature should work but doesn't → incident
- Hardware/software defect under contract → warranty
- Feature doesn't exist → backlog
- Standard change (access, install, config) → request
- Only answer based on the context above. If unsure, say so.` : ''}`;

    try {
      const { generateText } = await import('ai');
      let articles: any[] = [];
      let ticketCreated: any = null;
      let responseText = '';
      let persistedConversationId = conversationId;

      // ── Persist user message ─────────────────────────────────────────
      if (orgId && persistedConversationId) {
        try {
          await svc.from('inbox_messages').insert({
            tenant_id: (await svc.from('organizations').select('tenant_id').eq('id', orgId).single()).data?.tenant_id,
            conversation_id: persistedConversationId,
            direction: 'inbound',
            sender_type: 'contact',
            content_text: lastUserMsg,
            metadata: attachments?.length ? { attachments } : {},
          });
        } catch { /* persistence is optional */ }
      }

      // ── Ticket Creation Flow ─────────────────────────────────────────
      if (wantsTicket) {
        const conversationSummary = portalMessages
          .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
          .join('\n');

        // Classify
        const classifyResult = await generateText({
          model: openai('gpt-4o-mini'),
          system: `You are a ticket classifier. Analyze the conversation and return ONLY a JSON object:
{ "title": "brief summary (Spanish, max 100 chars)", "description": "detailed description (Spanish)", "type": "incident|request|warranty|support|backlog", "urgency": "low|medium|high|critical" }
Return ONLY valid JSON.`,
          messages: [{ role: 'user', content: conversationSummary }],
          temperature: 0.2,
          maxTokens: 512,
        });

        let ticketTitle = 'Solicitud de soporte desde portal';
        let ticketDesc = conversationSummary;
        let ticketType = 'request';
        let ticketUrgency = 'medium';

        try {
          const cleaned = classifyResult.text.replace(/```json\s*|\s*```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          ticketTitle = (parsed.title ?? ticketTitle).slice(0, 255);
          ticketDesc = (parsed.description ?? ticketDesc).slice(0, 10000);
          ticketType = ['incident', 'request', 'warranty', 'support', 'backlog'].includes(parsed.type) ? parsed.type : 'request';
          ticketUrgency = ['low', 'medium', 'high', 'critical'].includes(parsed.urgency) ? parsed.urgency : 'medium';
        } catch { /* defaults */ }

        // Resolve tenant_id
        let tenantId: string | undefined;
        if (user) {
          const { data: agent } = await client.from('agents').select('tenant_id').eq('user_id', user.id).maybeSingle();
          tenantId = agent?.tenant_id;
        }
        if (!tenantId && orgId) {
          const { data: orgRow } = await svc.from('organizations').select('tenant_id').eq('id', orgId).maybeSingle();
          tenantId = orgRow?.tenant_id;
        }

        if (tenantId) {
          // Create ticket
          const { data: ticket, error: ticketError } = await svc
            .from('tickets')
            .insert({
              title: ticketTitle,
              description: ticketDesc,
              type: ticketType,
              urgency: ticketUrgency,
              status: 'new',
              channel: 'portal',
              tenant_id: tenantId,
              organization_id: orgId || null,
              requester_email: portalUserEmail || user?.email || null,
              created_by: user?.id || null,
            })
            .select('id, ticket_number, title, type, urgency')
            .single();

          if (ticket) {
            // Auto-create organization_user if email provided and org known
            if (portalUserEmail && orgId && tenantId) {
              try {
                const { data: existing } = await svc.from('organization_users')
                  .select('id').eq('email', portalUserEmail).eq('organization_id', orgId).maybeSingle();
                if (!existing) {
                  await svc.from('organization_users').insert({
                    tenant_id: tenantId, organization_id: orgId,
                    name: portalUserName || portalUserEmail.split('@')[0] || 'Portal User',
                    email: portalUserEmail, role: 'user', is_active: true,
                  });
                }
              } catch { /* non-critical */ }
            }

            ticketCreated = {
              ticketId: ticket.id,
              ticketNumber: ticket.ticket_number,
              title: ticket.title,
              type: ticket.type,
              urgency: ticket.urgency,
            };
            responseText = `He creado el ticket de soporte **${ticket.ticket_number}** con el título "${ticket.title}". ` +
              `Nuestro equipo lo revisará y te contactará pronto. ` +
              `Puedes hacer seguimiento desde la sección "Mis Tickets" en el portal.`;

            // Link conversation to ticket
            if (persistedConversationId) {
              try { await svc.from('inbox_conversations').update({ ticket_id: ticket.id }).eq('id', persistedConversationId); } catch { /* optional */ }
            }

            // Save attachments to ticket
            if (attachments?.length) {
              const attachRows = attachments.map(a => ({
                tenant_id: tenantId!,
                ticket_id: ticket.id,
                file_name: a.fileName,
                file_url: a.path,
                file_type: a.fileType,
                uploaded_by: user?.id || null,
              }));
              try { await svc.from('ticket_attachments').insert(attachRows); } catch { /* optional */ }
            }
          } else {
            console.error('[AI Chat Portal] Ticket creation failed:', ticketError?.message);
            responseText = `Intenté crear el ticket pero hubo un error: ${ticketError?.message ?? 'desconocido'}. Por favor intenta de nuevo.`;
          }
        } else {
          responseText = 'No se pudo identificar tu organización para crear el ticket.';
        }

        // Persist AI response
        if (persistedConversationId && tenantId) {
          try {
            await svc.from('inbox_messages').insert({
              tenant_id: tenantId,
              conversation_id: persistedConversationId,
              direction: 'outbound',
              sender_type: 'ai_agent',
              content_text: responseText,
              metadata: ticketCreated ? { ticketCreated } : {},
            });
          } catch { /* optional */ }
        }

        return Response.json({ text: responseText, articles, ticketCreated, conversationId: persistedConversationId });
      }

      // ── Normal Chat Flow ─────────────────────────────────────────────
      // KB search
      const searchTerms = lastUserMsg.split(' ').filter((w: string) => w.length > 3).slice(0, 4);
      let kbContext = '';

      if (searchTerms.length > 0) {
        try {
          const { data: kbResults } = await svc
            .from('kb_articles')
            .select('id, title, slug, content_markdown')
            .eq('status', 'published')
            .or(searchTerms.map((t: string) => `title.ilike.%${t}%`).join(','))
            .limit(3);

          if (kbResults?.length) {
            articles = kbResults.map((a: any) => ({
              id: a.id, title: a.title, slug: a.slug,
              preview: (a.content_markdown ?? '').slice(0, 200),
            }));
            kbContext = '\n\nArtículos relevantes de la KB:\n' +
              kbResults.map((a: any, i: number) => `${i + 1}. "${a.title}": ${(a.content_markdown ?? '').slice(0, 300)}`).join('\n');
          }
        } catch { /* optional */ }
      }

      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: portalSystemPrompt + kbContext,
        messages: portalMessages,
        temperature: 0.4,
        maxTokens: 1024,
      });

      // Clean trigger phrase from response
      let aiText = result.text.replace(/CREAR_TICKET_AHORA/gi, '').trim();

      // Create conversation if first message
      if (orgId && !persistedConversationId) {
        try {
          const { data: orgRow } = await svc.from('organizations').select('tenant_id').eq('id', orgId).single();
          if (orgRow) {
            // Find or create a portal AI channel for this tenant
            let channelId: string | null = null;
            const { data: ch } = await svc.from('inbox_channels')
              .select('id')
              .eq('tenant_id', orgRow.tenant_id)
              .eq('name', 'Portal AI Chat')
              .maybeSingle();
            channelId = ch?.id ?? null;

            if (!channelId) {
              const { data: newCh } = await svc.from('inbox_channels').insert({
                tenant_id: orgRow.tenant_id,
                channel_type: 'web_widget',
                name: 'Portal AI Chat',
                is_active: true,
                ai_processing: true,
              }).select('id').single();
              channelId = newCh?.id ?? null;
            }

            const { data: conv } = await svc.from('inbox_conversations').insert({
              tenant_id: orgRow.tenant_id,
              channel_id: channelId,
              organization_id: orgId,
              status: 'open',
              subject: lastUserMsg.slice(0, 100),
              last_message_at: new Date().toISOString(),
              metadata: {
                portal_org_id: orgId,
                portal_user_email: portalUserEmail,
                portal_user_name: portalUserName,
              },
            }).select('id').single();

            persistedConversationId = conv?.id;

            // Save the user message
            if (persistedConversationId) {
              await svc.from('inbox_messages').insert({
                tenant_id: orgRow.tenant_id,
                conversation_id: persistedConversationId,
                direction: 'inbound',
                sender_type: 'contact',
                content_text: lastUserMsg,
              });
            }
          }
        } catch { /* optional */ }
      }

      // Persist AI response
      if (persistedConversationId) {
        try {
          const { data: orgRow } = await svc.from('organizations').select('tenant_id').eq('id', orgId!).single();
          if (orgRow) {
            await svc.from('inbox_messages').insert({
              tenant_id: orgRow.tenant_id,
              conversation_id: persistedConversationId,
              direction: 'outbound',
              sender_type: 'ai_agent',
              content_text: aiText,
              metadata: articles.length ? { articles } : {},
            });
            await svc.from('inbox_conversations').update({
              last_message_at: new Date().toISOString(),
            }).eq('id', persistedConversationId);
          }
        } catch { /* optional */ }
      }

      return Response.json({
        text: aiText,
        articles,
        ticketCreated: null,
        conversationId: persistedConversationId,
      });
    } catch (err) {
      console.error('[AI Chat Portal] Error:', err);
      return Response.json(
        { error: 'AI portal chat failed', details: err instanceof Error ? err.message : 'Unknown' },
        { status: 500 },
      );
    }
  }

  // ── Internal Mode (UNCHANGED) ─────────────────────────────────────────────
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messages, ticketContext } = body as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    ticketContext?: {
      ticketId?: string; title?: string; description?: string;
      status?: string; type?: string; urgency?: string; category?: string;
    };
  };

  if (!messages?.length) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  let systemPrompt =
    'You are NovaDesk AI, an intelligent ITSM assistant. ' +
    'You help IT service desk agents resolve tickets, suggest solutions, ' +
    'classify issues, and provide guidance based on ITIL best practices. ' +
    'Keep responses concise, actionable, and professional.';

  if (ticketContext) {
    systemPrompt += `\n\nCurrent ticket:\n- Title: ${ticketContext.title ?? 'N/A'}\n- Description: ${ticketContext.description ?? 'N/A'}\n- Status: ${ticketContext.status ?? 'N/A'}\n- Type: ${ticketContext.type ?? 'N/A'}\n- Urgency: ${ticketContext.urgency ?? 'N/A'}`;
  }

  try {
    const { generateText } = await import('ai');
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages,
      temperature: 0.4,
      maxTokens: 1024,
    });

    return new Response(result.text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('[AI Chat] Error:', err);
    return Response.json(
      { error: 'AI chat failed', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
