import { NextRequest } from 'next/server';

import { openai } from '@ai-sdk/openai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/* -------------------------------------------------------------------------- */
/*  POST /api/ai/chat — Streaming AI Chat                                     */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const client = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json();

  // ── Portal Mode (with tools) ─────────────────────────────────────────────
  if (body.portalContext) {
    const { orgId, orgName, userName } = body.portalContext as {
      orgId?: string;
      orgName?: string;
      userName?: string;
    };

    const portalMessages = body.messages as Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>;

    if (
      !portalMessages ||
      !Array.isArray(portalMessages) ||
      portalMessages.length === 0
    ) {
      return Response.json(
        { error: 'messages array is required' },
        { status: 400 },
      );
    }

    // Detect if user wants to create a ticket
    const lastUserMsg = portalMessages.filter(m => m.role === 'user').pop()?.content ?? '';
    const wantsTicket = /crear\s*ticket|no\s*se\s*resolvi|no\s*resol|abrir\s*caso|necesito\s*ticket|crear\s*caso|escalar/i.test(lastUserMsg);

    // Fetch AI context for this organization (if configured)
    let aiContext = '';
    if (orgId) {
      try {
        const { data: orgData } = await client
          .from('organizations')
          .select('ai_context')
          .eq('id', orgId)
          .maybeSingle();
        aiContext = orgData?.ai_context ?? '';
      } catch { /* optional — chat works without context */ }
    }

    const portalSystemPrompt = `You are the AI support assistant for ${orgName ?? 'the organization'}.
You help employees resolve IT issues. You speak in Spanish by default.

Your capabilities:
1. Search the knowledge base for relevant articles
2. Create support tickets when you cannot resolve the issue

Rules:
- Always try to help first before creating a ticket
- When searching KB, cite the article title and provide the link
- When creating a ticket, include all conversation context
- Be friendly, professional, and concise
- If the user confirms the issue is resolved, congratulate them
- If the user says it's not resolved after 2-3 attempts, offer to create a ticket
- Classify tickets as: incident, request, warranty, support, or backlog
- Detect urgency from context (low, medium, high, critical)
${aiContext ? `
## Application Context for ${orgName}
${aiContext}

## Classification Rules (based on context above)
- If the user reports something that DOES work according to the context → type: support (user doesn't know how to use it, guide them)
- If the user reports something that SHOULD work but DOESN'T → type: incident (something is broken)
- If it's a hardware/software defect under contract → type: warranty
- If the user asks for something that DOESN'T EXIST in the context → type: backlog (feature request)
- If the user asks for a standard change (access, installation, configuration) → type: request
- IMPORTANT: Only answer based on the context above and KB articles. If unsure, say so honestly.` : ''}`;


    try {
      const { generateText } = await import('ai');
      let articles: any[] = [];
      let ticketCreated: any = null;
      let responseText = '';

      // ── Ticket Creation Flow ──────────────────────────────────────────
      if (wantsTicket) {
        // Step 1: Ask AI to classify the conversation into ticket fields (JSON only)
        const conversationSummary = portalMessages
          .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
          .join('\n');

        const classifyResult = await generateText({
          model: openai('gpt-4o-mini'),
          system: `You are a ticket classifier. Analyze the conversation and return ONLY a JSON object with these fields:
- title: brief summary of the issue (max 100 chars, in Spanish)
- description: detailed description including all context from the conversation (in Spanish)
- type: one of "incident", "request", "warranty", "support", "backlog"
- urgency: one of "low", "medium", "high", "critical"
Return ONLY valid JSON, no markdown, no explanation.`,
          messages: [{ role: 'user', content: conversationSummary }],
          temperature: 0.2,
          maxTokens: 512,
        });

        // Parse the classification
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
        } catch { /* use defaults */ }

        // Step 2: Resolve tenant_id (try agent first, fall back to org)
        let tenantId: string | undefined;

        const { data: agent } = await client
          .from('agents')
          .select('id, tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();

        tenantId = agent?.tenant_id;

        // If user is not an agent, resolve tenant_id from the organization
        if (!tenantId && orgId) {
          const { data: orgRow } = await client
            .from('organizations')
            .select('tenant_id')
            .eq('id', orgId)
            .maybeSingle();
          tenantId = orgRow?.tenant_id;
        }

        // Step 3: Create the ticket in Supabase
        if (tenantId) {
          const { data: ticket, error: ticketError } = await client
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
              requester_email: user.email ?? null,
              created_by: user.id,
            })
            .select('id, ticket_number, title, type, urgency')
            .single();

          if (ticket) {
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
          } else {
            console.error('[AI Chat Portal] Ticket creation failed:', ticketError?.message, ticketError?.details, ticketError?.hint);
            responseText = `Intenté crear el ticket pero hubo un error: ${ticketError?.message ?? 'desconocido'}. Por favor intenta de nuevo.`;
          }
        } else {
          responseText = 'No se pudo identificar tu organización para crear el ticket. Por favor contacta al soporte directamente.';
        }

        return Response.json({ text: responseText, articles, ticketCreated });
      }

      // ── Normal Chat Flow ──────────────────────────────────────────────
      // Pre-search KB for context (before AI call)
      const searchTerms = lastUserMsg.split(' ').filter((w: string) => w.length > 3).slice(0, 4);
      let kbContext = '';

      if (searchTerms.length > 0) {
        try {
          const { data: kbResults } = await client
            .from('kb_articles')
            .select('id, title, slug, content_markdown')
            .eq('status', 'published')
            .or(searchTerms.map((t: string) => `title.ilike.%${t}%`).join(','))
            .limit(3);

          if (kbResults && kbResults.length > 0) {
            articles = kbResults.map((a: any) => ({
              id: a.id,
              title: a.title,
              slug: a.slug,
              preview: (a.content_markdown ?? '').slice(0, 200),
            }));
            kbContext = '\n\nArtículos relevantes encontrados en la base de conocimiento:\n' +
              kbResults.map((a: any, i: number) => `${i + 1}. "${a.title}": ${(a.content_markdown ?? '').slice(0, 300)}`).join('\n');
          }
        } catch { /* KB search optional */ }
      }

      const fullSystemPrompt = portalSystemPrompt + kbContext;

      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: fullSystemPrompt,
        messages: portalMessages,
        temperature: 0.4,
        maxTokens: 1024,
      });

      return Response.json({
        text: result.text,
        articles,
        ticketCreated: null,
      });
    } catch (err) {
      console.error('[AI Chat Portal] Error:', err);

      return Response.json(
        {
          error: 'AI portal chat failed',
          details: err instanceof Error ? err.message : 'Unknown',
        },
        { status: 500 },
      );
    }
  }

  // ── Internal Mode (UNCHANGED) ─────────────────────────────────────────────
  const { messages, ticketContext } = body as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    ticketContext?: {
      ticketId?: string;
      title?: string;
      description?: string;
      status?: string;
      type?: string;
      urgency?: string;
      category?: string;
    };
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'messages array is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── Build system prompt ───────────────────────────────────────────────────
  let systemPrompt =
    'You are NovaDesk AI, an intelligent ITSM assistant. ' +
    'You help IT service desk agents resolve tickets, suggest solutions, ' +
    'classify issues, and provide guidance based on ITIL best practices. ' +
    'Keep responses concise, actionable, and professional.';

  if (ticketContext) {
    systemPrompt +=
      '\n\nCurrent ticket context:\n' +
      `- Ticket ID: ${ticketContext.ticketId ?? 'N/A'}\n` +
      `- Title: ${ticketContext.title ?? 'N/A'}\n` +
      `- Description: ${ticketContext.description ?? 'N/A'}\n` +
      `- Status: ${ticketContext.status ?? 'N/A'}\n` +
      `- Type: ${ticketContext.type ?? 'N/A'}\n` +
      `- Urgency: ${ticketContext.urgency ?? 'N/A'}\n` +
      `- Category: ${ticketContext.category ?? 'N/A'}`;
  }

  // ── Generate response (non-streaming for reliability) ─────────────────────
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
    return new Response(
      JSON.stringify({ error: 'AI chat failed', details: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
