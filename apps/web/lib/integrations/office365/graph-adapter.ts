import type { ChannelAdapter, NormalizedMessage } from '~/lib/integrations/channel-adapter';

// ---------------------------------------------------------------------------
// Types — Office 365 / Microsoft Graph channel configuration
// ---------------------------------------------------------------------------

export interface Office365ChannelConfig {
  /** Azure AD Application (client) ID. */
  client_id: string;
  /** Azure AD Application client secret. */
  client_secret: string;
  /** Azure AD Tenant ID (directory). */
  azure_tenant_id: string;
  /** The mailbox UPN or ID to monitor (e.g. support@company.com). */
  mailbox: string;
  /** OAuth2 refresh token for delegated access, or null for app-only. */
  refresh_token?: string;
  /** Cached access token (managed by token refresh logic). */
  access_token?: string;
  /** Access token expiration timestamp (ISO). */
  token_expires_at?: string;
  /** Subscription ID for Graph change notifications (webhooks). */
  subscription_id?: string;
  /** Shared secret for Graph webhook validation. */
  client_state?: string;
}

// ---------------------------------------------------------------------------
// Graph API notification payload
// ---------------------------------------------------------------------------

interface GraphNotificationPayload {
  value?: Array<{
    subscriptionId: string;
    subscriptionExpirationDateTime: string;
    changeType: 'created' | 'updated' | 'deleted';
    resource: string;
    resourceData: {
      '@odata.type': string;
      '@odata.id': string;
      '@odata.etag': string;
      id: string;
    };
    clientState?: string;
    tenantId: string;
  }>;
  validationToken?: string;
}

interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  internetMessageId?: string;
  conversationId?: string;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
    contentBytes?: string;
    '@odata.mediaContentLink'?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Office365Adapter
// ---------------------------------------------------------------------------

export class Office365Adapter implements ChannelAdapter {
  readonly channelType = 'email_office365';

  private config: Office365ChannelConfig;
  private graphBase = 'https://graph.microsoft.com/v1.0';

  constructor(config: Office365ChannelConfig) {
    this.config = config;
  }

  // ── Inbound (Graph change notification) ──────────────────────────────────

  /**
   * Parses a Microsoft Graph change notification.
   *
   * Graph notifications are "thin" — they only contain a resource URL.
   * The adapter fetches the full message content from the Graph API.
   */
  async handleInboundWebhook(payload: unknown): Promise<NormalizedMessage> {
    const notification = payload as GraphNotificationPayload;
    const change = notification.value?.[0];

    if (!change) {
      throw new Error('Office365Adapter: no change notification found in payload');
    }

    // Fetch the full message from Graph API
    const accessToken = await this.ensureAccessToken();
    const message = await this.fetchMessage(change.resource, accessToken);

    if (!message) {
      throw new Error(
        `Office365Adapter: failed to fetch message at ${change.resource}`,
      );
    }

    // Fetch attachments if present
    const attachments: NormalizedMessage['attachments'] = [];
    if (message.hasAttachments && message.attachments) {
      for (const att of message.attachments) {
        attachments.push({
          url: att['@odata.mediaContentLink'] ?? `graph://attachments/${att.id}`,
          filename: att.name,
          mime_type: att.contentType,
          size: att.size,
        });
      }
    }

    const fromAddress = message.from?.emailAddress?.address ?? '';
    const fromName = message.from?.emailAddress?.name;
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    return {
      from,
      subject: message.subject,
      body:
        message.body.contentType === 'text'
          ? message.body.content
          : this.stripHtml(message.body.content),
      html:
        message.body.contentType === 'html'
          ? message.body.content
          : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      channelMessageId: message.internetMessageId ?? message.id,
      metadata: {
        graph_message_id: message.id,
        graph_conversation_id: message.conversationId,
        received_at: message.receivedDateTime,
        from_address: fromAddress,
      },
    };
  }

  // ── Outbound ─────────────────────────────────────────────────────────────

  /**
   * Sends an outbound email via the Graph API `/sendMail` endpoint.
   */
  async sendMessage(
    conversation: any,
    content: string,
    html?: string,
  ): Promise<{ data: any; error: string | null }> {
    const recipientEmail =
      conversation.contact?.email ?? conversation.metadata?.from_address;

    if (!recipientEmail) {
      return { data: null, error: 'No recipient email found for this conversation' };
    }

    try {
      const accessToken = await this.ensureAccessToken();

      const response = await fetch(
        `${this.graphBase}/users/${this.config.mailbox}/sendMail`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              subject: conversation.subject
                ? `Re: ${conversation.subject}`
                : 'Reply from Support',
              body: {
                contentType: html ? 'HTML' : 'Text',
                content: html ?? content,
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: recipientEmail,
                  },
                },
              ],
            },
            saveToSentItems: true,
          }),
        },
      );

      if (!response.ok) {
        const errBody = await response.text();
        return {
          data: null,
          error: `Graph API error (${response.status}): ${errBody}`,
        };
      }

      // sendMail returns 202 Accepted with no body
      return { data: { sent: true, to: recipientEmail }, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Unknown Graph API error',
      };
    }
  }

  // ── Signature verification ───────────────────────────────────────────────

  /**
   * Validates the `clientState` value in the Graph notification.
   * Microsoft includes `clientState` in every notification so you can
   * verify the request came from a subscription you created.
   */
  async verifySignature(request: Request): Promise<boolean> {
    if (!this.config.client_state) {
      // No client_state configured — skip verification
      return true;
    }

    try {
      const body = await request.clone().json();
      const notification = body as GraphNotificationPayload;

      // Validation token requests (subscription creation) are always valid
      if (notification.validationToken) {
        return true;
      }

      const change = notification.value?.[0];
      if (!change) return false;

      return change.clientState === this.config.client_state;
    } catch {
      return false;
    }
  }

  // ── Token management ─────────────────────────────────────────────────────

  /**
   * Ensures a valid access token is available. Refreshes if expired.
   *
   * Supports two flows:
   *   1. **App-only (client_credentials)** — uses client_id + client_secret.
   *   2. **Delegated (refresh_token)** — exchanges refresh token for a new
   *      access token (required for shared/delegated mailboxes).
   */
  private async ensureAccessToken(): Promise<string> {
    // Check if current token is still valid (with 5-minute buffer)
    if (this.config.access_token && this.config.token_expires_at) {
      const expiresAt = new Date(this.config.token_expires_at).getTime();
      const buffer = 5 * 60 * 1000; // 5 minutes
      if (Date.now() < expiresAt - buffer) {
        return this.config.access_token;
      }
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.azure_tenant_id}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.set('client_id', this.config.client_id);
    params.set('client_secret', this.config.client_secret);

    if (this.config.refresh_token) {
      // Delegated flow
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', this.config.refresh_token);
      params.set('scope', 'https://graph.microsoft.com/.default offline_access');
    } else {
      // App-only flow
      params.set('grant_type', 'client_credentials');
      params.set('scope', 'https://graph.microsoft.com/.default');
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Token refresh failed (${response.status}): ${errBody}`);
    }

    const tokenData = (await response.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    // Update cached token
    this.config.access_token = tokenData.access_token;
    this.config.token_expires_at = new Date(
      Date.now() + tokenData.expires_in * 1000,
    ).toISOString();

    // Store new refresh token if provided (token rotation)
    if (tokenData.refresh_token) {
      this.config.refresh_token = tokenData.refresh_token;
    }

    return tokenData.access_token;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Fetches a full message object from the Graph API, including attachments.
   */
  private async fetchMessage(
    resource: string,
    accessToken: string,
  ): Promise<GraphMessage | null> {
    try {
      const url = `${this.graphBase}/${resource}?$expand=attachments`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return null;

      return (await response.json()) as GraphMessage;
    } catch {
      return null;
    }
  }

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
