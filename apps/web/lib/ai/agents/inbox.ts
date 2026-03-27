import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export type InboxChannel = 'email' | 'whatsapp' | 'sms' | 'chat' | 'portal' | 'api';

export interface InboxInput {
  channel: InboxChannel;
  from: string;
  subject?: string;
  body: string;
  tenantId: string;
  metadata?: Record<string, string>;
}

export interface InboxResult {
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
  type: 'incident' | 'request' | 'warranty' | 'support' | 'backlog' | 'spam' | 'auto_reply';
  language: string;
  summary: string;
  action: 'create_ticket' | 'auto_respond' | 'ignore' | 'merge_existing';
  auto_response?: string;
  suggested_ticket?: {
    title: string;
    description: string;
    type: string;
    urgency: string;
    category: string;
  };
  existing_ticket_id?: string;
  confidence: number;
}

export async function processInboxMessage(
  input: InboxInput,
): Promise<{ data: InboxResult | null; error: string | null }> {
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are an inbox processing agent for NovaDesk ITSM. You analyze incoming messages from various channels (email, WhatsApp, SMS, chat, portal, API).

Your responsibilities:
- Classify the message urgency, sentiment, type, and language.
- Determine the best action: create_ticket, auto_respond, ignore, or merge_existing.
- For "auto_respond": provide a helpful auto_response text.
- For "create_ticket": suggest ticket details.
- For "merge_existing": provide the existing_ticket_id if identifiable.
- For "ignore": spam, auto-replies (out-of-office), or duplicates.
- Detect spam and auto-reply messages (type = "spam" or "auto_reply").
- Detect the language of the message.
- Generate the auto_response in the same language as the incoming message.

Respond ONLY with valid JSON matching this schema:
{
  "urgency": "<low|medium|high|critical>",
  "sentiment": "<positive|neutral|negative|frustrated>",
  "type": "<incident|request|warranty|support|backlog|spam|auto_reply>",
  "language": "<detected_language_code>",
  "summary": "<1-2_sentence_summary>",
  "action": "<create_ticket|auto_respond|ignore|merge_existing>",
  "auto_response": "<optional_auto_response_text>",
  "suggested_ticket": {"title":"...","description":"...","type":"...","urgency":"...","category":"..."} | null,
  "existing_ticket_id": "<optional_ticket_id>",
  "confidence": <0.0-1.0>
}`,
      prompt: `Channel: ${input.channel}
From: ${input.from}
${input.subject ? `Subject: ${input.subject}` : ''}
Body: ${input.body}
Tenant: ${input.tenantId}
${input.metadata ? `Metadata: ${JSON.stringify(input.metadata)}` : ''}`,
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.text) as InboxResult;

    return { data: parsed, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown inbox agent error';
    return { data: null, error: message };
  }
}
