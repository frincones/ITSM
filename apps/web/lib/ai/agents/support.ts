import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SupportInput {
  message: string;
  conversationHistory: ConversationMessage[];
  tenantId: string;
  userId: string;
}

export interface SupportResult {
  response: string;
  sources: Array<{ title: string; id: string; relevance: number }>;
  should_escalate: boolean;
  escalation_reason?: string;
  suggested_ticket?: {
    title: string;
    description: string;
    type: string;
    urgency: string;
  };
}

export async function handleSupportQuery(
  input: SupportInput,
): Promise<{ data: SupportResult | null; error: string | null }> {
  try {
    const historyText = input.conversationHistory
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are a helpful ITSM support agent for NovaDesk. Your job is to assist end-users through the customer portal.

Behavior:
- Search the knowledge base first before answering.
- If you find a relevant KB article, provide a clear answer with citations.
- If you cannot resolve the issue, escalate by creating a ticket.
- Be friendly, professional, and concise.
- Always try to resolve the issue before escalating.

You have access to these tools:
- searchKB: Search the knowledge base for relevant articles.
- createTicket: Create a support ticket when escalation is needed.

Respond ONLY with valid JSON matching this schema:
{
  "response": "<your_response_to_the_user>",
  "sources": [{"title": "<article_title>", "id": "<article_id>", "relevance": <0.0-1.0>}],
  "should_escalate": <boolean>,
  "escalation_reason": "<reason_if_escalating>",
  "suggested_ticket": {"title": "<title>", "description": "<desc>", "type": "<type>", "urgency": "<urgency>"} | null
}`,
      prompt: `Tenant: ${input.tenantId}
User: ${input.userId}
Conversation history:
${historyText}

Current message: ${input.message}`,
      tools: {
        searchKB: tool({
          description:
            'Search the knowledge base for articles relevant to the user query.',
          parameters: z.object({
            query: z.string().describe('The search query'),
            tenantId: z.string().describe('The tenant ID for scoping results'),
            limit: z
              .number()
              .optional()
              .default(5)
              .describe('Max results to return'),
          }),
          execute: async ({ query, tenantId, limit }) => {
            // TODO: Integrate with actual KB search (vector/full-text)
            return {
              results: [],
              query,
              tenantId,
              limit,
              message:
                'KB search not yet implemented. Connect to your vector store.',
            };
          },
        }),
        createTicket: tool({
          description:
            'Create a support ticket when the issue cannot be resolved via KB.',
          parameters: z.object({
            title: z.string().describe('Ticket title'),
            description: z.string().describe('Ticket description'),
            type: z
              .enum(['incident', 'request', 'support'])
              .describe('Ticket type'),
            urgency: z
              .enum(['low', 'medium', 'high', 'critical'])
              .describe('Ticket urgency'),
            tenantId: z.string().describe('Tenant ID'),
            userId: z.string().describe('Reporting user ID'),
          }),
          execute: async (params) => {
            // TODO: Integrate with actual ticket creation service
            return {
              success: false,
              ticketId: null,
              message:
                'Ticket creation not yet implemented. Connect to your ticket service.',
              params,
            };
          },
        }),
      },
      maxSteps: 3,
      temperature: 0.3,
    });

    const parsed = JSON.parse(result.text) as SupportResult;

    return { data: parsed, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown support agent error';
    return { data: null, error: message };
  }
}
