// ---------------------------------------------------------------------------
// MCP Tools — Assets (read-only via MCP; writes stay in admin UI)
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { notFound } from '../errors';
import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

const ASSET_COLUMNS =
  'id, asset_tag, name, asset_type_id, status, serial_number, purchase_date, purchase_cost, location, assigned_to, notes, created_at, updated_at';

const assetStatusEnum = z.enum(['available', 'in_use', 'maintenance', 'retired', 'lost']);

registry.register({
  name: 'assets.list',
  description: 'List assets (CMDB) with filters and pagination.',
  scope: 'assets:read',
  inputSchema: PaginationInput.extend({
    status: z.array(assetStatusEnum).optional(),
    assigned_to: z.string().uuid().optional(),
    asset_type_id: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(120).optional(),
  }),
  meta: { since: '1.0.0', tags: ['assets', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);
    let q = ctx.supabase
      .from('assets')
      .select(ASSET_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('asset_tag', { ascending: true })
      .range(from, to);
    if (input.status?.length) q = q.in('status', input.status);
    if (input.assigned_to) q = q.eq('assigned_to', input.assigned_to);
    if (input.asset_type_id) q = q.eq('asset_type_id', input.asset_type_id);
    if (input.search) {
      const safe = input.search.replace(/[%_,]/g, ' ').trim();
      q = q.or(`asset_tag.ilike.%${safe}%,name.ilike.%${safe}%,serial_number.ilike.%${safe}%`);
    }
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});

registry.register({
  name: 'assets.get',
  description: 'Get a single asset by id or asset_tag.',
  scope: 'assets:read',
  inputSchema: z.object({
    id: z.string().uuid().optional(),
    asset_tag: z.string().min(1).optional(),
  }).refine((v) => v.id || v.asset_tag, { message: 'Either id or asset_tag is required' }),
  meta: { since: '1.0.0', tags: ['assets', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('assets')
      .select(ASSET_COLUMNS)
      .eq('tenant_id', ctx.tenantId);
    if (input.id) q = q.eq('id', input.id);
    else if (input.asset_tag) q = q.eq('asset_tag', input.asset_tag);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Asset');
    return { asset: data };
  },
});
