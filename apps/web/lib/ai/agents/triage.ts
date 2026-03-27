import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export type TicketType =
  | 'incident'
  | 'request'
  | 'warranty'
  | 'support'
  | 'backlog';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

export interface TriageInput {
  title: string;
  description: string;
  attachments?: string[];
}

export interface TriageResult {
  type: TicketType;
  urgency: Urgency;
  category_suggestion: string;
  confidence: number;
  sentiment: Sentiment;
  summary: string;
}

export async function triageTicket(
  ticket: TriageInput,
): Promise<{ data: TriageResult | null; error: string | null }> {
  try {
    const attachmentContext = ticket.attachments?.length
      ? `\nAttachments: ${ticket.attachments.join(', ')}`
      : '';

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are an ITSM triage agent for NovaDesk. Classify incoming tickets accurately.

Ticket types: incident, request, warranty, support, backlog.
Urgency levels: low, medium, high, critical.
Sentiment options: positive, neutral, negative, frustrated.

Rules:
- "incident" = something is broken or degraded in production.
- "request" = user asking for a new service, access, or change.
- "warranty" = hardware/software warranty claim.
- "support" = general help or how-to question.
- "backlog" = improvement suggestion or non-urgent enhancement.
- Confidence is a float between 0 and 1.
- Summary should be 1-2 sentences max.

Respond ONLY with valid JSON matching this schema:
{
  "type": "<ticket_type>",
  "urgency": "<urgency_level>",
  "category_suggestion": "<suggested_category>",
  "confidence": <0.0-1.0>,
  "sentiment": "<sentiment>",
  "summary": "<brief_summary>"
}`,
      prompt: `Title: ${ticket.title}\nDescription: ${ticket.description}${attachmentContext}`,
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.text) as TriageResult;

    return { data: parsed, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown triage error';
    return { data: null, error: message };
  }
}
