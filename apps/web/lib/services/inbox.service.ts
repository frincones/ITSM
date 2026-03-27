import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedMessage {
  from: string;
  subject?: string;
  body: string;
  html?: string;
  attachments?: Array<{
    url: string;
    filename: string;
    mime_type: string;
    size: number;
  }>;
  channelMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  channel_id: string;
  contact_id: string | null;
  ticket_id: string | null;
  status: 'open' | 'pending' | 'snoozed' | 'resolved';
  subject: string | null;
  last_message_at: string | null;
  assigned_agent_id: string | null;
  assigned_group_id: string | null;
  ai_summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InboxMessage {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'contact' | 'agent' | 'ai_agent' | 'system';
  sender_id: string | null;
  content_text: string | null;
  content_html: string | null;
  attachments: Array<{
    url: string;
    filename: string;
    mime_type: string;
    size: number;
  }>;
  channel_message_id: string | null;
  ai_classification: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_id: string | null;
  company: string | null;
  avatar_url: string | null;
  channel_identifiers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

// ---------------------------------------------------------------------------
// createConversation
// ---------------------------------------------------------------------------

/**
 * Creates a new inbox conversation for the given channel and contact.
 */
export async function createConversation(
  client: SupabaseClient,
  tenantId: string,
  channelId: string,
  contactId: string | null,
  subject?: string,
): Promise<ServiceResult<Conversation>> {
  const { data, error } = await client
    .from('inbox_conversations')
    .insert({
      tenant_id: tenantId,
      channel_id: channelId,
      contact_id: contactId,
      subject: subject ?? null,
      status: 'open',
      last_message_at: new Date().toISOString(),
      metadata: {},
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as unknown as Conversation, error: null };
}

// ---------------------------------------------------------------------------
// addMessage
// ---------------------------------------------------------------------------

/**
 * Inserts a new message into an existing conversation and updates
 * the conversation's `last_message_at` timestamp.
 */
export async function addMessage(
  client: SupabaseClient,
  tenantId: string,
  conversationId: string,
  message: NormalizedMessage,
  direction: 'inbound' | 'outbound',
  senderType: 'contact' | 'agent' | 'ai_agent' | 'system',
  senderId?: string | null,
): Promise<ServiceResult<InboxMessage>> {
  const { data, error } = await client
    .from('inbox_messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction,
      sender_type: senderType,
      sender_id: senderId ?? null,
      content_text: message.body,
      content_html: message.html ?? null,
      attachments: message.attachments ?? [],
      channel_message_id: message.channelMessageId ?? null,
      metadata: message.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Update conversation last_message_at
  const now = new Date().toISOString();
  await client
    .from('inbox_conversations')
    .update({
      last_message_at: now,
      // Re-open conversation if it was resolved and a new inbound arrives
      ...(direction === 'inbound' ? { status: 'open' } : {}),
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);

  return { data: data as unknown as InboxMessage, error: null };
}

// ---------------------------------------------------------------------------
// linkConversationToTicket
// ---------------------------------------------------------------------------

/**
 * Associates a conversation with a ticket. This enables agents to see the
 * full conversation history from the ticket detail view.
 */
export async function linkConversationToTicket(
  client: SupabaseClient,
  conversationId: string,
  ticketId: string,
): Promise<ServiceResult<{ conversationId: string; ticketId: string }>> {
  const { error } = await client
    .from('inbox_conversations')
    .update({ ticket_id: ticketId })
    .eq('id', conversationId);

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: { conversationId, ticketId },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// resolveConversation
// ---------------------------------------------------------------------------

/**
 * Sets a conversation status to 'resolved'.
 */
export async function resolveConversation(
  client: SupabaseClient,
  conversationId: string,
): Promise<ServiceResult<{ id: string; status: string }>> {
  const { data, error } = await client
    .from('inbox_conversations')
    .update({ status: 'resolved' })
    .eq('id', conversationId)
    .select('id, status')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as { id: string; status: string }, error: null };
}

// ---------------------------------------------------------------------------
// getOrCreateContact
// ---------------------------------------------------------------------------

/**
 * Finds a contact by email, phone, or whatsapp_id within the tenant.
 * Creates a new contact record when none is found.
 *
 * The `identifier` object should include at least one of: email, phone,
 * whatsapp_id. If `name` is provided it will be used when creating.
 */
export async function getOrCreateContact(
  client: SupabaseClient,
  tenantId: string,
  identifier: {
    email?: string;
    phone?: string;
    whatsapp_id?: string;
    name?: string;
  },
): Promise<ServiceResult<Contact>> {
  // Build OR filters for lookup
  const filters: string[] = [];

  if (identifier.email) {
    filters.push(`email.eq.${identifier.email}`);
  }

  if (identifier.phone) {
    filters.push(`phone.eq.${identifier.phone}`);
  }

  if (identifier.whatsapp_id) {
    filters.push(`whatsapp_id.eq.${identifier.whatsapp_id}`);
  }

  if (filters.length === 0) {
    return { data: null, error: 'At least one identifier (email, phone, whatsapp_id) is required' };
  }

  // Try to find existing contact
  const { data: existing, error: findError } = await client
    .from('contacts')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(filters.join(','))
    .limit(1)
    .maybeSingle();

  if (findError) {
    return { data: null, error: findError.message };
  }

  if (existing) {
    return { data: existing as unknown as Contact, error: null };
  }

  // Create new contact
  const { data: created, error: createError } = await client
    .from('contacts')
    .insert({
      tenant_id: tenantId,
      name: identifier.name ?? identifier.email ?? identifier.phone ?? identifier.whatsapp_id ?? null,
      email: identifier.email ?? null,
      phone: identifier.phone ?? null,
      whatsapp_id: identifier.whatsapp_id ?? null,
      channel_identifiers: {},
      metadata: {},
    })
    .select()
    .single();

  if (createError) {
    return { data: null, error: createError.message };
  }

  return { data: created as unknown as Contact, error: null };
}

// ---------------------------------------------------------------------------
// getConversation
// ---------------------------------------------------------------------------

/**
 * Fetches a single conversation by ID, optionally including its channel info.
 */
export async function getConversation(
  client: SupabaseClient,
  conversationId: string,
): Promise<ServiceResult<Conversation & { channel?: { channel_type: string; config: Record<string, unknown> } }>> {
  const { data, error } = await client
    .from('inbox_conversations')
    .select('*, inbox_channels(channel_type, config)')
    .eq('id', conversationId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Flatten the channel join
  const { inbox_channels, ...conversation } = data as Record<string, unknown>;
  const result = {
    ...conversation,
    channel: inbox_channels as { channel_type: string; config: Record<string, unknown> } | undefined,
  };

  return { data: result as Conversation & { channel?: { channel_type: string; config: Record<string, unknown> } }, error: null };
}

// ---------------------------------------------------------------------------
// getChannel
// ---------------------------------------------------------------------------

/**
 * Fetches a single inbox channel by ID.
 */
export async function getChannel(
  client: SupabaseClient,
  channelId: string,
): Promise<ServiceResult<{
  id: string;
  tenant_id: string;
  channel_type: string;
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  auto_create_ticket: boolean;
  ai_processing: boolean;
  default_category_id: string | null;
  default_group_id: string | null;
}>> {
  const { data, error } = await client
    .from('inbox_channels')
    .select('*')
    .eq('id', channelId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as any, error: null };
}

// ---------------------------------------------------------------------------
// findChannelByType
// ---------------------------------------------------------------------------

/**
 * Finds the first active channel of a given type for a tenant.
 * Useful when routing inbound webhooks that identify the channel by type.
 */
export async function findChannelByType(
  client: SupabaseClient,
  tenantId: string,
  channelType: string,
): Promise<ServiceResult<{
  id: string;
  tenant_id: string;
  channel_type: string;
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  auto_create_ticket: boolean;
  ai_processing: boolean;
  default_category_id: string | null;
  default_group_id: string | null;
}>> {
  const { data, error } = await client
    .from('inbox_channels')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: `No active channel of type '${channelType}' found` };
  }

  return { data: data as any, error: null };
}
