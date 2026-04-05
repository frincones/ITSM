import { NextRequest } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: agent } = await client.from('agents').select('id, tenant_id, name').eq('user_id', user.id).single();
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 403 });

    const { ticketId, action } = await req.json();
    if (!ticketId) return Response.json({ error: 'ticketId required' }, { status: 400 });

    const svc = getSvc();
    const tenantId = agent.tenant_id;

    // Fetch ticket with full context
    const { data: ticket } = await svc.from('tickets')
      .select('*')
      .eq('id', ticketId).eq('tenant_id', tenantId).single();

    if (!ticket) return Response.json({ error: 'Ticket not found' }, { status: 404 });

    // Fetch followups
    const { data: followups } = await svc.from('ticket_followups')
      .select('content, author_type, is_private, created_at')
      .eq('ticket_id', ticketId).order('created_at', { ascending: true }).limit(20);

    // Fetch solutions
    const { data: solutions } = await svc.from('ticket_solutions')
      .select('content, status, created_at')
      .eq('ticket_id', ticketId).limit(5);

    // Fetch org context
    let orgContext = '';
    let orgName = '';
    if (ticket.organization_id) {
      const { data: org } = await svc.from('organizations')
        .select('name, ai_context').eq('id', ticket.organization_id).single();
      orgContext = org?.ai_context ?? '';
      orgName = org?.name ?? '';
    }

    // Fetch agent name for assignment
    let assignedAgentName = 'Sin asignar';
    if (ticket.assigned_agent_id) {
      const { data: a } = await svc.from('agents').select('name').eq('id', ticket.assigned_agent_id).single();
      assignedAgentName = a?.name ?? 'Unknown';
    }

    // Fetch portal conversation if exists
    let portalChat = '';
    const { data: convs } = await svc.from('inbox_conversations')
      .select('id').eq('ticket_id', ticketId).limit(1);
    if (convs?.[0]) {
      const { data: msgs } = await svc.from('inbox_messages')
        .select('direction, sender_type, content_text')
        .eq('conversation_id', convs[0].id)
        .order('created_at', { ascending: true }).limit(10);
      if (msgs?.length) {
        portalChat = '\n\nConversación del portal:\n' +
          msgs.map((m: any) => `[${m.sender_type}] ${(m.content_text ?? '').slice(0, 200)}`).join('\n');
      }
    }

    // Search KB for relevant articles
    const searchTerms = (ticket.title ?? '').split(' ').filter((w: string) => w.length > 3).slice(0, 4);
    let kbArticles: Array<{ id: string; title: string; slug: string; preview: string }> = [];
    if (searchTerms.length > 0) {
      const { data: kbResults } = await svc.from('kb_articles')
        .select('id, title, slug, content_markdown')
        .eq('tenant_id', tenantId).eq('status', 'published')
        .or(searchTerms.map((t: string) => `title.ilike.%${t}%`).join(','))
        .limit(3);
      kbArticles = (kbResults ?? []).map((a: any) => ({
        id: a.id, title: a.title, slug: a.slug,
        preview: (a.content_markdown ?? '').slice(0, 200),
      }));
    }

    // Search similar resolved tickets
    let similarTickets: Array<{ ticket_number: string; title: string; solution: string }> = [];
    if (searchTerms.length > 0) {
      const { data: similar } = await svc.from('tickets')
        .select('ticket_number, title')
        .eq('tenant_id', tenantId).is('deleted_at', null)
        .in('status', ['resolved', 'closed'])
        .neq('id', ticketId)
        .or(searchTerms.map((t: string) => `title.ilike.%${t}%`).join(','))
        .limit(3);

      for (const t of similar ?? []) {
        const { data: sol } = await svc.from('ticket_solutions')
          .select('content').eq('ticket_id', (await svc.from('tickets').select('id').eq('ticket_number', t.ticket_number).single()).data?.id ?? '')
          .eq('status', 'approved').limit(1);
        similarTickets.push({
          ticket_number: t.ticket_number, title: t.title,
          solution: sol?.[0]?.content?.slice(0, 200) ?? 'Sin solución documentada',
        });
      }
    }

    // Build full context for LLM
    const ticketContext = `
Ticket: ${ticket.ticket_number} — "${ticket.title}"
Estado: ${ticket.status} | Tipo: ${ticket.type} | Urgencia: ${ticket.urgency}
Asignado a: ${assignedAgentName}
Cliente: ${orgName || 'N/A'}
Canal: ${ticket.channel ?? 'N/A'}
Creado: ${ticket.created_at}
Descripción: ${(ticket.description ?? '').slice(0, 1000)}

Followups (${followups?.length ?? 0}):
${(followups ?? []).map((f: any) => `[${f.author_type}${f.is_private ? '/privada' : ''}] ${f.content.slice(0, 200)}`).join('\n')}

Soluciones previas (${solutions?.length ?? 0}):
${(solutions ?? []).map((s: any) => `[${s.status}] ${s.content.slice(0, 200)}`).join('\n')}
${portalChat}
${orgContext ? `\nContexto del cliente ${orgName}:\n${orgContext.slice(0, 500)}` : ''}
`;

    // ── Generate AI analysis ────────────────────────────────────────
    const { generateText } = await import('ai');

    // Handle specific actions
    if (action === 'draft_reply') {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: `Eres un agente de soporte L1 profesional. Redacta una respuesta al requester del ticket.
Sé empático, claro y orientado a soluciones. Responde en español.
Si hay artículos KB relevantes, menciónalos. Si hay soluciones de tickets similares, úsalas como base.`,
        prompt: ticketContext + (kbArticles.length ? '\n\nArtículos KB relevantes:\n' + kbArticles.map(a => `- "${a.title}": ${a.preview}`).join('\n') : ''),
        temperature: 0.4, maxTokens: 500,
      });
      return Response.json({ draftReply: result.text });
    }

    if (action === 'rewrite_tone') {
      const { text, tone } = await req.json().catch(() => ({ text: '', tone: 'formal' }));
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: `Reescribe el siguiente texto en tono ${tone}. Mantén el significado. Responde solo con el texto reescrito.`,
        prompt: text, temperature: 0.3, maxTokens: 500,
      });
      return Response.json({ rewritten: result.text });
    }

    // Default: full analysis
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `Eres un AI Copilot para ITSM (NovaDesk). Analiza este ticket y responde SOLO con JSON válido.
Genera un análisis completo con este formato:
{
  "summary": "Resumen conciso del ticket en 2-3 oraciones (español)",
  "classification": {
    "type": "incident|request|warranty|support|backlog",
    "urgency": "low|medium|high|critical",
    "category_suggestion": "nombre de categoría sugerida",
    "confidence": 85
  },
  "sentiment": "positive|neutral|negative|frustrated",
  "sentiment_reason": "razón breve del sentimiento detectado",
  "suggested_reply": "borrador de respuesta al requester (español, máx 3 oraciones)",
  "internal_note": "nota interna sugerida para documentar la gestión (español)",
  "root_cause": "posible causa raíz si es incident, null si no aplica",
  "next_action": "siguiente acción recomendada (español)",
  "escalation_risk": false,
  "escalation_reason": "razón si debería escalar, null si no"
}
Responde SOLO JSON.`,
      prompt: ticketContext,
      temperature: 0.2, maxTokens: 1000,
    });

    let analysis: Record<string, unknown> = {};
    try {
      analysis = JSON.parse(result.text.replace(/```json\s*|\s*```/g, '').trim());
    } catch {
      analysis = { summary: result.text, error: 'Could not parse structured analysis' };
    }

    return Response.json({
      ...analysis,
      kbArticles,
      similarTickets,
      ticket: {
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        status: ticket.status,
        type: ticket.type,
        urgency: ticket.urgency,
        assigned_agent: assignedAgentName,
        organization: orgName,
      },
    });
  } catch (err) {
    console.error('[AI Copilot] Error:', err);
    return Response.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 });
  }
}
