import type { NormalizedMessage } from '~/lib/services/inbox.service';

// ---------------------------------------------------------------------------
// ChannelAdapter — Base interface for all omnichannel adapters
// ---------------------------------------------------------------------------

/**
 * Every channel integration (IMAP, WhatsApp, Office 365, Web Widget, etc.)
 * must implement this interface.  The adapters normalise inbound payloads
 * into `NormalizedMessage` objects and provide an outbound `sendMessage`
 * method so the Inbox can reply through the same channel.
 */
export interface ChannelAdapter {
  /** Unique identifier for this channel type (matches `inbox_channels.channel_type`). */
  readonly channelType: string;

  /**
   * Parses a raw inbound webhook / push payload and returns a normalised
   * message that can be persisted in `inbox_messages`.
   */
  handleInboundWebhook(payload: unknown): Promise<NormalizedMessage>;

  /**
   * Sends an outbound message through the channel.
   *
   * @param conversation - The conversation record (includes channel config).
   * @param content      - Plain-text content of the outbound message.
   * @param html         - Optional HTML content (for email channels).
   * @returns An object wrapping the channel-specific response or an error string.
   */
  sendMessage(
    conversation: any,
    content: string,
    html?: string,
  ): Promise<{ data: any; error: string | null }>;

  /**
   * Validates the authenticity of an inbound request (e.g. HMAC signature).
   * Adapters that do not require verification should return `true`.
   */
  verifySignature(request: Request): Promise<boolean>;

  /**
   * Optional polling method.  Adapters that support pull-based ingestion
   * (e.g. IMAP IDLE / periodic fetch) implement this to retrieve new
   * messages since the last sync.
   */
  sync?(channelConfig: any): Promise<NormalizedMessage[]>;
}

// ---------------------------------------------------------------------------
// Re-export NormalizedMessage for convenience
// ---------------------------------------------------------------------------

export type { NormalizedMessage } from '~/lib/services/inbox.service';
