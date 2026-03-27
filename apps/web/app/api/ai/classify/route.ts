import { NextRequest, NextResponse } from 'next/server';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/* -------------------------------------------------------------------------- */
/*  POST /api/ai/classify — Ticket Classification                             */
/* -------------------------------------------------------------------------- */

const classificationSchema = z.object({
  type: z.enum(['incident', 'request', 'warranty', 'support', 'backlog']),
  urgency: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string().describe('Suggested category name'),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence score 0-100'),
  reasoning: z.string().describe('Brief explanation of the classification'),
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
  const { title, description } = body as {
    title: string;
    description?: string;
  };

  if (!title) {
    return NextResponse.json(
      { error: 'title is required' },
      { status: 400 },
    );
  }

  // ── Fetch tenant categories for context ───────────────────────────────────
  const { data: agent } = await client
    .from('agents')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  let categoryNames: string[] = [];

  if (agent) {
    const { data: categories } = await client
      .from('categories')
      .select('name')
      .eq('tenant_id', agent.tenant_id)
      .order('name');

    categoryNames = (categories ?? []).map((c) => c.name);
  }

  // ── AI Classification ────────────────────────────────────────────────────
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: classificationSchema,
      prompt:
        `Classify the following ITSM ticket.\n\n` +
        `Title: ${title}\n` +
        `Description: ${description ?? '(none)'}\n\n` +
        (categoryNames.length > 0
          ? `Available categories: ${categoryNames.join(', ')}\n\n`
          : '') +
        `Determine the ticket type (incident/request/warranty/support/backlog), ` +
        `urgency level (critical/high/medium/low), and best matching category. ` +
        `Provide a confidence score and brief reasoning.`,
      temperature: 0.2,
    });

    return NextResponse.json({ classification: object });
  } catch (err) {
    console.error('[AI Classify Error]', err);
    return NextResponse.json(
      { error: 'Classification failed' },
      { status: 500 },
    );
  }
}
