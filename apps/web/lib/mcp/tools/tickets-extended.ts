// ---------------------------------------------------------------------------
// MCP Tools — Tickets, the rest of the surface
// ---------------------------------------------------------------------------
// Core ticket tools live in tools/tickets.ts. This module adds what the UI
// could already do and the MCP could not: tasks, solutions, followers,
// relations, attachments, the testing gate and the clause-4 commitments.
//
// The clause-4 tools carry contractual weight. Their validation rules come
// straight from lib/actions/tickets.ts and are not reinterpreted here: the
// exact wording of those rules is what gets argued over when a client
// disputes a compliance figure.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  TICKET_RELATION_TYPES,
  addSolution as domainAddSolution,
  addTask as domainAddTask,
  completeTask as domainCompleteTask,
  followTicket as domainFollow,
  listAttachments as domainListAttachments,
  listFollowers as domainListFollowers,
  listTasks as domainListTasks,
  recordCorrectionPlan as domainCorrectionPlan,
  recordMitigation as domainMitigation,
  relateTickets as domainRelate,
  setClientRank as domainSetRank,
  setTestingResult as domainTestingResult,
  unfollowTicket as domainUnfollow,
} from '~/lib/domain/tickets-extended.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';

const relationType = z.enum(TICKET_RELATION_TYPES);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_add_task',
  description:
    'Add a checklist task to a ticket. Tasks break the work into steps that can be assigned and ticked off independently of the ticket status.',
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional(),
    assigned_agent_id: z.string().uuid().optional(),
    due_date: z.string().datetime().optional(),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'tasks', 'write'] },
  async handler(ctx, input) {
    const { ticket_id, ...fields } = input;
    return { task: unwrap(await domainAddTask(toDomainContext(ctx), ticket_id, fields)) };
  },
});

registry.register({
  name: 'tickets_complete_task',
  description:
    'Mark a ticket task done, or reopen it with completed: false. Completing every task does not close the ticket — use tickets_transition_status for that.',
  scope: 'tickets:write',
  inputSchema: z.object({
    task_id: z.string().uuid(),
    completed: z.boolean().default(true),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'tasks', 'write'] },
  async handler(ctx, input) {
    return {
      task: unwrap(await domainCompleteTask(toDomainContext(ctx), input.task_id, input.completed)),
    };
  },
});

registry.register({
  name: 'tickets_list_tasks',
  description: 'The checklist tasks on a ticket, in the order they were added.',
  scope: 'tickets:read',
  inputSchema: z.object({ ticket_id: z.string().uuid() }),
  meta: { since: '1.8.0', tags: ['tickets', 'tasks', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainListTasks(toDomainContext(ctx), input.ticket_id));
  },
});

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_add_solution',
  description:
    'Record the solution applied to a ticket. Distinct from a comment: this is the durable answer, and approved solutions are the raw material for knowledge base articles. Requires the API key to name an acting agent.',
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    content: z.string().trim().min(1).max(20_000),
    content_html: z.string().max(50_000).optional(),
    is_approved: z
      .boolean()
      .default(false)
      .describe('Mark it as the accepted solution rather than a proposal.'),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return {
      solution: unwrap(
        await domainAddSolution(toDomainContext(ctx), input.ticket_id, input.content, {
          contentHtml: input.content_html ?? null,
          isApproved: input.is_approved,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// Followers
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_follow',
  description:
    'Subscribe an agent to a ticket so they receive its notifications. Idempotent. Agents are also subscribed automatically when they create, are assigned, comment on or are mentioned in a ticket.',
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    agent_id: z.string().uuid(),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return unwrap(await domainFollow(toDomainContext(ctx), input.ticket_id, input.agent_id));
  },
});

registry.register({
  name: 'tickets_unfollow',
  description: 'Unsubscribe an agent from a ticket. They stop receiving its notifications.',
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    agent_id: z.string().uuid(),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return unwrap(await domainUnfollow(toDomainContext(ctx), input.ticket_id, input.agent_id));
  },
});

registry.register({
  name: 'tickets_followers',
  description:
    'Who is subscribed to a ticket, why they were added (creator, assignment, mention, manual) and whether it was automatic. Use it to check who will be notified before posting a reply.',
  scope: 'tickets:read',
  inputSchema: z.object({ ticket_id: z.string().uuid() }),
  meta: { since: '1.8.0', tags: ['tickets', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainListFollowers(toDomainContext(ctx), input.ticket_id));
  },
});

// ---------------------------------------------------------------------------
// Relations and attachments
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_relate',
  description:
    'Link two tickets: duplicate, related, parent, child, blocks or blocked_by. Use duplicate to fold a repeat report into the original, and blocks/blocked_by to make a dependency explicit.',
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    related_ticket_id: z.string().uuid(),
    relation_type: relationType,
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return unwrap(
      await domainRelate(
        toDomainContext(ctx),
        input.ticket_id,
        input.related_ticket_id,
        input.relation_type,
      ),
    );
  },
});

registry.register({
  name: 'tickets_attachments',
  description:
    'Files attached to a ticket, with name, type and size. Storage paths are not returned — fetch a file through the application, not directly from storage.',
  scope: 'tickets:read',
  inputSchema: z.object({ ticket_id: z.string().uuid() }),
  meta: { since: '1.8.0', tags: ['tickets', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainListAttachments(toDomainContext(ctx), input.ticket_id));
  },
});

// ---------------------------------------------------------------------------
// Testing gate
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_set_testing_result',
  description:
    "Record the outcome of client testing: passed, failed, or null to clear it. Only writable while the ticket is in 'testing' — allowing it from any status leaves stale results on tickets that have already moved on.",
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    result: z.enum(['passed', 'failed']).nullable(),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return {
      ticket: unwrap(
        await domainTestingResult(toDomainContext(ctx), input.ticket_id, input.result),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// Clause 4
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_record_mitigation',
  description:
    'Record that mitigation was delivered for a ticket (contract clause 4). Only applies to tickets that carry a mitigation deadline, and can only be recorded ONCE — the first record is the one the contract measures, so do not use it to amend a note.',
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    note: z
      .string()
      .trim()
      .min(1)
      .max(5000)
      .describe('What was done to mitigate the impact, in terms the client can verify.'),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'contract', 'write'] },
  async handler(ctx, input) {
    return {
      ticket: unwrap(await domainMitigation(toDomainContext(ctx), input.ticket_id, input.note)),
    };
  },
});

registry.register({
  name: 'tickets_record_correction_plan',
  description:
    'Record a correction plan with a committed date (contract clause 4). Only applies to critical or high severity tickets — clause 4 requires a committed correction date only for those. The committed date becomes a contractual promise, so confirm it with whoever will deliver it.',
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    committed_date: dateOnly.describe('The date the correction is promised for.'),
    note: z.string().trim().min(1).max(5000),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'contract', 'write'] },
  async handler(ctx, input) {
    return {
      ticket: unwrap(
        await domainCorrectionPlan(
          toDomainContext(ctx),
          input.ticket_id,
          input.committed_date,
          input.note,
        ),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// Client priority ordering
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_set_client_rank',
  description:
    "Set the client's own priority ordering for a ticket (1-50, or null to clear). Ranks are unique per client AND ticket type, so the same client can hold rank 1 in warranty and rank 1 in backlog — they are separate queues. This is the client's stated preference, not the computed priority.",
  scope: 'tickets:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    rank: z.number().int().min(1).max(50).nullable(),
  }),
  meta: { since: '1.8.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return {
      ticket: unwrap(await domainSetRank(toDomainContext(ctx), input.ticket_id, input.rank)),
    };
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __ticketsExtendedToolsLoaded = true;
