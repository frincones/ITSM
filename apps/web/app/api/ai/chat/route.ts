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
- Detect urgency from context (low, medium, high, critical)`;

    try {
      // Pre-search KB for context (before AI call)
      const lastUserMsg = portalMessages.filter(m => m.role === 'user').pop()?.content ?? '';
      const searchTerms = lastUserMsg.split(' ').filter((w: string) => w.length > 3).slice(0, 4);
      let kbContext = '';
      let articles: any[] = [];

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

      const { generateText } = await import('ai');

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
