import type { ChannelAdapter, NormalizedMessage } from '~/lib/integrations/channel-adapter';

// ---------------------------------------------------------------------------
// Types — IMAP / SMTP channel configuration
// ---------------------------------------------------------------------------

export interface ImapChannelConfig {
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password: string;
  imap_tls: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_tls: boolean;
  /** Optional Resend API key for outbound delivery instead of raw SMTP. */
  resend_api_key?: string;
  /** The "from" address used when sending outbound replies. */
  from_address: string;
  from_name?: string;
  /** Mailbox to poll (default: INBOX). */
  mailbox?: string;
}

// ---------------------------------------------------------------------------
// Raw email payload shape (from webhook or polling)
// ---------------------------------------------------------------------------

interface RawEmailPayload {
  from: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  message_id?: string;
  in_reply_to?: string;
  attachments?: Array<{
    filename: string;
    content_type: string;
    size: number;
    url: string;
  }>;
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// ImapAdapter
// ---------------------------------------------------------------------------

export class ImapAdapter implements ChannelAdapter {
  readonly channelType = 'email_imap';

  private config: ImapChannelConfig;

  constructor(config: ImapChannelConfig) {
    this.config = config;
  }

  // ── Inbound ──────────────────────────────────────────────────────────────

  async handleInboundWebhook(payload: unknown): Promise<NormalizedMessage> {
    const raw = payload as RawEmailPayload;

    if (!raw.from) {
      throw new Error('ImapAdapter: missing "from" field in email payload');
    }

    const attachments = (raw.attachments ?? []).map((att) => ({
      url: att.url,
      filename: att.filename,
      mime_type: att.content_type,
      size: att.size,
    }));

    return {
      from: raw.from,
      subject: raw.subject,
      body: raw.text ?? this.stripHtml(raw.html ?? ''),
      html: raw.html ?? undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      channelMessageId: raw.message_id ?? undefined,
      metadata: {
        in_reply_to: raw.in_reply_to,
        to: raw.to,
        headers: raw.headers,
      },
    };
  }

  // ── Outbound ─────────────────────────────────────────────────────────────

  /**
   * Sends an outbound email reply.
   *
   * When `resend_api_key` is configured the adapter uses the Resend HTTP API
   * for delivery; otherwise it falls back to a direct SMTP connection
   * (placeholder — requires a runtime SMTP library like `nodemailer`).
   */
  async sendMessage(
    conversation: any,
    content: string,
    html?: string,
  ): Promise<{ data: any; error: string | null }> {
    const contactEmail = conversation.contact?.email ?? conversation.metadata?.from;

    if (!contactEmail) {
      return { data: null, error: 'No recipient email found on conversation' };
    }

    // ── Resend path ──────────────────────────────────────────────────────
    if (this.config.resend_api_key) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.resend_api_key}`,
          },
          body: JSON.stringify({
            from: this.config.from_name
              ? `${this.config.from_name} <${this.config.from_address}>`
              : this.config.from_address,
            to: [contactEmail],
            subject: conversation.subject
              ? `Re: ${conversation.subject}`
              : 'Reply from Support',
            text: content,
            html: html ?? undefined,
            headers: {
              'In-Reply-To': conversation.metadata?.channel_message_id ?? undefined,
            },
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          return { data: null, error: `Resend API error (${response.status}): ${errBody}` };
        }

        const data = await response.json();
        return { data, error: null };
      } catch (err) {
        return {
          data: null,
          error: err instanceof Error ? err.message : 'Unknown Resend error',
        };
      }
    }

    // ── SMTP fallback (placeholder) ──────────────────────────────────────
    // In production, use `nodemailer` or a similar SMTP library.
    // This placeholder logs the intent and returns a success stub.
    console.warn(
      '[ImapAdapter] SMTP send not implemented. Would send to:',
      contactEmail,
    );

    return {
      data: { placeholder: true, to: contactEmail, content },
      error: null,
    };
  }

  // ── Signature verification ───────────────────────────────────────────────

  /**
   * Email webhooks (e.g. from a forwarding relay) typically do not have
   * HMAC signatures.  If your relay provides one, override this method.
   */
  async verifySignature(_request: Request): Promise<boolean> {
    // No standard signature scheme for email relays — accept by default.
    return true;
  }

  // ── Sync (IMAP polling) ──────────────────────────────────────────────────

  /**
   * Polls the IMAP mailbox for new (UNSEEN) messages.
   *
   * **Placeholder structure** — a full implementation requires an IMAP client
   * library such as `imapflow`.  The method is included so that a scheduled
   * cron job can call `adapter.sync(channelConfig)` and receive normalised
   * messages ready for persistence.
   */
  async sync(_channelConfig: any): Promise<NormalizedMessage[]> {
    // TODO: Implement IMAP polling with imapflow
    //
    // Outline:
    //   1. Connect to this.config.imap_host with credentials.
    //   2. Open this.config.mailbox ?? 'INBOX'.
    //   3. Search for UNSEEN messages.
    //   4. For each message, parse with mailparser and map to NormalizedMessage.
    //   5. Mark messages as SEEN after processing.
    //   6. Disconnect and return the array.
    //
    // Example (pseudo-code):
    //
    //   const client = new ImapFlow({ host, port, auth, secure });
    //   await client.connect();
    //   const lock = await client.getMailboxLock('INBOX');
    //   try {
    //     for await (const msg of client.fetch('1:*', { envelope: true, source: true }, { unseen: true })) {
    //       const parsed = await simpleParser(msg.source);
    //       messages.push(normalize(parsed));
    //     }
    //   } finally { lock.release(); await client.logout(); }

    console.warn('[ImapAdapter] IMAP sync not yet implemented');
    return [];
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}
