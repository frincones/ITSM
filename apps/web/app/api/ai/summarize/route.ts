import { NextRequest, NextResponse } from 'next/server';

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/* -------------------------------------------------------------------------- */
/*  POST /api/ai/summarize — Ticket Summarization                             */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const client = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json();
  const { ticketId } = body as { ticketId: string };

  if (!ticketId) {
    return NextResponse.json(
      { error: 'ticketId is required' },
      { status: 400 },
    );
  }

  // ── Fetch ticket + related data ──────────────────────────────────────────
  const { data: ticket, error: ticketError } = await client
    .from('tickets')
    .select(
      `
      *,
      assigned_agent:agents!tickets_assigned_agent_id_fkey(id, name),
      assigned_group:groups!tickets_assigned_group_id_fkey(id, name),
      category:categories!tickets_category_id_fkey(id, name)
    `,
    )
    .eq('id', ticketId)
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json(
      { error: 'Ticket not found' },
      { status: 404 },
    );
  }

  // Fetch followups
  const { data: followups } = await client
    .from('ticket_followups')
    .select(
      '*, author:agents!ticket_followups_created_by_fkey(id, name)',
    )
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  // Fetch solutions
  const { data: solutions } = await client
    .from('ticket_solutions')
    .select(
      '*, author:agents!ticket_solutions_created_by_fkey(id, name)',
    )
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  // ── Build context for summarization ──────────────────────────────────────
  let context =
    `Ticket #${ticket.ticket_number ?? ticket.id.slice(0, 8)}\n` +
    `Title: ${ticket.title}\n` +
    `Status: ${ticket.status}\n` +
    `Type: ${ticket.type}\n` +
    `Urgency: ${ticket.urgency}\n` +
    `Category: ${(ticket.category as { name: string } | null)?.name ?? 'Uncategorized'}\n` +
    `Assigned to: ${(ticket.assigned_agent as { name: string } | null)?.name ?? 'Unassigned'}\n` +
    `Group: ${(ticket.assigned_group as { name: string } | null)?.name ?? 'None'}\n` +
    `Created: ${ticket.created_at}\n`;

  if (ticket.description) {
    context += `\nDescription:\n${ticket.description}\n`;
  }

  if (followups && followups.length > 0) {
    context += `\nFollowups (${followups.length}):\n`;
    for (const fu of followups) {
      const authorName =
        (fu.author as { name: string } | null)?.name ?? 'System';
      context += `- [${fu.created_at}] ${authorName}: ${fu.content}\n`;
    }
  }

  if (solutions && solutions.length > 0) {
    context += `\nSolutions (${solutions.length}):\n`;
    for (const sol of solutions) {
      const authorName =
        (sol.author as { name: string } | null)?.name ?? 'System';
      context += `- [${sol.created_at}] ${authorName}: ${sol.content}\n`;
    }
  }

  // ── AI Summarization ─────────────────────────────────────────────────────
  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system:
        'You are an ITSM analyst. Summarize the following ticket concisely. ' +
        'Include: (1) the core issue, (2) key actions taken, (3) current status, ' +
        'and (4) recommended next steps if the ticket is still open. ' +
        'Use bullet points. Keep it under 200 words.',
      prompt: context,
      temperature: 0.3,
      maxTokens: 512,
    });

    return NextResponse.json({
      summary: text,
      ticketId,
      followupCount: followups?.length ?? 0,
      solutionCount: solutions?.length ?? 0,
    });
  } catch (err) {
    console.error('[AI Summarize Error]', err);
    return NextResponse.json(
      { error: 'Summarization failed' },
      { status: 500 },
    );
  }
}
