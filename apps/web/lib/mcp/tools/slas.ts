// ---------------------------------------------------------------------------
// MCP Tools — SLAs and breach detection (read-only)
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { registry } from '../registry';

registry.register({
  name: 'slas.list',
  description: 'List SLA definitions configured in the tenant.',
  scope: 'slas:read',
  inputSchema: z.object({
    is_active: z.boolean().default(true),
  }),
  meta: { since: '1.0.0', tags: ['slas', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('slas')
      .select('id, name, description, type, calendar_id, target_critical, target_high, target_medium, target_low, is_active, created_at, updated_at')
      .eq('tenant_id', ctx.tenantId)
      .order('name', { ascending: true });
    if (typeof input.is_active === 'boolean') q = q.eq('is_active', input.is_active);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [] };
  },
});

registry.register({
  name: 'slas.get_breaches',
  description: 'Return tickets that have breached SLA OR will breach within `within_minutes`. Defaults to currently breached only.',
  scope: 'slas:read',
  inputSchema: z.object({
    within_minutes: z.number().int().min(0).max(10_080).default(0),
    limit: z.number().int().min(1).max(100).default(50),
    organization_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.0.0', tags: ['slas', 'read', 'analytics'] },
  async handler(ctx, input) {
    const horizon = new Date(Date.now() + input.within_minutes * 60_000).toISOString();

    let q = ctx.supabase
      .from('tickets')
      .select('id, ticket_number, title, status, priority, sla_due_date, sla_breached, organization_id, assigned_agent_id, created_at')
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .not('status', 'in', '(closed,cancelled,resolved)')
      .or(`sla_breached.eq.true,sla_due_date.lte.${horizon}`)
      .order('sla_due_date', { ascending: true })
      .limit(input.limit);

    const orgFilter = ctx.resolveOrgFilter(
      input.organization_id ? [input.organization_id] : null,
    );
    if (orgFilter) q = q.in('organization_id', orgFilter);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], horizon };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __slasToolsLoaded = true;
