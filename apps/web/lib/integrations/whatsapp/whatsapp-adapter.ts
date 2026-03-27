import type { ChannelAdapter, NormalizedMessage } from '~/lib/integrations/channel-adapter';

// ---------------------------------------------------------------------------
// Types — WhatsApp Cloud API channel configuration
// ---------------------------------------------------------------------------

export interface WhatsAppChannelConfig {
  /** Meta App access token (System User or long-lived). */
  access_token: string;
  /** WhatsApp Business Account phone number ID. */
  phone_number_id: string;
  /** Verify token used during webhook registration. */
  verify_token: string;
  /** App Secret for X-Hub-Signature-256 validation. */
  app_secret: string;
  /** Graph API version (default v21.0). */
  api_version?: string;
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API payload types
// ---------------------------------------------------------------------------

interface WaWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<WaMessage>;
        statuses?: Array<unknown>;
      };
      field: string;
    }>;
  }>;
}

interface WaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'interactive' | 'button' | 'reaction' | 'sticker';
  text?: { body: string };
  image?: WaMedia;
  document?: WaMedia & { filename?: string };
  audio?: WaMedia;
  video?: WaMedia;
  sticker?: WaMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  context?: { from: string; id: string };
}

interface WaMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

// ---------------------------------------------------------------------------
// WhatsAppAdapter
// ---------------------------------------------------------------------------

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channelType = 'whatsapp';

  private config: WhatsAppChannelConfig;
  private apiBase: string;

  constructor(config: WhatsAppChannelConfig) {
    this.config = config;
    const version = config.api_version ?? 'v21.0';
    this.apiBase = `https://graph.facebook.com/${version}`;
  }

  // ── Inbound ──────────────────────────────────────────────────────────────

  async handleInboundWebhook(payload: unknown): Promise<NormalizedMessage> {
    const wa = payload as WaWebhookPayload;

    // Navigate to the first message
    const entry = wa.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      throw new Error('WhatsAppAdapter: no message found in webhook payload');
    }

    const contact = value?.contacts?.[0];
    const from = contact?.profile?.name
      ? `${contact.profile.name} (${message.from})`
      : message.from;

    // Extract body and attachments based on message type
    let body = '';
    const attachments: NormalizedMessage['attachments'] = [];

    switch (message.type) {
      case 'text':
        body = message.text?.body ?? '';
        break;

      case 'image':
      case 'video':
      case 'audio':
      case 'sticker': {
        const media = message[message.type] as WaMedia;
        body = media.caption ?? `[${message.type}]`;
        if (media.id) {
          const mediaUrl = await this.getMediaUrl(media.id);
          if (mediaUrl) {
            attachments.push({
              url: mediaUrl,
              filename: `${message.type}_${media.id}`,
              mime_type: media.mime_type,
              size: 0, // Size not provided by Cloud API inline
            });
          }
        }
        break;
      }

      case 'document': {
        const doc = message.document;
        body = doc?.caption ?? `[Document: ${doc?.filename ?? 'unknown'}]`;
        if (doc?.id) {
          const mediaUrl = await this.getMediaUrl(doc.id);
          if (mediaUrl) {
            attachments.push({
              url: mediaUrl,
              filename: doc.filename ?? `document_${doc.id}`,
              mime_type: doc.mime_type,
              size: 0,
            });
          }
        }
        break;
      }

      case 'location': {
        const loc = message.location;
        body = loc
          ? `[Location: ${loc.name ?? ''} ${loc.address ?? ''} (${loc.latitude}, ${loc.longitude})]`.trim()
          : '[Location]';
        break;
      }

      default:
        body = `[Unsupported message type: ${message.type}]`;
    }

    return {
      from,
      body,
      attachments: attachments.length > 0 ? attachments : undefined,
      channelMessageId: message.id,
      metadata: {
        wa_id: message.from,
        contact_name: contact?.profile?.name,
        timestamp: message.timestamp,
        message_type: message.type,
        phone_number_id: value?.metadata?.phone_number_id,
        context: message.context,
      },
    };
  }

  // ── Outbound ─────────────────────────────────────────────────────────────

  async sendMessage(
    conversation: any,
    content: string,
    _html?: string,
  ): Promise<{ data: any; error: string | null }> {
    const recipientWaId =
      conversation.contact?.whatsapp_id ??
      conversation.metadata?.wa_id;

    if (!recipientWaId) {
      return { data: null, error: 'No WhatsApp ID found for this conversation' };
    }

    try {
      const response = await fetch(
        `${this.apiBase}/${this.config.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.access_token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientWaId,
            type: 'text',
            text: { body: content },
          }),
        },
      );

      if (!response.ok) {
        const errBody = await response.text();
        return {
          data: null,
          error: `WhatsApp API error (${response.status}): ${errBody}`,
        };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Unknown WhatsApp send error',
      };
    }
  }

  // ── Signature verification ───────────────────────────────────────────────

  /**
   * Validates the X-Hub-Signature-256 header using the app secret.
   * See: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
   */
  async verifySignature(request: Request): Promise<boolean> {
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) return false;

    try {
      const body = await request.clone().text();
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.config.app_secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );

      const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(body),
      );

      const expectedHex = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const expected = `sha256=${expectedHex}`;

      // Constant-time comparison
      if (expected.length !== signature.length) return false;

      let mismatch = 0;
      for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
      }

      return mismatch === 0;
    } catch {
      return false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Retrieves a download URL for a WhatsApp media object by its ID.
   */
  private async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.apiBase}/${mediaId}`, {
        headers: {
          Authorization: `Bearer ${this.config.access_token}`,
        },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as { url?: string };
      return data.url ?? null;
    } catch {
      return null;
    }
  }
}
