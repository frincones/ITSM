import type { ChannelAdapter, NormalizedMessage } from '~/lib/integrations/channel-adapter';

// ---------------------------------------------------------------------------
// Types — Web Widget channel configuration
// ---------------------------------------------------------------------------

export interface WidgetChannelConfig {
  /** Supabase project URL (used for Realtime broadcast). */
  supabase_url: string;
  /** Supabase service-role key for server-side Realtime publish. */
  supabase_service_key: string;
  /** Allowed origins for CORS validation (comma-separated). */
  allowed_origins?: string;
  /** Optional shared secret for widget authentication. */
  widget_secret?: string;
}

// ---------------------------------------------------------------------------
// Widget inbound payload shape
// ---------------------------------------------------------------------------

interface WidgetPayload {
  /** Visitor / contact identifier (anonymous ID or authenticated user). */
  visitor_id: string;
  /** Display name of the visitor. */
  name?: string;
  /** Visitor email (if provided). */
  email?: string;
  /** The message text. */
  message: string;
  /** Optional conversation ID for continuing an existing conversation. */
  conversation_id?: string;
  /** Widget page URL the visitor was on. */
  page_url?: string;
  /** Custom metadata from the embedding site. */
  metadata?: Record<string, unknown>;
  /** Attachments uploaded via the widget. */
  attachments?: Array<{
    url: string;
    filename: string;
    mime_type: string;
    size: number;
  }>;
}

// ---------------------------------------------------------------------------
// WidgetAdapter
// ---------------------------------------------------------------------------

export class WidgetAdapter implements ChannelAdapter {
  readonly channelType = 'web_widget';

  private config: WidgetChannelConfig;

  constructor(config: WidgetChannelConfig) {
    this.config = config;
  }

  // ── Inbound ──────────────────────────────────────────────────────────────

  async handleInboundWebhook(payload: unknown): Promise<NormalizedMessage> {
    const data = payload as WidgetPayload;

    if (!data.message && (!data.attachments || data.attachments.length === 0)) {
      throw new Error('WidgetAdapter: message or attachments required');
    }

    if (!data.visitor_id) {
      throw new Error('WidgetAdapter: visitor_id is required');
    }

    return {
      from: data.name ?? data.email ?? data.visitor_id,
      body: data.message ?? '',
      attachments: data.attachments && data.attachments.length > 0
        ? data.attachments
        : undefined,
      channelMessageId: undefined,
      metadata: {
        visitor_id: data.visitor_id,
        name: data.name,
        email: data.email,
        page_url: data.page_url,
        conversation_id: data.conversation_id,
        ...data.metadata,
      },
    };
  }

  // ── Outbound ─────────────────────────────────────────────────────────────

  /**
   * Sends an outbound message to the widget visitor via Supabase Realtime.
   *
   * The widget client subscribes to a channel named `widget:<conversation_id>`.
   * When an agent sends a reply, this method broadcasts the message to that
   * channel so the widget can display it in real time.
   */
  async sendMessage(
    conversation: any,
    content: string,
    html?: string,
  ): Promise<{ data: any; error: string | null }> {
    const conversationId = conversation.id;

    if (!conversationId) {
      return { data: null, error: 'No conversation ID available for Realtime broadcast' };
    }

    try {
      // Use Supabase Realtime REST API to broadcast
      // POST /realtime/v1/api/broadcast
      const broadcastUrl = `${this.config.supabase_url}/realtime/v1/api/broadcast`;

      const response = await fetch(broadcastUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.supabase_service_key}`,
          apikey: this.config.supabase_service_key,
        },
        body: JSON.stringify({
          messages: [
            {
              topic: `widget:${conversationId}`,
              event: 'new_message',
              payload: {
                conversation_id: conversationId,
                content,
                html: html ?? null,
                sender_type: 'agent',
                timestamp: new Date().toISOString(),
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return {
          data: null,
          error: `Realtime broadcast error (${response.status}): ${errBody}`,
        };
      }

      return {
        data: { broadcast: true, conversationId },
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Unknown Realtime broadcast error',
      };
    }
  }

  // ── Signature verification ───────────────────────────────────────────────

  /**
   * Verifies the origin and optional shared secret for widget requests.
   */
  async verifySignature(request: Request): Promise<boolean> {
    // Verify origin if allowed_origins is configured
    if (this.config.allowed_origins) {
      const origin = request.headers.get('origin');
      if (!origin) return false;

      const allowed = this.config.allowed_origins
        .split(',')
        .map((o) => o.trim().toLowerCase());

      if (!allowed.includes(origin.toLowerCase()) && !allowed.includes('*')) {
        return false;
      }
    }

    // Verify widget secret if configured
    if (this.config.widget_secret) {
      const providedSecret = request.headers.get('x-widget-secret');
      if (!providedSecret) return false;

      // Constant-time comparison
      if (providedSecret.length !== this.config.widget_secret.length) return false;

      let mismatch = 0;
      for (let i = 0; i < this.config.widget_secret.length; i++) {
        mismatch |= providedSecret.charCodeAt(i) ^ this.config.widget_secret.charCodeAt(i);
      }

      return mismatch === 0;
    }

    return true;
  }
}
