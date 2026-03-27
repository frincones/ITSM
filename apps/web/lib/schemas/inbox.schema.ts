import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  optionalString,
} from './common.schema';

// ---------------------------------------------------------------------------
// Enums (mirror PostgreSQL CHECK constraints)
// ---------------------------------------------------------------------------
export const channelTypeEnum = z.enum([
  'email_imap',
  'email_office365',
  'email_gmail',
  'whatsapp',
  'web_widget',
  'api',
  'web_form',
]);

export const conversationStatusEnum = z.enum([
  'open',
  'pending',
  'snoozed',
  'resolved',
]);

export const messageDirectionEnum = z.enum(['inbound', 'outbound']);

export const senderTypeEnum = z.enum([
  'contact',
  'agent',
  'ai_agent',
  'system',
]);

// ---------------------------------------------------------------------------
// Create Channel
// ---------------------------------------------------------------------------
export const createChannelSchema = z.object({
  channel_type: channelTypeEnum,
  name: requiredString.max(255, 'Name must be 255 characters or fewer'),
  config: z.record(z.unknown()).optional().default({}),
  auto_create_ticket: z.boolean().optional().default(true),
  default_category_id: optionalUuid,
  default_group_id: optionalUuid,
  ai_processing: z.boolean().optional().default(true),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

// ---------------------------------------------------------------------------
// Send Message
// ---------------------------------------------------------------------------
export const sendMessageSchema = z.object({
  conversation_id: uuidSchema,
  content_text: optionalString,
  content_html: optionalString,
  attachments: z.array(z.record(z.unknown())).optional().default([]),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ---------------------------------------------------------------------------
// Create Conversation
// ---------------------------------------------------------------------------
export const createConversationSchema = z.object({
  channel_id: uuidSchema,
  contact_id: uuidSchema,
  subject: optionalString,
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

// ---------------------------------------------------------------------------
// Update Conversation
// ---------------------------------------------------------------------------
export const updateConversationSchema = z.object({
  status: conversationStatusEnum.optional(),
  assigned_agent_id: optionalUuid,
  assigned_group_id: optionalUuid,
});

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
