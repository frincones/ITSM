import { NextRequest, NextResponse } from 'next/server';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/* -------------------------------------------------------------------------- */
/*  POST /api/ai/suggest — Solution Suggestions                               */
/* -------------------------------------------------------------------------- */

const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string().describe('Short solution title'),
      description: z
        .string()
        .describe('Step-by-step resolution instructions'),
      confidence: z.number().min(0).max(100),
      source: z
        .enum(['knowledge_base', 'similar_ticket', 'ai_generated'])
        .describe('Where the suggestion originated'),
      sourceId: z
        .string()
        .optional()
        .describe('ID of the KB article or ticket'),
    }),
  ),
});

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
  const { ticketId, title, description, category } = body as {
    ticketId?: string;
    title?: string;
    description?: string;
    category?: string;
  };

  // ── Resolve ticket data ───────────────────────────────────────────────────
  let ticketTitle = title ?? '';
  let ticketDescription = description ?? '';
  let ticketCategory = category ?? '';
  let tenantId: string | null = null;

  // Get agent tenant
  const { data: agent } = await client
    .from('agents')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  tenantId = agent?.tenant_id ?? null;

  if (ticketId) {
    const { data: ticket } = await client
      .from('tickets')
      .select(
        '*, category:categories!tickets_category_id_fkey(id, name)',
      )
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 },
      );
    }

    ticketTitle = ticket.title;
    ticketDescription = ticket.description ?? '';
    ticketCategory = (ticket.category as { name: string } | null)?.name ?? '';
    tenantId = ticket.tenant_id;
  }

  if (!ticketTitle) {
    return NextResponse.json(
      { error: 'Either ticketId or title is required' },
      { status: 400 },
    );
  }

  // ── RAG: Fetch relevant KB articles ───────────────────────────────────────
  let kbContext = '';

  if (tenantId) {
    // Search knowledge documents by keyword (text match since embedding
    // generation depends on external pipeline). Fall back gracefully.
    const { data: kbDocs } = await client
      .from('knowledge_documents')
      .select('id, title, content, source_type')
      .eq('tenant_id', tenantId)
      .textSearch('content', ticketTitle.split(' ').slice(0, 5).join(' | '), {
        type: 'websearch',
        config: 'english',
      })
      .limit(5);

    if (kbDocs && kbDocs.length > 0) {
      kbContext =
        '\n\nRelevant Knowledge Base articles:\n' +
        kbDocs
          .map(
            (doc, i) =>
              `${i + 1}. [${doc.source_type}] ${doc.title}\n   ${doc.content.slice(0, 300)}...`,
          )
          .join('\n');
    }

    // Also check previous solutions for similar tickets
    const { data: similarSolutions } = await client
      .from('ticket_solutions')
      .select(
        'id, content, ticket:tickets!ticket_solutions_ticket_id_fkey(title)',
      )
      .limit(3);

    if (similarSolutions && similarSolutions.length > 0) {
      kbContext +=
        '\n\nPrevious ticket solutions:\n' +
        similarSolutions
          .map(
            (sol, i) =>
              `${i + 1}. Ticket: ${(sol.ticket as { title: string } | null)?.title ?? 'Unknown'}\n   Solution: ${sol.content.slice(0, 300)}`,
          )
          .join('\n');
    }
  }

  // ── AI Suggestion Generation ─────────────────────────────────────────────
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: suggestionsSchema,
      prompt:
        `You are a resolution agent for an ITSM platform. Suggest solutions for this ticket.\n\n` +
        `Title: ${ticketTitle}\n` +
        `Description: ${ticketDescription}\n` +
        `Category: ${ticketCategory || 'Uncategorized'}\n` +
        kbContext +
        `\n\nProvide 2-4 actionable solutions ranked by confidence. ` +
        `If knowledge base articles are relevant, reference them. ` +
        `Include step-by-step instructions in each suggestion.`,
      temperature: 0.3,
    });

    return NextResponse.json(object);
  } catch (err) {
    console.error('[AI Suggest Error]', err);
    return NextResponse.json(
      { error: 'Suggestion generation failed' },
      { status: 500 },
    );
  }
}
