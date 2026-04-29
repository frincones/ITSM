// ---------------------------------------------------------------------------
// MCP Tools — Problems (ITIL Problem Management)
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { notFound } from '../errors';
import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

const PROBLEM_LIST_COLUMNS =
  'id, problem_number, title, status, urgency, impact, priority, category_id, assigned_agent_id, assigned_group_id, resolved_at, created_at, updated_at';
const PROBLEM_DETAIL_COLUMNS = PROBLEM_LIST_COLUMNS + ', description, root_cause, root_cause_ai, workaround, solution, ai_pattern_detected';

const problemStatusEnum = z.enum([
  'new', 'accepted', 'analysis', 'root_cause_identified',
  'solution_planned', 'resolved', 'closed',
]);
const severityEnum = z.enum(['low', 'medium', 'high', 'critical']);

registry.register({
  name: 'problems.list',
  description: 'List problems (ITIL) with filters and pagination.',
  scope: 'problems:read',
  inputSchema: PaginationInput.extend({
    status: z.array(problemStatusEnum).optional(),
    urgency: severityEnum.optional(),
    assigned_agent_id: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
  meta: { since: '1.0.0', tags: ['problems', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);
    let q = ctx.supabase
      .from('problems')
      .select(PROBLEM_LIST_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (input.status?.length) q = q.in('status', input.status);
    if (input.urgency) q = q.eq('urgency', input.urgency);
    if (input.assigned_agent_id) q = q.eq('assigned_agent_id', input.assigned_agent_id);
    if (input.search) {
      const safe = input.search.replace(/[%_,]/g, ' ').trim();
      q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});

registry.register({
  name: 'problems.get',
  description: 'Get a single problem by id or problem_number, including linked tickets.',
  scope: 'problems:read',
  inputSchema: z.object({
    id: z.string().uuid().optional(),
    problem_number: z.string().min(1).optional(),
    include_linked_tickets: z.boolean().default(false),
  }).refine((v) => v.id || v.problem_number, { message: 'Either id or problem_number is required' }),
  meta: { since: '1.0.0', tags: ['problems', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('problems')
      .select(PROBLEM_DETAIL_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null);
    if (input.id) q = q.eq('id', input.id);
    else if (input.problem_number) q = q.eq('problem_number', input.problem_number);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Problem');

    const result: Record<string, unknown> = { problem: data };
    if (input.include_linked_tickets) {
      const problemId = (data as unknown as { id: string }).id;
      const { data: links } = await ctx.supabase
        .from('problem_ticket_links')
        .select('ticket_id, link_type, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('problem_id', problemId);
      result.linked_tickets = links ?? [];
    }
    return result;
  },
});

registry.register({
  name: 'problems.create',
  description: 'Create a new problem.',
  scope: 'problems:write',
  inputSchema: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(10_000).optional(),
    urgency: severityEnum.default('medium'),
    impact: severityEnum.default('medium'),
    category_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.0.0', tags: ['problems', 'write'] },
  async handler(ctx, input) {
    const { data, error } = await ctx.supabase
      .from('problems')
      .insert({
        tenant_id: ctx.tenantId,
        title: input.title,
        description: input.description ?? null,
        urgency: input.urgency,
        impact: input.impact,
        category_id: input.category_id ?? null,
        status: 'new',
      })
      .select(PROBLEM_DETAIL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { problem: data };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __problemsToolsLoaded = true;
