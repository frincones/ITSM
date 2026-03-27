import type { ChannelAdapter } from '~/lib/integrations/channel-adapter';
import { ImapAdapter } from '~/lib/integrations/email/imap-adapter';
import { WhatsAppAdapter } from '~/lib/integrations/whatsapp/whatsapp-adapter';
import { Office365Adapter } from '~/lib/integrations/office365/graph-adapter';
import { WidgetAdapter } from '~/lib/integrations/widget/widget-adapter';

import type { ImapChannelConfig } from '~/lib/integrations/email/imap-adapter';
import type { WhatsAppChannelConfig } from '~/lib/integrations/whatsapp/whatsapp-adapter';
import type { Office365ChannelConfig } from '~/lib/integrations/office365/graph-adapter';
import type { WidgetChannelConfig } from '~/lib/integrations/widget/widget-adapter';

// ---------------------------------------------------------------------------
// Adapter Registry
// ---------------------------------------------------------------------------

/**
 * Returns the correct ChannelAdapter instance for the given channel type
 * and its stored configuration (from `inbox_channels.config`).
 *
 * Returns `null` for unsupported channel types.
 */
export function getAdapter(
  channelType: string,
  config: Record<string, unknown>,
): ChannelAdapter | null {
  switch (channelType) {
    case 'email_imap':
      return new ImapAdapter(config as unknown as ImapChannelConfig);

    case 'email_office365':
      return new Office365Adapter(config as unknown as Office365ChannelConfig);

    case 'whatsapp':
      return new WhatsAppAdapter(config as unknown as WhatsAppChannelConfig);

    case 'web_widget':
      return new WidgetAdapter(config as unknown as WidgetChannelConfig);

    default:
      return null;
  }
}

/**
 * List of all supported channel types.
 */
export const SUPPORTED_CHANNEL_TYPES = [
  'email_imap',
  'email_office365',
  'whatsapp',
  'web_widget',
] as const;

export type SupportedChannelType = (typeof SUPPORTED_CHANNEL_TYPES)[number];
