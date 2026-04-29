// ---------------------------------------------------------------------------
// MCP Tools — Metrics (read-only analytics)
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { registry } from '../registry';

registry.register({
  name: 'metrics.daily',
  description: 'Read pre-aggregated daily ticket metrics. Aggregates can be filtered by date range, ticket_type, status, and channel.',
  scope: 'metrics:read',
  inputSchema: z.object({
    date_from: z.string().date().optional(),
    date_to: z.string().date().optional(),
    ticket_type: z.string().optional(),
    status: z.string().optional(),
    channel: z.string().optional(),
    limit: z.number().int().min(1).max(366).default(90),
  }),
  meta: { since: '1.0.0', tags: ['metrics', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('daily_metrics')
      .select('date, ticket_type, status, channel, priority, group_id, count, avg_resolution_minutes, sla_met_count, sla_breached_count')
      .eq('tenant_id', ctx.tenantId)
      .order('date', { ascending: false })
      .limit(input.limit);
    if (input.date_from) q = q.gte('date', input.date_from);
    if (input.date_to) q = q.lte('date', input.date_to);
    if (input.ticket_type) q = q.eq('ticket_type', input.ticket_type);
    if (input.status) q = q.eq('status', input.status);
    if (input.channel) q = q.eq('channel', input.channel);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [] };
  },
});

registry.register({
  name: 'metrics.ticket_summary',
  description: 'Live counts of open tickets grouped by status. Cheap, indexed query suitable for dashboards.',
  scope: 'metrics:read',
  inputSchema: z.object({
    organization_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.0.0', tags: ['metrics', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('tickets')
      .select('status, urgency')
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null);

    const orgFilter = ctx.resolveOrgFilter(
      input.organization_id ? [input.organization_id] : null,
    );
    if (orgFilter) q = q.in('organization_id', orgFilter);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const byStatus: Record<string, number> = {};
    const byUrgency: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ status: string; urgency: string }>) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      byUrgency[row.urgency] = (byUrgency[row.urgency] ?? 0) + 1;
    }
    return {
      total: (data ?? []).length,
      by_status: byStatus,
      by_urgency: byUrgency,
    };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __metricsToolsLoaded = true;
