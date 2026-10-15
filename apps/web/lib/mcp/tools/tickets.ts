// ---------------------------------------------------------------------------
// MCP Tools — Tickets
// ---------------------------------------------------------------------------
// Read + write operations on tickets, scoped to the caller's tenant via
// explicit `.eq('tenant_id', ctx.tenantId)` on every query (REGLA #6).
//
// We intentionally do NOT call the existing server actions in
// apps/web/lib/actions/tickets.ts because those rely on auth.uid() to
// resolve the tenant — invalid for API-key callers. Instead we replicate
// the minimal logic required, deliberately leaving advanced behavior
// (auto-assign round robin, AI classification, follower notifications)
// to the existing UI flows so this module never modifies them.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  ticketStatusEnum,
  ticketTypeEnum,
  severityLevelEnum,
} from '~/lib/schemas/ticket.schema';

import {
  addFollowup as domainAddFollowup,
  assignTicket as domainAssignTicket,
  changeTicketStatus as domainChangeStatus,
  createTicket as domainCreateTicket,
} from '~/lib/domain/tickets.domain';

import type { MCPContext } from '../context';
import { toDomainContext, unwrap } from '../domain-bridge';
import { invalidParams, notFound } from '../errors';
import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

// Columns we expose externally — keep the surface deliberate.
const TICKET_LIST_COLUMNS =
  'id, ticket_number, title, type, status, urgency, impact, priority, organization_id, category_id, requester_id, requester_email, assigned_agent_id, assigned_group_id, channel, sla_due_date, sla_breached, tags, created_at, updated_at, resolved_at, closed_at';

const TICKET_DETAIL_COLUMNS = TICKET_LIST_COLUMNS + ', description, description_html, ai_summary, ai_suggested_solution, custom_fields, first_response_at, escalation_level';

// ---------------------------------------------------------------------------
// tickets.list
// ---------------------------------------------------------------------------

const listInput = PaginationInput.extend({
  status: z.array(ticketStatusEnum).optional(),
  type: z.array(ticketTypeEnum).optional(),
  urgency: severityLevelEnum.optional(),
  assigned_agent_id: z.string().uuid().optional(),
  assigned_group_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  organization_ids: z.array(z.string().uuid()).optional(),
  requester_id: z.string().uuid().optional(),
  created_after: z.string().datetime().optional(),
  created_before: z.string().datetime().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'priority', 'sla_due_date']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
});

registry.register({
  name: 'tickets_list',
  description: 'List tickets in the tenant with filters, pagination, and sorting. Returns summary fields only — use tickets_get for full detail.',
  scope: 'tickets:read',
  inputSchema: listInput,
  meta: { since: '1.0.0', tags: ['tickets', 'read'] },
  async handler(ctx: MCPContext, input) {
    const { from, to } = rangeFromPagination(input);

    let query = ctx.supabase
      .from('tickets')
      .select(TICKET_LIST_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .order(input.sort_by, { ascending: input.sort_dir === 'asc' })
      .range(from, to);

    if (input.status && input.status.length > 0) query = query.in('status', input.status);
    if (input.type && input.type.length > 0) query = query.in('type', input.type);
    if (input.urgency) query = query.eq('urgency', input.urgency);
    if (input.assigned_agent_id) query = query.eq('assigned_agent_id', input.assigned_agent_id);
    if (input.assigned_group_id) query = query.eq('assigned_group_id', input.assigned_group_id);
    if (input.requester_id) query = query.eq('requester_id', input.requester_id);
    if (input.created_after) query = query.gte('created_at', input.created_after);
    if (input.created_before) query = query.lte('created_at', input.created_before);

    // Apply org-level scoping: AND-merge caller filter with key allowlist.
    const requestedOrgs = input.organization_id
      ? [input.organization_id]
      : input.organization_ids ?? null;
    const orgFilter = ctx.resolveOrgFilter(requestedOrgs);
    if (orgFilter && orgFilter.length > 0) {
      query = query.in('organization_id', orgFilter);
    }

    if (input.search) {
      const safe = input.search.replace(/[%_,]/g, ' ').trim();
      if (safe.length > 0) {
        query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
      }
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      data: data ?? [],
      pagination: buildPaginationOutput(input, count),
    };
  },
});

// ---------------------------------------------------------------------------
// tickets.get
// ---------------------------------------------------------------------------

const getInput = z.object({
  id: z.string().uuid().optional(),
  ticket_number: z.string().min(1).optional(),
  include_followups: z.boolean().default(false),
  include_tasks: z.boolean().default(false),
  include_solutions: z.boolean().default(false),
}).refine((v) => v.id || v.ticket_number, {
  message: 'Either id or ticket_number is required',
});

registry.register({
  name: 'tickets_get',
  description: 'Get a single ticket by id or ticket_number. Optionally include followups, tasks, and solutions.',
  scope: 'tickets:read',
  inputSchema: getInput,
  meta: { since: '1.0.0', tags: ['tickets', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('tickets')
      .select(TICKET_DETAIL_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null);

    if (input.id) q = q.eq('id', input.id);
    else if (input.ticket_number) q = q.eq('ticket_number', input.ticket_number);

    const orgFilter = ctx.resolveOrgFilter();
    if (orgFilter) q = q.in('organization_id', orgFilter);

    const { data: ticket, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw notFound('Ticket');

    const ticketId = (ticket as unknown as { id: string }).id;
    const result: Record<string, unknown> = { ticket };

    if (input.include_followups) {
      const { data } = await ctx.supabase
        .from('ticket_followups')
        .select('id, content, content_html, is_private, author_id, author_type, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      result.followups = data ?? [];
    }

    if (input.include_tasks) {
      const { data } = await ctx.supabase
        .from('ticket_tasks')
        .select('id, title, description, status, assigned_agent_id, due_date, estimated_hours, completed_at, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      result.tasks = data ?? [];
    }

    if (input.include_solutions) {
      const { data } = await ctx.supabase
        .from('ticket_solutions')
        .select('id, content, agent_id, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });
      result.solutions = data ?? [];
    }

    return result;
  },
});

// ---------------------------------------------------------------------------
// tickets.search (basic ilike — semantic search lives in kb.search via pgvector)
// ---------------------------------------------------------------------------

registry.register({
  name: 'tickets_search',
  description: 'Search tickets by title and description using case-insensitive substring match. For semantic search use kb_search against the knowledge base.',
  scope: 'tickets:read',
  inputSchema: z.object({
    query: z.string().min(2).max(200),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  meta: { since: '1.0.0', tags: ['tickets', 'read', 'search'] },
  async handler(ctx, input) {
    const safe = input.query.replace(/[%_,]/g, ' ').trim();
    let q = ctx.supabase
      .from('tickets')
      .select(TICKET_LIST_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
      .order('created_at', { ascending: false })
      .limit(input.limit);

    const orgFilter = ctx.resolveOrgFilter();
    if (orgFilter) q = q.in('organization_id', orgFilter);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], query: input.query };
  },
});

// ---------------------------------------------------------------------------
// tickets.create
// ---------------------------------------------------------------------------

const createInput = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(10_000),
  type: ticketTypeEnum.default('incident'),
  urgency: severityLevelEnum.default('medium'),
  impact: severityLevelEnum.default('medium'),
  organization_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  requester_id: z.string().uuid().optional(),
  requester_email: z.string().email().optional(),
  assigned_agent_id: z.string().uuid().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
});

registry.register({
  name: 'tickets_create',
  description:
    'Create a ticket. Runs the same pipeline as the web UI: the database assigns ticket_number and computes priority from urgency+impact, then the ticket is auto-assigned to the organization default owner, the creator is added as a follower, and the creation notification is sent. Pass assigned_agent_id to skip auto-assignment and set the owner explicitly.',
  scope: 'tickets:write',
  inputSchema: createInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    // When the key is org-scoped and the caller named no organization, we
    // can only infer one if the allowlist is unambiguous.
    const orgFilter = ctx.resolveOrgFilter(
      input.organization_id ? [input.organization_id] : null,
    );
    const inferredOrg =
      input.organization_id ??
      (orgFilter && orgFilter.length === 1 ? orgFilter[0] : null);

    // The domain layer owns the allowlist check, side effects and errors.
    return {
      ticket: unwrap(
        await domainCreateTicket(
          toDomainContext(ctx),
          {
            title: input.title,
            description: input.description,
            type: input.type,
            urgency: input.urgency,
            impact: input.impact,
            organization_id: inferredOrg,
            category_id: input.category_id ?? null,
            requester_id: input.requester_id ?? null,
            requester_email: input.requester_email ?? null,
            assigned_agent_id: input.assigned_agent_id ?? null,
            tags: input.tags,
            channel: 'api',
          },
          // An API caller is not a person browsing the app, so there is no
          // "creator" to subscribe unless the key names an acting agent.
          { autoFollowCreator: !!ctx.caller.agentId },
        ),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// tickets.update
// ---------------------------------------------------------------------------

const updateInput = z.object({
  // Accepts `ticket_id` for consistency with every other tickets_* tool,
  // and keeps `id` working for existing callers. One of the two is
  // required — enforced by the refinement below, since neither can be
  // marked required on its own.
  ticket_id: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().min(1).max(10_000).optional(),
  type: ticketTypeEnum.optional(),
  urgency: severityLevelEnum.optional(),
  impact: severityLevelEnum.optional(),
  category_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
}).refine((v) => !!(v.ticket_id ?? v.id), {
  message: 'ticket_id is required',
  path: ['ticket_id'],
});

registry.register({
  name: 'tickets_update',
  description: 'Update mutable fields on a ticket. For status transitions use tickets_transition_status. For assignment use tickets_assign.',
  scope: 'tickets:write',
  inputSchema: updateInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    const { ticket_id, id, ...patch } = input;
    const targetId = ticket_id ?? id;
    // The schema's refinement already guarantees one of the two is present,
    // but that constraint is not expressible in the inferred type — and an
    // undefined id here would update by `id IS NULL`, matching nothing.
    if (!targetId) throw invalidParams('ticket_id is required');

    // An update with no mutable field would quietly succeed and return the
    // untouched row, which reads as "it worked" to an agent.
    if (Object.keys(patch).length === 0) {
      throw invalidParams('Provide at least one field to update');
    }

    let q = ctx.supabase
      .from('tickets')
      .update(patch)
      .eq('tenant_id', ctx.tenantId)
      .eq('id', targetId)
      .is('deleted_at', null);

    const orgFilter = ctx.resolveOrgFilter();
    if (orgFilter) q = q.in('organization_id', orgFilter);

    const { data, error } = await q.select(TICKET_DETAIL_COLUMNS).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Ticket');
    return { ticket: data };
  },
});

// ---------------------------------------------------------------------------
// tickets.add_comment (followup)
// ---------------------------------------------------------------------------

const addCommentInput = z.object({
  ticket_id: z.string().uuid(),
  content: z.string().trim().min(1).max(50_000),
  content_html: z.string().max(200_000).optional(),
  is_private: z.boolean().default(false),
});

registry.register({
  name: 'tickets_add_comment',
  description:
    'Add a followup (comment) to a ticket. A public comment is the authoritative first response and stamps first_response_at, which feeds SLA compliance — use is_private: true for internal notes that should not count as answering the client. Requires the API key to name an acting agent, since every comment records an author.',
  scope: 'tickets:comment',
  inputSchema: addCommentInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return {
      followup: unwrap(
        await domainAddFollowup(toDomainContext(ctx), input.ticket_id, {
          content: input.content,
          content_html: input.content_html ?? null,
          is_private: input.is_private,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// tickets.assign
// ---------------------------------------------------------------------------

const assignInput = z.object({
  ticket_id: z.string().uuid(),
  assigned_agent_id: z.string().uuid().nullable().optional(),
  assigned_group_id: z.string().uuid().nullable().optional(),
});

registry.register({
  name: 'tickets_assign',
  description:
    'Assign a ticket to an agent and/or group, and subscribe the new assignee to the ticket. Pass null to unassign. Does not change the status — use tickets_transition_status for that.',
  scope: 'tickets:assign',
  inputSchema: assignInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    return {
      ticket: unwrap(
        await domainAssignTicket(toDomainContext(ctx), input.ticket_id, {
          agentId: input.assigned_agent_id,
          groupId: input.assigned_group_id,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// tickets.transition_status
// ---------------------------------------------------------------------------

const transitionInput = z.object({
  ticket_id: z.string().uuid(),
  status: ticketStatusEnum,
  resolution_note: z.string().max(10_000).optional(),
  /**
   * Contractual justification for pausing the SLA clock. Required in spirit
   * for detenido / backlog / esperando_ventana: omitting it records
   * 'priorizacion_interna', which is logged but does NOT pause, because an
   * unjustified pause is a deadline we could not defend to the client.
   */
  pause_reason: z
    .enum([
      'espera_cliente_info',
      'espera_cliente_validacion',
      'dependencia_tercero',
      'ventana_mantenimiento',
      'fuerza_mayor',
      'priorizacion_interna',
    ])
    .optional(),
});

registry.register({
  name: 'tickets_transition_status',
  description:
    'Change a ticket status. Only transitions valid from the current status are accepted (a rejected one returns a conflict naming both states). Running this applies the same side effects as the web UI: resolved/closed timestamps, reopen counting, testing-stage tracking, SLA pause tagging, status notifications to the assignee, and the NPS survey on resolved/closed. Pass pause_reason when moving to detenido, backlog or esperando_ventana — omitting it records a reason that does NOT pause the SLA clock.',
  scope: 'tickets:write',
  inputSchema: transitionInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    const domainCtx = toDomainContext(ctx);

    const ticket = unwrap(
      await domainChangeStatus(domainCtx, input.ticket_id, input.status, {
        pauseReason: input.pause_reason ?? null,
      }),
    );

    // Attach the resolution note after the transition so a rejected
    // transition never leaves an orphan note behind.
    if (input.resolution_note) {
      unwrap(
        await domainAddFollowup(domainCtx, input.ticket_id, {
          content: input.resolution_note,
          is_private: true,
        }),
      );
    }

    return { ticket };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __ticketsToolsLoaded = true;
