// ---------------------------------------------------------------------------
// Domain layer — omnichannel inbox
// ---------------------------------------------------------------------------
// Conversation handling that must behave identically whether it is driven
// from the inbox UI, an external agent over MCP, or an internal AI agent.
//
// Same contract as tickets.domain.ts: identity arrives as a DomainActor, the
// Supabase client is passed in, and nothing here calls auth.getUser().
//
// One thing to keep in mind when wiring new entry points: replying to a
// conversation can send a real message to a real customer over WhatsApp or
// email through the channel adapter. That is why `sendReply` takes an
// explicit `internal` flag rather than inferring it, and why the MCP tool
// that exposes it is gated behind its own scope.
// ---------------------------------------------------------------------------

import 'server-only';

import { after } from 'next/server';

import { getAdapter } from '~/lib/integrations/registry';
import { addMessage, linkConversationToTicket } from '~/lib/services/inbox.service';

import { createTicket as createTicketDomain } from './tickets.domain';
import {
  fail,
  ok,
  requireUserId,
  resolveOrgScope,
  type DomainContext,
  type DomainResult,
} from './types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Columns exposed for a conversation. Deliberate, not `select('*')`. */
const CONVERSATION_COLUMNS =
  'id, tenant_id, channel_id, contact_id, ticket_id, organization_id, status, subject, last_message_at, assigned_agent_id, assigned_group_id, ai_summary, metadata, created_at, updated_at';

/**
 * Loads a conversation inside the actor's tenant and org scope.
 * Returns null when it does not exist or is out of scope — the caller turns
 * that into a not_found, so an out-of-scope id is indistinguishable from a
 * missing one and cannot be used to probe for other tenants' data.
 */
async function loadConversation(
  ctx: DomainContext,
  conversationId: string,
  columns = CONVERSATION_COLUMNS,
) {
  const { actor, client } = ctx;
  let query = client
    .from('inbox_conversations')
    .select(columns)
    .eq('id', conversationId)
    .eq('tenant_id', actor.tenantId);

  const orgScope = resolveOrgScope(actor);
  // organization_id is nullable on conversations (a contact may not be
  // mapped to an org yet), so an org-scoped caller must still see those.
  if (orgScope) {
    query = query.or(
      `organization_id.in.(${orgScope.join(',')}),organization_id.is.null`,
    );
  }

  const { data } = await query.maybeSingle();
  return data as Record<string, unknown> | null;
}

/** Defers work past the response; see the note in tickets.domain.ts. */
function runAfterResponse(work: () => Promise<unknown>): void {
  try {
    after(() => work().catch(() => {}));
  } catch {
    void work().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// listConversations
// ---------------------------------------------------------------------------

export interface ListConversationsFilters {
  status?: string[];
  channel_id?: string | null;
  assigned_agent_id?: string | null;
  contact_id?: string | null;
  /** true = only linked to a ticket, false = only unlinked. */
  has_ticket?: boolean | null;
  organization_id?: string | null;
  search?: string | null;
  page: number;
  limit: number;
  sort_dir?: 'asc' | 'desc';
}

export async function listConversations(
  ctx: DomainContext,
  filters: ListConversationsFilters,
): Promise<DomainResult<{ conversations: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('inbox_conversations')
    .select(CONVERSATION_COLUMNS, { count: 'exact' })
    .eq('tenant_id', actor.tenantId);

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) {
    query = query.or(
      `organization_id.in.(${orgScope.join(',')}),organization_id.is.null`,
    );
  }

  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.channel_id) query = query.eq('channel_id', filters.channel_id);
  if (filters.assigned_agent_id) {
    query = query.eq('assigned_agent_id', filters.assigned_agent_id);
  }
  if (filters.contact_id) query = query.eq('contact_id', filters.contact_id);
  if (filters.has_ticket === true) query = query.not('ticket_id', 'is', null);
  if (filters.has_ticket === false) query = query.is('ticket_id', null);
  if (filters.search) {
    query = query.ilike('subject', `%${filters.search.replace(/[%_]/g, '\\$&')}%`);
  }

  const from = (filters.page - 1) * filters.limit;
  query = query
    // Most recent activity first: an inbox is read by recency, not creation.
    .order('last_message_at', { ascending: filters.sort_dir === 'asc', nullsFirst: false })
    .range(from, from + filters.limit - 1);

  const { data, error, count } = await query;
  if (error) return fail(error.message, 'internal');

  return ok({ conversations: data ?? [], total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// getConversation
// ---------------------------------------------------------------------------

export async function getConversation(
  ctx: DomainContext,
  conversationId: string,
  options: { includeMessages?: boolean; messageLimit?: number } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { includeMessages = true, messageLimit = 50 } = options;

  const conversation = await loadConversation(ctx, conversationId);
  if (!conversation) return fail('Conversation not found', 'not_found');

  const result: Record<string, unknown> = { conversation };

  if (includeMessages) {
    const { data } = await ctx.client
      .from('inbox_messages')
      .select(
        'id, direction, sender_type, sender_id, content_text, content_html, attachments, channel_message_id, created_at',
      )
      .eq('tenant_id', ctx.actor.tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(messageLimit);
    result.messages = data ?? [];
  }

  return ok(result);
}

// ---------------------------------------------------------------------------
// sendReply
// ---------------------------------------------------------------------------

export interface SendReplyOptions {
  /**
   * true  → the note is stored but NOT delivered to the customer.
   * false → the message is sent through the channel adapter, which for
   *         WhatsApp and email means it actually reaches the contact.
   */
  internal?: boolean;
  contentHtml?: string | null;
}

export async function sendReply(
  ctx: DomainContext,
  conversationId: string,
  content: string,
  options: SendReplyOptions = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;
  const { internal = false, contentHtml = null } = options;

  const resolved = requireUserId(actor);
  if (resolved.error) return fail(resolved.error, 'forbidden');

  const conversation = await loadConversation(
    ctx,
    conversationId,
    `${CONVERSATION_COLUMNS}, inbox_channels(channel_type, config)`,
  );
  if (!conversation) return fail('Conversation not found', 'not_found');

  // Outbound delivery happens BEFORE persisting: if the channel rejects the
  // message we must not leave a record claiming the customer was answered,
  // because first_response_at and SLA compliance are derived from that.
  if (!internal) {
    const channel = conversation.inbox_channels as
      | { channel_type: string; config: Record<string, unknown> }
      | undefined;

    if (channel) {
      const adapter = getAdapter(channel.channel_type, channel.config);
      if (adapter) {
        const { error: sendError } = await adapter.sendMessage(
          conversation as never,
          content,
        );
        if (sendError) {
          return fail(`Channel send failed: ${sendError}`, 'internal');
        }
      }
    }
  }

  const { data: message, error } = await addMessage(
    client,
    actor.tenantId,
    conversationId,
    {
      from: actor.email ?? actor.agentId ?? 'system',
      body: content,
      html: contentHtml ?? undefined,
      metadata: internal ? { is_internal: true } : {},
    },
    'outbound',
    'agent',
    actor.agentId,
  );

  if (error) return fail(error, 'internal');
  return ok(message as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// assignConversation
// ---------------------------------------------------------------------------

export async function assignConversation(
  ctx: DomainContext,
  conversationId: string,
  assignment: { agentId?: string | null; groupId?: string | null },
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (assignment.agentId !== undefined) payload.assigned_agent_id = assignment.agentId;
  if (assignment.groupId !== undefined) payload.assigned_group_id = assignment.groupId;

  if (Object.keys(payload).length === 1) {
    return fail('Provide agentId and/or groupId', 'invalid_input');
  }

  const existing = await loadConversation(ctx, conversationId, 'id, status');
  if (!existing) return fail('Conversation not found', 'not_found');

  // Taking ownership of an untouched conversation moves it out of the
  // unattended state, mirroring what the inbox UI does.
  if (existing.status === 'open' && assignment.agentId) {
    payload.status = 'pending';
  }

  const { data, error } = await client
    .from('inbox_conversations')
    .update(payload)
    .eq('id', conversationId)
    .eq('tenant_id', actor.tenantId)
    .select(CONVERSATION_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// setConversationStatus
// ---------------------------------------------------------------------------

export interface SetStatusOptions {
  /** Required for 'snoozed': ISO timestamp the conversation wakes up at. */
  snoozedUntil?: string | null;
}

export async function setConversationStatus(
  ctx: DomainContext,
  conversationId: string,
  status: 'open' | 'pending' | 'snoozed' | 'resolved',
  options: SetStatusOptions = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadConversation(ctx, conversationId, 'id, metadata');
  if (!existing) return fail('Conversation not found', 'not_found');

  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'snoozed') {
    if (!options.snoozedUntil) {
      return fail('snoozed_until is required when snoozing', 'invalid_input');
    }
    const until = new Date(options.snoozedUntil);
    if (Number.isNaN(until.getTime())) {
      return fail('snoozed_until must be a valid ISO timestamp', 'invalid_input');
    }
    if (until.getTime() <= Date.now()) {
      return fail('snoozed_until must be in the future', 'invalid_input');
    }
    payload.metadata = {
      ...((existing.metadata as Record<string, unknown> | null) ?? {}),
      snoozed_until: until.toISOString(),
    };
  } else {
    // Leaving the snooze state clears the wake-up marker so a later
    // snooze sweep does not resurrect an already-handled conversation.
    const meta = { ...((existing.metadata as Record<string, unknown> | null) ?? {}) };
    if ('snoozed_until' in meta) {
      delete meta.snoozed_until;
      payload.metadata = meta;
    }
  }

  const { data, error } = await client
    .from('inbox_conversations')
    .update(payload)
    .eq('id', conversationId)
    .eq('tenant_id', actor.tenantId)
    .select(CONVERSATION_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// createTicketFromConversation
// ---------------------------------------------------------------------------

export interface CreateTicketFromConversationFields {
  title?: string | null;
  description?: string | null;
  type?: string;
  urgency?: string;
  impact?: string;
  category_id?: string | null;
  organization_id?: string | null;
}

export interface CreateTicketFromConversationOptions {
  /**
   * Optional AI pass over the transcript. The UI supplies the inbox agent so
   * the ticket gets a classified title, type and urgency; MCP callers may
   * pass their own values instead and skip the model entirely.
   *
   * Returning null (or throwing) is fine — the conversation's own subject
   * and transcript are used as the fallback, so a model outage never blocks
   * turning a conversation into a ticket.
   */
  classify?: (transcript: string) => Promise<{
    summary?: string | null;
    urgency?: string | null;
    suggested_ticket?: { title?: string | null; description?: string | null; type?: string | null } | null;
  } | null>;
}

/**
 * Promotes a conversation into a ticket and links the two.
 *
 * Goes through the tickets domain, so the ticket gets the same treatment as
 * one filed from the UI: numbering, priority, auto-assignment, notification
 * and follower subscription.
 *
 * The previous implementation in lib/actions/inbox.ts inserted into `tickets`
 * directly with `source: 'inbox'` — a column that does not exist (the real
 * one is `channel`). Every call failed with a schema error, which is why all
 * 8 conversations in production have ticket_id = null.
 */
export async function createTicketFromConversation(
  ctx: DomainContext,
  conversationId: string,
  fields: CreateTicketFromConversationFields = {},
  options: CreateTicketFromConversationOptions = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const conversation = await loadConversation(ctx, conversationId);
  if (!conversation) return fail('Conversation not found', 'not_found');

  if (conversation.ticket_id) {
    return fail('Conversation is already linked to a ticket', 'conflict');
  }

  // Recent transcript, used as the ticket description when none is given.
  const { data: messages } = await client
    .from('inbox_messages')
    .select('content_text, direction, created_at')
    .eq('tenant_id', actor.tenantId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20);

  const transcript = (messages ?? [])
    .map((m) => {
      const row = m as { direction: string; content_text: string | null };
      return `[${row.direction}] ${row.content_text ?? ''}`;
    })
    .join('\n')
    .trim();

  // Channel defaults fill the gaps the caller left open.
  let channelCategoryId: string | null = null;
  let channelGroupId: string | null = null;
  if (conversation.channel_id) {
    const { data: channel } = await client
      .from('inbox_channels')
      .select('default_category_id, default_group_id')
      .eq('id', conversation.channel_id as string)
      .eq('tenant_id', actor.tenantId)
      .maybeSingle();
    channelCategoryId = (channel?.default_category_id as string | null) ?? null;
    channelGroupId = (channel?.default_group_id as string | null) ?? null;
  }

  // Optional AI classification. Never allowed to break the operation: a
  // failed model call falls back to the conversation's own data.
  let classification: Awaited<ReturnType<NonNullable<typeof options.classify>>> = null;
  if (options.classify) {
    try {
      classification = await options.classify(transcript);
    } catch {
      classification = null;
    }
  }

  const created = await createTicketDomain(ctx, {
    title:
      fields.title?.trim() ||
      classification?.suggested_ticket?.title?.trim() ||
      (conversation.subject as string | null) ||
      'Conversación sin asunto',
    description:
      fields.description?.trim() ||
      classification?.suggested_ticket?.description?.trim() ||
      transcript ||
      'Sin mensajes en la conversación.',
    type: fields.type ?? classification?.suggested_ticket?.type ?? 'request',
    urgency: fields.urgency ?? classification?.urgency ?? 'medium',
    impact: fields.impact ?? 'medium',
    organization_id:
      fields.organization_id ?? (conversation.organization_id as string | null) ?? null,
    category_id: fields.category_id ?? channelCategoryId,
    assigned_agent_id: (conversation.assigned_agent_id as string | null) ?? null,
    assigned_group_id:
      (conversation.assigned_group_id as string | null) ?? channelGroupId,
    requester_id: (conversation.contact_id as string | null) ?? null,
    // 'api' is a member of the ticket_channel enum; 'inbox' is not.
    channel: 'api',
  });

  if (created.error !== null) return fail(created.error, created.code);

  const ticket = created.data as { id: string; ticket_number?: string };

  const { error: linkError } = await linkConversationToTicket(
    client,
    conversationId,
    ticket.id,
  );
  if (linkError) {
    // The ticket exists; only the link failed. Report it rather than
    // pretending the whole operation succeeded — a caller that retries
    // would otherwise create a duplicate ticket.
    return fail(
      `Ticket ${ticket.ticket_number ?? ticket.id} was created but could not be linked to the conversation: ${linkError}`,
      'internal',
    );
  }

  // A conversation that produced a ticket is no longer awaiting triage.
  // The AI summary, when one was produced, is stored in the same write.
  runAfterResponse(async () => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (classification?.summary) patch.ai_summary = classification.summary;

    let update = client
      .from('inbox_conversations')
      .update(patch)
      .eq('id', conversationId)
      .eq('tenant_id', actor.tenantId);

    // Only an untriaged conversation is moved forward; one already pending
    // or snoozed keeps the state a human chose.
    const { data: current } = await client
      .from('inbox_conversations')
      .select('status')
      .eq('id', conversationId)
      .maybeSingle();

    if ((current as { status?: string } | null)?.status === 'open') {
      update = client
        .from('inbox_conversations')
        .update({ ...patch, status: 'pending' })
        .eq('id', conversationId)
        .eq('tenant_id', actor.tenantId);
    }

    await update;
  });

  return ok({ ticket, conversation_id: conversationId });
}

// ---------------------------------------------------------------------------
// listChannels
// ---------------------------------------------------------------------------

export async function listChannels(
  ctx: DomainContext,
  options: { activeOnly?: boolean } = {},
): Promise<DomainResult<{ channels: unknown[] }>> {
  const { actor, client } = ctx;

  let query = client
    .from('inbox_channels')
    // `config` is deliberately excluded: it holds channel credentials
    // (IMAP passwords, WhatsApp tokens) and must never leave the server.
    .select(
      'id, channel_type, name, is_active, auto_create_ticket, default_category_id, default_group_id, ai_processing, created_at',
    )
    .eq('tenant_id', actor.tenantId)
    .order('name', { ascending: true });

  if (options.activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');

  return ok({ channels: data ?? [] });
}
