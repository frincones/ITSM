import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export interface KnowledgeInput {
  question: string;
  tenantId: string;
  category?: string;
  locale?: string;
}

export interface Citation {
  articleId: string;
  title: string;
  snippet: string;
  relevance: number;
}

export interface KnowledgeResult {
  answer: string;
  citations: Citation[];
  confidence: number;
  related_topics: string[];
  needs_human_review: boolean;
}

export async function queryKnowledge(
  input: KnowledgeInput,
): Promise<{ data: KnowledgeResult | null; error: string | null }> {
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are a knowledge agent for NovaDesk ITSM. You answer questions by searching the knowledge base using RAG.

Behavior:
- Always search the KB first before generating an answer.
- Provide accurate answers grounded in KB articles.
- Include citations with article IDs and relevant snippets.
- If the KB does not contain enough information, say so honestly and set needs_human_review to true.
- Confidence is 0.0 to 1.0 based on how well the KB covers the question.
- Suggest related topics the user might find helpful.
${input.locale ? `- Respond in locale: ${input.locale}` : ''}

Respond ONLY with valid JSON matching this schema:
{
  "answer": "<the_answer>",
  "citations": [{"articleId": "<id>", "title": "<title>", "snippet": "<relevant_excerpt>", "relevance": <0.0-1.0>}],
  "confidence": <0.0-1.0>,
  "related_topics": ["<topic1>", "<topic2>"],
  "needs_human_review": <boolean>
}`,
      prompt: `Tenant: ${input.tenantId}
${input.category ? `Category: ${input.category}` : ''}
Question: ${input.question}`,
      tools: {
        searchKB: tool({
          description:
            'Search the knowledge base for articles relevant to the question using RAG.',
          parameters: z.object({
            query: z.string().describe('The search query'),
            tenantId: z.string().describe('Tenant ID for scoping'),
            category: z.string().optional().describe('Category filter'),
            limit: z.number().optional().default(5),
          }),
          execute: async ({ query, tenantId, category, limit }) => {
            // TODO: Integrate with actual vector store / embeddings search
            return {
              results: [],
              query,
              tenantId,
              category,
              limit,
              message:
                'KB RAG search not yet implemented. Connect to your vector store.',
            };
          },
        }),
      },
      maxSteps: 3,
      temperature: 0.3,
    });

    const parsed = JSON.parse(result.text) as KnowledgeResult;

    return { data: parsed, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown knowledge agent error';
    return { data: null, error: message };
  }
}
