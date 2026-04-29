// ---------------------------------------------------------------------------
// MCP Tools — Changes (ITIL Change Management) — read-only
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { notFound } from '../errors';
import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

const CHANGE_LIST_COLUMNS =
  'id, change_number, title, status, change_type, risk_level, scheduled_start, scheduled_end, actual_start, actual_end, category_id, assigned_agent_id, assigned_group_id, created_at, updated_at';
const CHANGE_DETAIL_COLUMNS = CHANGE_LIST_COLUMNS + ', description, impact_analysis, rollback_plan, implementation_plan';

const changeStatusEnum = z.enum([
  'new', 'evaluation', 'approval_pending', 'approved', 'scheduled',
  'in_progress', 'testing', 'implemented', 'rolled_back', 'closed', 'rejected',
]);
const changeTypeEnum = z.enum(['standard', 'normal', 'emergency']);

registry.register({
  name: 'changes.list',
  description: 'List change requests (ITIL) with filters and pagination.',
  scope: 'changes:read',
  inputSchema: PaginationInput.extend({
    status: z.array(changeStatusEnum).optional(),
    change_type: changeTypeEnum.optional(),
    scheduled_after: z.string().datetime().optional(),
    scheduled_before: z.string().datetime().optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
  meta: { since: '1.0.0', tags: ['changes', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);
    let q = ctx.supabase
      .from('changes')
      .select(CHANGE_LIST_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (input.status?.length) q = q.in('status', input.status);
    if (input.change_type) q = q.eq('change_type', input.change_type);
    if (input.scheduled_after) q = q.gte('scheduled_start', input.scheduled_after);
    if (input.scheduled_before) q = q.lte('scheduled_start', input.scheduled_before);
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
  name: 'changes.get',
  description: 'Get a single change by id or change_number.',
  scope: 'changes:read',
  inputSchema: z.object({
    id: z.string().uuid().optional(),
    change_number: z.string().min(1).optional(),
  }).refine((v) => v.id || v.change_number, { message: 'Either id or change_number is required' }),
  meta: { since: '1.0.0', tags: ['changes', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('changes')
      .select(CHANGE_DETAIL_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null);
    if (input.id) q = q.eq('id', input.id);
    else if (input.change_number) q = q.eq('change_number', input.change_number);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Change');
    return { change: data };
  },
});
