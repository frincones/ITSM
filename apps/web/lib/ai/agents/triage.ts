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
  organizationContext?: string;
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

    const orgContextBlock = ticket.organizationContext
      ? `\n\nApplication context for the client:\n${ticket.organizationContext}\n\nUse this context to classify more accurately:\n- If the reported issue IS a feature that exists and works → "support" (user error/doesn't know how)\n- If the reported issue IS a feature that exists but is broken → "incident"\n- If it references hardware/software under contract → "warranty"\n- If the user asks for something that DOES NOT exist → "backlog"\n- If it's a standard change (access, install, config) → "request"`
      : '';

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are an ITSM triage agent for NovaDesk. Classify incoming tickets accurately.

Ticket types: incident, request, warranty, support, backlog.
Urgency levels: low, medium, high, critical.
Sentiment options: positive, neutral, negative, frustrated.

Classification rules (apply in this order):
1. "incident" = something that WAS working is now broken or degraded. Key test: "Did this work before?" → Yes = incident.
2. "warranty" = hardware or software defect claim under a service contract. Key test: "Is there a contractual obligation to repair/replace?" → Yes = warranty.
3. "request" = user wants something new, standard, or a change to their setup. Key test: "Is the user asking for a new service or change?" → Yes = request.
4. "support" = user needs help understanding how to use existing functionality. Key test: "Does the feature work correctly but the user doesn't know how?" → Yes = support.
5. "backlog" = enhancement suggestion or non-urgent improvement idea. Key test: "Is this about NEW functionality that doesn't exist?" → Yes = backlog.

Disambiguation:
- If the user says "X doesn't work" but X was never a feature → backlog, not incident.
- If the system works as designed but the user is confused → support, not incident.
- If unclear between incident and support: is there an error message? → incident.
- When confidence < 0.7, the ticket should be flagged for human review.
- Confidence is a float between 0 and 1.
- Summary should be 1-2 sentences max.
${orgContextBlock}

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
      temperature: 0,
    });

    const parsed = JSON.parse(result.text) as TriageResult;

    return { data: parsed, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown triage error';
    return { data: null, error: message };
  }
}
