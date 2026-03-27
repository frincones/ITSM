import { NextRequest } from 'next/server';

import { streamText } from 'ai';
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

  // ── Stream response ───────────────────────────────────────────────────────
  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: systemPrompt,
    messages,
    temperature: 0.4,
    maxTokens: 1024,
  });

  return result.toDataStreamResponse();
}
