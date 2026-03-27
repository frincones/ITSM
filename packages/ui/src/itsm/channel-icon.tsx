'use client';

import * as React from 'react';
import {
  Globe,
  Mail,
  MessageCircle,
  Phone,
  Code,
  Bot,
  MessageSquare,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

import { cn } from '../lib/utils';

/**
 * Ticket channel values matching the database enum.
 */
export type TicketChannel =
  | 'portal'
  | 'email'
  | 'whatsapp'
  | 'phone'
  | 'api'
  | 'ai_agent'
  | 'web_widget';

interface ChannelIconProps extends LucideProps {
  channel: TicketChannel;
}

const CHANNEL_MAP: Record<
  TicketChannel,
  { icon: React.FC<LucideProps>; label: string }
> = {
  portal: { icon: Globe, label: 'Portal' },
  email: { icon: Mail, label: 'Email' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp' },
  phone: { icon: Phone, label: 'Phone' },
  api: { icon: Code, label: 'API' },
  ai_agent: { icon: Bot, label: 'AI Agent' },
  web_widget: { icon: MessageSquare, label: 'Web Widget' },
};

/**
 * ChannelIcon renders the appropriate Lucide icon for a given inbox channel.
 * Includes an accessible title via the aria-label attribute.
 */
export function ChannelIcon({
  channel,
  className,
  ...props
}: ChannelIconProps) {
  const config = CHANNEL_MAP[channel];
  const Icon = config.icon;

  return (
    <Icon
      className={cn('h-4 w-4', className)}
      aria-label={config.label}
      {...props}
    />
  );
}

/**
 * Utility to retrieve the human-readable label for a channel.
 */
export function getChannelLabel(channel: TicketChannel): string {
  return CHANNEL_MAP[channel].label;
}
