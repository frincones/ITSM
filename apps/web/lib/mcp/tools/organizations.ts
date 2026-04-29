// ---------------------------------------------------------------------------
// MCP Tools — Organizations (client companies inside a tenant)
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { notFound } from '../errors';
import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

const ORG_COLUMNS =
  'id, name, slug, domain, industry, contact_name, contact_email, contact_phone, sla_id, is_active, max_users, contract_start, contract_end, created_at, updated_at';

registry.register({
  name: 'organizations.list',
  description: 'List client organizations in the tenant. Honors API key org-allowlist when set.',
  scope: 'organizations:read',
  inputSchema: PaginationInput.extend({
    is_active: z.boolean().optional(),
    search: z.string().trim().min(1).max(120).optional(),
  }),
  meta: { since: '1.0.0', tags: ['organizations', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);

    let q = ctx.supabase
      .from('organizations')
      .select(ORG_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('name', { ascending: true })
      .range(from, to);

    if (typeof input.is_active === 'boolean') {
      q = q.eq('is_active', input.is_active);
    }

    if (input.search) {
      const safe = input.search.replace(/[%_,]/g, ' ').trim();
      q = q.or(`name.ilike.%${safe}%,domain.ilike.%${safe}%,slug.ilike.%${safe}%`);
    }

    const orgFilter = ctx.resolveOrgFilter();
    if (orgFilter) q = q.in('id', orgFilter);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});

registry.register({
  name: 'organizations.get',
  description: 'Get a single organization by id or slug.',
  scope: 'organizations:read',
  inputSchema: z.object({
    id: z.string().uuid().optional(),
    slug: z.string().min(1).optional(),
  }).refine((v) => v.id || v.slug, { message: 'Either id or slug is required' }),
  meta: { since: '1.0.0', tags: ['organizations', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('organizations')
      .select(ORG_COLUMNS + ', settings, brand_colors, address, notes')
      .eq('tenant_id', ctx.tenantId);

    if (input.id) q = q.eq('id', input.id);
    else if (input.slug) q = q.eq('slug', input.slug);

    const orgFilter = ctx.resolveOrgFilter();
    if (orgFilter) q = q.in('id', orgFilter);

    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Organization');
    return { organization: data };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __organizationsToolsLoaded = true;
