import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export interface ResolutionInput {
  ticketId: string;
  title: string;
  description: string;
  category: string;
  type: string;
  tenantId: string;
  additionalContext?: string;
}

export interface SuggestedSolution {
  solution: string;
  confidence: number;
  source: 'kb' | 'similar_ticket' | 'ai_generated';
  source_id?: string;
  source_title?: string;
  steps: string[];
}

export interface ResolutionResult {
  suggestions: SuggestedSolution[];
  summary: string;
  estimated_complexity: 'simple' | 'moderate' | 'complex';
  requires_escalation: boolean;
  escalation_reason?: string;
}

export async function suggestResolution(
  input: ResolutionInput,
): Promise<{ data: ResolutionResult | null; error: string | null }> {
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are an ITSM resolution agent for NovaDesk. You help technicians resolve tickets by searching the knowledge base and similar resolved tickets.

Behavior:
- Use searchKB to find relevant knowledge base articles.
- Use searchSimilarTickets to find previously resolved similar tickets.
- Provide concrete, actionable solutions with step-by-step instructions.
- Rank solutions by confidence (0.0 to 1.0).
- Indicate if the issue requires escalation to a specialist.

Respond ONLY with valid JSON matching this schema:
{
  "suggestions": [
    {
      "solution": "<solution_description>",
      "confidence": <0.0-1.0>,
      "source": "<kb|similar_ticket|ai_generated>",
      "source_id": "<optional_source_id>",
      "source_title": "<optional_source_title>",
      "steps": ["<step1>", "<step2>", ...]
    }
  ],
  "summary": "<brief_analysis_of_the_issue>",
  "estimated_complexity": "<simple|moderate|complex>",
  "requires_escalation": <boolean>,
  "escalation_reason": "<optional_reason>"
}`,
      prompt: `Ticket ID: ${input.ticketId}
Title: ${input.title}
Description: ${input.description}
Category: ${input.category}
Type: ${input.type}
Tenant: ${input.tenantId}
${input.additionalContext ? `Additional context: ${input.additionalContext}` : ''}`,
      tools: {
        searchKB: tool({
          description:
            'Search the knowledge base for articles relevant to the ticket.',
          parameters: z.object({
            query: z.string().describe('The search query'),
            tenantId: z.string().describe('Tenant ID for scoping'),
            category: z
              .string()
              .optional()
              .describe('Category filter'),
            limit: z.number().optional().default(5),
          }),
          execute: async ({ query, tenantId, category, limit }) => {
            // TODO: Integrate with actual KB vector search
            return {
              results: [],
              query,
              tenantId,
              category,
              limit,
              message:
                'KB search not yet implemented. Connect to your vector store.',
            };
          },
        }),
        searchSimilarTickets: tool({
          description: 'Search for similar resolved tickets.',
          parameters: z.object({
            query: z.string().describe('Search query based on ticket content'),
            tenantId: z.string().describe('Tenant ID for scoping'),
            category: z
              .string()
              .optional()
              .describe('Category filter'),
            type: z.string().optional().describe('Ticket type filter'),
            limit: z.number().optional().default(5),
          }),
          execute: async ({ query, tenantId, category, type, limit }) => {
            // TODO: Integrate with actual ticket search (vector similarity)
            return {
              results: [],
              query,
              tenantId,
              category,
              type,
              limit,
              message:
                'Similar ticket search not yet implemented. Connect to your vector store.',
            };
          },
        }),
      },
      maxSteps: 3,
      temperature: 0.3,
    });

    const parsed = JSON.parse(result.text) as ResolutionResult;

    return { data: parsed, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown resolution agent error';
    return { data: null, error: message };
  }
}
