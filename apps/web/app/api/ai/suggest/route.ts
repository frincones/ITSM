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
      .select('*')
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
    tenantId = ticket.tenant_id;

    if (ticket.category_id) {
      const { data: cat } = await client
        .from('categories')
        .select('name')
        .eq('id', ticket.category_id)
        .single();
      ticketCategory = cat?.name ?? '';
    }
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
    // Search knowledge documents by keyword match (ilike)
    try {
      const searchTerms = ticketTitle.split(' ').filter(w => w.length > 3).slice(0, 3);
      if (searchTerms.length > 0) {
        const { data: kbDocs } = await client
          .from('knowledge_documents')
          .select('id, title, content, source_type')
          .eq('tenant_id', tenantId)
          .or(searchTerms.map(t => `title.ilike.%${t}%`).join(','))
          .limit(5);

        if (kbDocs && kbDocs.length > 0) {
          kbContext =
            '\n\nRelevant Knowledge Base articles:\n' +
            kbDocs
              .map(
                (doc: any, i: number) =>
                  `${i + 1}. [${doc.source_type}] ${doc.title}\n   ${(doc.content ?? '').slice(0, 300)}...`,
              )
              .join('\n');
        }
      }
    } catch { /* KB search is optional, continue without it */ }

    // Previous ticket solutions (simple query, no FK hints)
    try {
      const { data: similarSolutions } = await client
        .from('ticket_solutions')
        .select('id, content, ticket_id')
        .limit(3);

      if (similarSolutions && similarSolutions.length > 0) {
        kbContext +=
          '\n\nPrevious ticket solutions:\n' +
          similarSolutions
            .map(
              (sol: any, i: number) =>
                `${i + 1}. Solution: ${(sol.content ?? '').slice(0, 300)}`,
            )
            .join('\n');
      }
    } catch { /* Solutions search is optional */ }
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
