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
      const { generateText, tool } = await import('ai');
      const { z } = await import('zod');

      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: portalSystemPrompt,
        messages: portalMessages,
        tools: {
          searchKnowledgeBase: tool({
            description:
              'Search the knowledge base for articles related to the user query',
            parameters: z.object({
              query: z.string().describe('Search query'),
            }),
            execute: async ({ query }) => {
              const searchClient = getSupabaseServerClient();
              const searchTerms = query
                .split(' ')
                .filter((w) => w.length > 3)
                .slice(0, 3);

              if (searchTerms.length === 0) return { articles: [] };

              const { data } = await searchClient
                .from('kb_articles')
                .select('id, title, slug, content_markdown')
                .eq('status', 'published')
                .or(
                  searchTerms.map((t) => `title.ilike.%${t}%`).join(','),
                )
                .limit(3);

              return {
                articles: (data ?? []).map((a: any) => ({
                  id: a.id,
                  title: a.title,
                  slug: a.slug,
                  preview: (a.content_markdown ?? '').slice(0, 200),
                })),
              };
            },
          }),

          createSupportTicket: tool({
            description:
              'Create a support ticket when the AI cannot resolve the issue. Include all conversation context.',
            parameters: z.object({
              title: z
                .string()
                .describe('Ticket title summarizing the issue'),
              description: z
                .string()
                .describe(
                  'Detailed description including all info from the conversation',
                ),
              type: z.enum([
                'incident',
                'request',
                'warranty',
                'support',
                'backlog',
              ]),
              urgency: z.enum(['low', 'medium', 'high', 'critical']),
            }),
            execute: async ({ title, description, type, urgency }) => {
              // Get tenant info from the authenticated user
              const ticketClient = getSupabaseServerClient();

              const { data: agent } = await ticketClient
                .from('agents')
                .select('id, tenant_id')
                .eq('user_id', user.id)
                .maybeSingle();

              const { data: orgUser } = await ticketClient
                .from('organization_users')
                .select('tenant_id, organization_id')
                .eq('user_id', user.id)
                .maybeSingle();

              const tenantId =
                agent?.tenant_id ?? (orgUser as any)?.tenant_id;
              const organizationId =
                orgId ?? (orgUser as any)?.organization_id;

              if (!tenantId) return { error: 'No tenant found' };

              // Try to use admin client (service role) for insert, fall back to regular client
              let insertClient: any;

              try {
                const { getSupabaseServerAdminClient } = await import(
                  '@kit/supabase/server-admin-client'
                );
                insertClient = getSupabaseServerAdminClient();
              } catch {
                // Admin client not available — fall back to regular client
                insertClient = ticketClient;
              }

              const { data: ticket, error: insertError } = await insertClient
                .from('tickets')
                .insert({
                  tenant_id: tenantId,
                  organization_id: organizationId,
                  title,
                  description,
                  type,
                  urgency,
                  impact: urgency,
                  status: 'new',
                  channel: 'ai_agent',
                  requester_email: user.email,
                  created_by: user.id,
                  tags: ['portal', 'ai-created'],
                  ai_summary: `Ticket created by AI assistant after conversation. Type: ${type}, Urgency: ${urgency}.`,
                })
                .select('id, ticket_number, title, type, urgency, status')
                .single();

              if (insertError) return { error: insertError.message };

              return {
                ticket: {
                  id: ticket.id,
                  number: ticket.ticket_number,
                  title: ticket.title,
                  type: ticket.type,
                  urgency: ticket.urgency,
                  status: ticket.status,
                },
              };
            },
          }),
        },
        maxSteps: 3,
        temperature: 0.4,
        maxTokens: 1024,
      });

      // Extract tool results from steps
      let articles: any[] = [];
      let ticketCreated: any = null;

      for (const step of result.steps ?? []) {
        for (const tc of step.toolCalls ?? []) {
          const toolResult = (tc as any).result;

          if (
            tc.toolName === 'searchKnowledgeBase' &&
            toolResult?.articles
          ) {
            articles = toolResult.articles;
          }

          if (
            tc.toolName === 'createSupportTicket' &&
            toolResult?.ticket
          ) {
            ticketCreated = toolResult.ticket;
          }
        }
      }

      return Response.json({
        text: result.text,
        articles,
        ticketCreated,
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
