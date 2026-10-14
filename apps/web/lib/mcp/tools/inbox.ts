// ---------------------------------------------------------------------------
// MCP Tools — Omnichannel Inbox
// ---------------------------------------------------------------------------
// Conversations arriving from email, WhatsApp, the web widget and the API.
//
// Every write delegates to lib/domain/inbox.domain.ts, so an agent working a
// conversation over MCP follows the same path as a human in the inbox UI.
//
// Scope design: replying to a conversation can send a real message to a real
// customer, so `inbox_send_reply` sits behind `inbox:reply` rather than a
// generic write scope. A key granted `inbox:write` can triage, assign and
// resolve without ever being able to speak to a customer.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  assignConversation as domainAssign,
  createTicketFromConversation as domainCreateTicket,
  getConversation as domainGet,
  listChannels as domainListChannels,
  listConversations as domainList,
  sendReply as domainSendReply,
  setConversationStatus as domainSetStatus,
} from '~/lib/domain/inbox.domain';
import {
  conversationStatusEnum,
} from '~/lib/schemas/inbox.schema';
import { severityLevelEnum, ticketTypeEnum } from '~/lib/schemas/ticket.schema';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';
import { PaginationInput, buildPaginationOutput } from '../schemas';

// ---------------------------------------------------------------------------
// inbox_list_conversations
// ---------------------------------------------------------------------------

const listInput = PaginationInput.extend({
  status: z.array(conversationStatusEnum).optional(),
  channel_id: z.string().uuid().optional(),
  assigned_agent_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  has_ticket: z
    .boolean()
    .optional()
    .describe('true: only conversations already linked to a ticket. false: only unlinked ones.'),
  search: z.string().trim().min(1).max(200).optional(),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
});

registry.register({
  name: 'inbox_list_conversations',
  description:
    'List omnichannel conversations (email, WhatsApp, web widget, API) with filters and pagination. Sorted by most recent message first. Use has_ticket: false to find conversations still waiting to be turned into tickets.',
  scope: 'inbox:read',
  inputSchema: listInput,
  meta: { since: '1.2.0', tags: ['inbox', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainList(toDomainContext(ctx), {
        status: input.status,
        channel_id: input.channel_id ?? null,
        assigned_agent_id: input.assigned_agent_id ?? null,
        contact_id: input.contact_id ?? null,
        organization_id: input.organization_id ?? null,
        has_ticket: input.has_ticket ?? null,
        search: input.search ?? null,
        page: input.page,
        limit: input.limit,
        sort_dir: input.sort_dir,
      }),
    );

    return {
      conversations: result.conversations,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

// ---------------------------------------------------------------------------
// inbox_get_conversation
// ---------------------------------------------------------------------------

const getInput = z.object({
  conversation_id: z.string().uuid(),
  include_messages: z.boolean().default(true),
  message_limit: z.number().int().min(1).max(200).default(50),
});

registry.register({
  name: 'inbox_get_conversation',
  description:
    'Get a single conversation with its message thread in chronological order. Messages carry direction (inbound = from the contact, outbound = from the team) and sender_type.',
  scope: 'inbox:read',
  inputSchema: getInput,
  meta: { since: '1.2.0', tags: ['inbox', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainGet(toDomainContext(ctx), input.conversation_id, {
        includeMessages: input.include_messages,
        messageLimit: input.message_limit,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// inbox_send_reply
// ---------------------------------------------------------------------------

const replyInput = z.object({
  conversation_id: z.string().uuid(),
  content: z.string().trim().min(1).max(10_000),
  content_html: z.string().max(50_000).optional(),
  internal: z
    .boolean()
    .default(false)
    .describe(
      'true: store an internal note, nothing is delivered. false: the message is SENT to the customer over the conversation channel.',
    ),
});

registry.register({
  name: 'inbox_send_reply',
  description:
    'Reply to a conversation. With internal: false the message is DELIVERED to the customer through the channel (a real WhatsApp message or email) — treat it as an outward-facing action and confirm the wording first. With internal: true it is stored as a private note instead. Requires the API key to name an acting agent.',
  scope: 'inbox:reply',
  inputSchema: replyInput,
  meta: { since: '1.2.0', tags: ['inbox', 'write', 'outbound'] },
  async handler(ctx, input) {
    return {
      message: unwrap(
        await domainSendReply(toDomainContext(ctx), input.conversation_id, input.content, {
          internal: input.internal,
          contentHtml: input.content_html ?? null,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// inbox_assign_conversation
// ---------------------------------------------------------------------------

const assignInput = z.object({
  conversation_id: z.string().uuid(),
  assigned_agent_id: z.string().uuid().nullable().optional(),
  assigned_group_id: z.string().uuid().nullable().optional(),
});

registry.register({
  name: 'inbox_assign_conversation',
  description:
    'Assign a conversation to an agent and/or group. Pass null to unassign. A conversation still in "open" moves to "pending" when it gains an owner, matching the inbox UI.',
  scope: 'inbox:write',
  inputSchema: assignInput,
  meta: { since: '1.2.0', tags: ['inbox', 'write'] },
  async handler(ctx, input) {
    return {
      conversation: unwrap(
        await domainAssign(toDomainContext(ctx), input.conversation_id, {
          agentId: input.assigned_agent_id,
          groupId: input.assigned_group_id,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// inbox_set_status
// ---------------------------------------------------------------------------

const statusInput = z.object({
  conversation_id: z.string().uuid(),
  status: conversationStatusEnum,
  snoozed_until: z
    .string()
    .datetime()
    .optional()
    .describe('Required when status is "snoozed": ISO timestamp, must be in the future.'),
});

registry.register({
  name: 'inbox_set_status',
  description:
    'Change a conversation status: open, pending, snoozed or resolved. Snoozing requires snoozed_until (a future ISO timestamp); leaving the snoozed state clears that marker.',
  scope: 'inbox:write',
  inputSchema: statusInput,
  meta: { since: '1.2.0', tags: ['inbox', 'write'] },
  async handler(ctx, input) {
    return {
      conversation: unwrap(
        await domainSetStatus(toDomainContext(ctx), input.conversation_id, input.status, {
          snoozedUntil: input.snoozed_until ?? null,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// inbox_create_ticket
// ---------------------------------------------------------------------------

const createTicketInput = z.object({
  conversation_id: z.string().uuid(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().min(1).max(10_000).optional(),
  type: ticketTypeEnum.optional(),
  urgency: severityLevelEnum.optional(),
  impact: severityLevelEnum.optional(),
  category_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
});

registry.register({
  name: 'inbox_create_ticket',
  description:
    'Turn a conversation into a ticket and link the two. Omitted fields are filled from the conversation: the subject becomes the title, the message transcript becomes the description, and the assignee, organization and channel defaults carry over. Fails if the conversation already has a ticket.',
  scope: 'inbox:write',
  inputSchema: createTicketInput,
  meta: { since: '1.2.0', tags: ['inbox', 'tickets', 'write'] },
  async handler(ctx, input) {
    return unwrap(
      await domainCreateTicket(toDomainContext(ctx), input.conversation_id, {
        title: input.title ?? null,
        description: input.description ?? null,
        type: input.type,
        urgency: input.urgency,
        impact: input.impact,
        category_id: input.category_id ?? null,
        organization_id: input.organization_id ?? null,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// inbox_list_channels
// ---------------------------------------------------------------------------

const channelsInput = z.object({
  active_only: z.boolean().default(false),
});

registry.register({
  name: 'inbox_list_channels',
  description:
    'List configured inbox channels and their routing defaults. Credentials are never returned. Use this to resolve a channel_id for filtering conversations.',
  scope: 'inbox:read',
  inputSchema: channelsInput,
  meta: { since: '1.2.0', tags: ['inbox', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainListChannels(toDomainContext(ctx), { activeOnly: input.active_only }),
    );
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __inboxToolsLoaded = true;
