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

import type { MCPContext } from '../context';
import { notFound } from '../errors';
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
  description: 'List tickets in the tenant with filters, pagination, and sorting. Returns summary fields only — use tickets.get for full detail.',
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
        .select('id, content, content_html, is_private, author_agent_id, author_contact_id, source, created_at')
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
  description: 'Search tickets by title and description using case-insensitive substring match. For semantic search use kb.search against the knowledge base.',
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
  tags: z.array(z.string().trim().min(1)).default([]),
});

registry.register({
  name: 'tickets_create',
  description: 'Create a new ticket. Auto-assignment, AI classification, and follower notifications run via the existing trigger/workflow chain — this tool does not bypass them.',
  scope: 'tickets:write',
  inputSchema: createInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    // If the key is org-scoped, force the new ticket into one of the
    // allowed orgs. If caller specified one, it must be in the allowlist.
    const orgFilter = ctx.resolveOrgFilter(
      input.organization_id ? [input.organization_id] : null,
    );
    const organization_id = input.organization_id
      ? (orgFilter && orgFilter.includes(input.organization_id)
          ? input.organization_id
          : (() => { throw new Error('organization_id is outside the API key allowlist'); })())
      : (orgFilter && orgFilter.length === 1 ? orgFilter[0] : null);

    const { data, error } = await ctx.supabase
      .from('tickets')
      .insert({
        tenant_id: ctx.tenantId,
        title: input.title,
        description: input.description,
        type: input.type,
        urgency: input.urgency,
        impact: input.impact,
        organization_id,
        category_id: input.category_id ?? null,
        requester_id: input.requester_id ?? null,
        requester_email: input.requester_email ?? null,
        tags: input.tags,
        status: 'new',
        channel: 'api',
      })
      .select(TICKET_DETAIL_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return { ticket: data };
  },
});

// ---------------------------------------------------------------------------
// tickets.update
// ---------------------------------------------------------------------------

const updateInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().min(1).max(10_000).optional(),
  type: ticketTypeEnum.optional(),
  urgency: severityLevelEnum.optional(),
  impact: severityLevelEnum.optional(),
  category_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

registry.register({
  name: 'tickets_update',
  description: 'Update mutable fields on a ticket. For status transitions use tickets.transition_status. For assignment use tickets.assign.',
  scope: 'tickets:write',
  inputSchema: updateInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    const { id, ...patch } = input;

    let q = ctx.supabase
      .from('tickets')
      .update(patch)
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id)
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
  description: 'Add a public or private followup (comment) to a ticket.',
  scope: 'tickets:comment',
  inputSchema: addCommentInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    // Verify the ticket exists in this tenant + org allowlist.
    let qCheck = ctx.supabase
      .from('tickets')
      .select('id, organization_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', input.ticket_id)
      .is('deleted_at', null);
    const orgFilter = ctx.resolveOrgFilter();
    if (orgFilter) qCheck = qCheck.in('organization_id', orgFilter);
    const { data: ticket, error: checkErr } = await qCheck.maybeSingle();
    if (checkErr) throw new Error(checkErr.message);
    if (!ticket) throw notFound('Ticket');

    const { data, error } = await ctx.supabase
      .from('ticket_followups')
      .insert({
        tenant_id: ctx.tenantId,
        ticket_id: input.ticket_id,
        content: input.content,
        content_html: input.content_html ?? null,
        is_private: input.is_private,
        author_agent_id: ctx.caller.agentId,
        source: 'api',
      })
      .select('id, content, is_private, source, created_at')
      .single();

    if (error) throw new Error(error.message);
    return { followup: data };
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
  description: 'Assign a ticket to an agent and/or group. Pass null to unassign.',
  scope: 'tickets:assign',
  inputSchema: assignInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    const patch: Record<string, unknown> = {};
    if (input.assigned_agent_id !== undefined) patch.assigned_agent_id = input.assigned_agent_id;
    if (input.assigned_group_id !== undefined) patch.assigned_group_id = input.assigned_group_id;
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide assigned_agent_id and/or assigned_group_id');
    }
    // If becoming assigned for the first time, move from 'new' to 'assigned'.
    if (input.assigned_agent_id || input.assigned_group_id) {
      patch.status = 'assigned';
    }

    let q = ctx.supabase
      .from('tickets')
      .update(patch)
      .eq('tenant_id', ctx.tenantId)
      .eq('id', input.ticket_id)
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
// tickets.transition_status
// ---------------------------------------------------------------------------

const transitionInput = z.object({
  ticket_id: z.string().uuid(),
  status: ticketStatusEnum,
  resolution_note: z.string().max(10_000).optional(),
});

registry.register({
  name: 'tickets_transition_status',
  description: 'Change a ticket status. Valid transitions are enforced by the database. Optionally attach a resolution note as a private followup.',
  scope: 'tickets:write',
  inputSchema: transitionInput,
  meta: { since: '1.0.0', tags: ['tickets', 'write'] },
  async handler(ctx, input) {
    const patch: Record<string, unknown> = { status: input.status };
    if (input.status === 'resolved') patch.resolved_at = new Date().toISOString();
    if (input.status === 'closed') patch.closed_at = new Date().toISOString();

    let q = ctx.supabase
      .from('tickets')
      .update(patch)
      .eq('tenant_id', ctx.tenantId)
      .eq('id', input.ticket_id)
      .is('deleted_at', null);

    const orgFilter = ctx.resolveOrgFilter();
    if (orgFilter) q = q.in('organization_id', orgFilter);

    const { data, error } = await q.select(TICKET_DETAIL_COLUMNS).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Ticket');

    if (input.resolution_note) {
      await ctx.supabase.from('ticket_followups').insert({
        tenant_id: ctx.tenantId,
        ticket_id: input.ticket_id,
        content: input.resolution_note,
        is_private: true,
        author_agent_id: ctx.caller.agentId,
        source: 'api',
      });
    }

    return { ticket: data };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __ticketsToolsLoaded = true;
