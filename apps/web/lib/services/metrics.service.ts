// ---------------------------------------------------------------------------
// Metrics Service — Business Logic Service
// ---------------------------------------------------------------------------
// Pure business logic. No 'use server' — used by Server Actions, cron jobs,
// and API routes.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

interface TicketMetrics {
  id: string;
  ticket_id: string;
  tenant_id: string;
  first_response_minutes: number | null;
  resolution_minutes: number | null;
  sla_met: boolean | null;
  reopen_count: number;
  handoff_count: number;
  followup_count: number;
  updated_at: string;
}

interface DailyMetricsRow {
  id: string;
  tenant_id: string;
  date: string;
  type: string;
  status: string;
  channel: string | null;
  priority: number | null;
  urgency: string | null;
  assigned_group_id: string | null;
  count: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  sla_met_count: number;
  sla_breached_count: number;
}

interface GranularMetric {
  label: string;
  count: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  sla_met_count: number;
  sla_breached_count: number;
}

interface AgentPerformance {
  agent_id: string;
  agent_name: string;
  tickets_assigned: number;
  tickets_resolved: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  sla_met_count: number;
  sla_breached_count: number;
  satisfaction_avg: number | null;
}

// ---------------------------------------------------------------------------
// 1. calculateTicketMetrics
// ---------------------------------------------------------------------------

/**
 * Computes metrics for a single ticket and upserts them into `ticket_metrics`.
 *
 * Metrics computed:
 *   - first_response_minutes: time between created_at and first_response_at
 *   - resolution_minutes: time between created_at and resolved_at
 *   - sla_met: whether the ticket was resolved before sla_due_date
 *   - reopen_count: number of times the ticket went from resolved -> in_progress
 *   - handoff_count: number of agent reassignments
 *   - followup_count: number of followup comments
 */
export async function calculateTicketMetrics(
  client: SupabaseClient,
  ticketId: string,
): Promise<ServiceResult<TicketMetrics>> {
  // Fetch the ticket
  const { data: ticket, error: ticketError } = await client
    .from('tickets')
    .select(
      'id, tenant_id, status, created_at, first_response_at, resolved_at, closed_at, sla_due_date, sla_breached',
    )
    .eq('id', ticketId)
    .single();

  if (ticketError || !ticket) {
    return { data: null, error: ticketError?.message ?? 'Ticket not found' };
  }

  const createdAt = new Date(ticket.created_at).getTime();

  // first_response_minutes
  let firstResponseMinutes: number | null = null;
  if (ticket.first_response_at) {
    const firstResponseAt = new Date(ticket.first_response_at).getTime();
    firstResponseMinutes = Math.round((firstResponseAt - createdAt) / 60_000);
  }

  // resolution_minutes
  let resolutionMinutes: number | null = null;
  if (ticket.resolved_at) {
    const resolvedAt = new Date(ticket.resolved_at).getTime();
    resolutionMinutes = Math.round((resolvedAt - createdAt) / 60_000);
  }

  // sla_met
  let slaMet: boolean | null = null;
  if (ticket.sla_due_date) {
    if (ticket.sla_breached) {
      slaMet = false;
    } else if (ticket.resolved_at) {
      const resolvedAt = new Date(ticket.resolved_at).getTime();
      const slaDueDate = new Date(ticket.sla_due_date).getTime();
      slaMet = resolvedAt <= slaDueDate;
    } else if (ticket.status === 'closed' || ticket.status === 'cancelled') {
      slaMet = !ticket.sla_breached;
    }
    // else: still open, sla_met remains null
  }

  // reopen_count: count audit_log entries where status changed from 'resolved' to 'in_progress'
  const { count: reopenCount } = await client
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('resource_type', 'ticket')
    .eq('resource_id', ticketId)
    .eq('action', 'status_change')
    .contains('changes', { old_status: 'resolved', new_status: 'in_progress' });

  // handoff_count: count distinct agent assignments in audit_log
  const { count: handoffCount } = await client
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('resource_type', 'ticket')
    .eq('resource_id', ticketId)
    .eq('action', 'assign');

  // followup_count
  const { count: followupCount } = await client
    .from('ticket_followups')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticketId);

  const now = new Date().toISOString();

  // Upsert into ticket_metrics
  const { data: metrics, error: upsertError } = await client
    .from('ticket_metrics')
    .upsert(
      {
        ticket_id: ticketId,
        tenant_id: ticket.tenant_id,
        first_response_minutes: firstResponseMinutes,
        resolution_minutes: resolutionMinutes,
        sla_met: slaMet,
        reopen_count: reopenCount ?? 0,
        handoff_count: handoffCount ?? 0,
        followup_count: followupCount ?? 0,
        updated_at: now,
      },
      { onConflict: 'ticket_id' },
    )
    .select()
    .single();

  if (upsertError) {
    return { data: null, error: upsertError.message };
  }

  return { data: metrics as unknown as TicketMetrics, error: null };
}

// ---------------------------------------------------------------------------
// 2. snapshotDailyMetrics
// ---------------------------------------------------------------------------

/**
 * Aggregates ticket data for a specific tenant and date, then inserts rows
 * into the `daily_metrics` table grouped by type, status, channel, priority,
 * urgency, and assigned_group_id.
 *
 * Designed to run once daily at midnight from a Vercel cron job.
 */
export async function snapshotDailyMetrics(
  client: SupabaseClient,
  tenantId: string,
  date: string, // "YYYY-MM-DD"
): Promise<ServiceResult<{ inserted: number }>> {
  const dateStart = `${date}T00:00:00.000Z`;
  const dateEnd = `${date}T23:59:59.999Z`;

  // Delete existing metrics for this date to allow re-runs
  await client
    .from('daily_metrics')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('date', date);

  // Fetch all tickets that were active (created or updated) on this date
  const { data: tickets, error: fetchError } = await client
    .from('tickets')
    .select(
      'id, type, status, source, priority, urgency, assigned_group_id, sla_due_date, sla_breached, created_at, resolved_at, first_response_at',
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .or(`created_at.gte.${dateStart},updated_at.gte.${dateStart}`)
    .or(`created_at.lte.${dateEnd},updated_at.lte.${dateEnd}`);

  if (fetchError) {
    return { data: null, error: fetchError.message };
  }

  if (!tickets || tickets.length === 0) {
    return { data: { inserted: 0 }, error: null };
  }

  // Group tickets by type + status + source (channel) + urgency + group
  const groups = new Map<string, {
    type: string;
    status: string;
    channel: string | null;
    priority: number | null;
    urgency: string | null;
    assigned_group_id: string | null;
    count: number;
    total_first_response: number;
    first_response_count: number;
    total_resolution: number;
    resolution_count: number;
    sla_met: number;
    sla_breached: number;
  }>();

  for (const ticket of tickets) {
    const key = [
      ticket.type ?? 'unknown',
      ticket.status ?? 'unknown',
      ticket.source ?? 'manual',
      ticket.urgency ?? 'medium',
      ticket.assigned_group_id ?? 'none',
    ].join('|');

    let group = groups.get(key);
    if (!group) {
      group = {
        type: ticket.type ?? 'unknown',
        status: ticket.status ?? 'unknown',
        channel: ticket.source ?? null,
        priority: ticket.priority ?? null,
        urgency: ticket.urgency ?? null,
        assigned_group_id: ticket.assigned_group_id ?? null,
        count: 0,
        total_first_response: 0,
        first_response_count: 0,
        total_resolution: 0,
        resolution_count: 0,
        sla_met: 0,
        sla_breached: 0,
      };
      groups.set(key, group);
    }

    group.count++;

    // First response time
    if (ticket.first_response_at && ticket.created_at) {
      const frMinutes = Math.round(
        (new Date(ticket.first_response_at).getTime() - new Date(ticket.created_at).getTime()) / 60_000,
      );
      group.total_first_response += frMinutes;
      group.first_response_count++;
    }

    // Resolution time
    if (ticket.resolved_at && ticket.created_at) {
      const resMinutes = Math.round(
        (new Date(ticket.resolved_at).getTime() - new Date(ticket.created_at).getTime()) / 60_000,
      );
      group.total_resolution += resMinutes;
      group.resolution_count++;
    }

    // SLA compliance
    if (ticket.sla_due_date) {
      if (ticket.sla_breached) {
        group.sla_breached++;
      } else if (
        ticket.status === 'closed' ||
        ticket.status === 'resolved' ||
        ticket.status === 'cancelled'
      ) {
        group.sla_met++;
      }
    }
  }

  // Insert aggregated rows
  const rows = Array.from(groups.values()).map((g) => ({
    tenant_id: tenantId,
    date,
    type: g.type,
    status: g.status,
    channel: g.channel,
    priority: g.priority,
    urgency: g.urgency,
    assigned_group_id: g.assigned_group_id,
    count: g.count,
    avg_first_response_minutes:
      g.first_response_count > 0
        ? Math.round(g.total_first_response / g.first_response_count)
        : null,
    avg_resolution_minutes:
      g.resolution_count > 0
        ? Math.round(g.total_resolution / g.resolution_count)
        : null,
    sla_met_count: g.sla_met,
    sla_breached_count: g.sla_breached,
  }));

  if (rows.length === 0) {
    return { data: { inserted: 0 }, error: null };
  }

  const { error: insertError } = await client
    .from('daily_metrics')
    .insert(rows);

  if (insertError) {
    return { data: null, error: insertError.message };
  }

  return { data: { inserted: rows.length }, error: null };
}

// ---------------------------------------------------------------------------
// 3. getGranularMetrics
// ---------------------------------------------------------------------------

/**
 * Queries daily_metrics for a granular breakdown report.
 *
 * Returns labelled metrics including:
 *   - Cerrados Garantia, Cerrados Soporte
 *   - Nuevos Garantia, Nuevos Soporte
 *   - En Progreso Soporte, En Progreso Garantia
 *   - Pendientes, Testing, Fracaso Testing
 *   - And other type+status combinations
 */
export async function getGranularMetrics(
  client: SupabaseClient,
  tenantId: string,
  dateRange: { from: string; to: string },
): Promise<ServiceResult<GranularMetric[]>> {
  const { data: rows, error } = await client
    .from('daily_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('date', dateRange.from)
    .lte('date', dateRange.to);

  if (error) {
    return { data: null, error: error.message };
  }

  if (!rows || rows.length === 0) {
    return { data: [], error: null };
  }

  // Aggregate by type + status to build labelled metrics
  const aggregated = new Map<string, {
    count: number;
    total_fr: number;
    fr_count: number;
    total_res: number;
    res_count: number;
    sla_met: number;
    sla_breached: number;
  }>();

  for (const row of rows as unknown as DailyMetricsRow[]) {
    const label = buildMetricLabel(row.type, row.status);
    let agg = aggregated.get(label);

    if (!agg) {
      agg = {
        count: 0,
        total_fr: 0,
        fr_count: 0,
        total_res: 0,
        res_count: 0,
        sla_met: 0,
        sla_breached: 0,
      };
      aggregated.set(label, agg);
    }

    agg.count += row.count;

    if (row.avg_first_response_minutes !== null) {
      agg.total_fr += row.avg_first_response_minutes * row.count;
      agg.fr_count += row.count;
    }

    if (row.avg_resolution_minutes !== null) {
      agg.total_res += row.avg_resolution_minutes * row.count;
      agg.res_count += row.count;
    }

    agg.sla_met += row.sla_met_count;
    agg.sla_breached += row.sla_breached_count;
  }

  const metrics: GranularMetric[] = Array.from(aggregated.entries()).map(
    ([label, agg]) => ({
      label,
      count: agg.count,
      avg_first_response_minutes:
        agg.fr_count > 0 ? Math.round(agg.total_fr / agg.fr_count) : null,
      avg_resolution_minutes:
        agg.res_count > 0 ? Math.round(agg.total_res / agg.res_count) : null,
      sla_met_count: agg.sla_met,
      sla_breached_count: agg.sla_breached,
    }),
  );

  return { data: metrics, error: null };
}

// ---------------------------------------------------------------------------
// 4. getSLAComplianceRate
// ---------------------------------------------------------------------------

/**
 * Calculates the percentage of tickets with `sla_met = true` within the
 * given date range.
 */
export async function getSLAComplianceRate(
  client: SupabaseClient,
  tenantId: string,
  dateRange: { from: string; to: string },
): Promise<ServiceResult<{
  compliance_rate: number;
  total: number;
  met: number;
  breached: number;
}>> {
  const { data: rows, error } = await client
    .from('daily_metrics')
    .select('sla_met_count, sla_breached_count')
    .eq('tenant_id', tenantId)
    .gte('date', dateRange.from)
    .lte('date', dateRange.to);

  if (error) {
    return { data: null, error: error.message };
  }

  let met = 0;
  let breached = 0;

  for (const row of rows ?? []) {
    met += (row as { sla_met_count: number }).sla_met_count ?? 0;
    breached += (row as { sla_breached_count: number }).sla_breached_count ?? 0;
  }

  const total = met + breached;
  const complianceRate = total > 0 ? Math.round((met / total) * 10000) / 100 : 100;

  return {
    data: {
      compliance_rate: complianceRate,
      total,
      met,
      breached,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 5. getAgentPerformance
// ---------------------------------------------------------------------------

/**
 * Computes performance metrics per agent for the given date range.
 *
 * Queries `ticket_metrics` joined with `tickets` to aggregate per-agent stats.
 */
export async function getAgentPerformance(
  client: SupabaseClient,
  tenantId: string,
  dateRange: { from: string; to: string },
): Promise<ServiceResult<AgentPerformance[]>> {
  // Fetch tickets with their metrics in the date range
  const { data: tickets, error: ticketError } = await client
    .from('tickets')
    .select(
      'id, assigned_agent_id, status, created_at, first_response_at, resolved_at, sla_due_date, sla_breached',
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .gte('created_at', `${dateRange.from}T00:00:00.000Z`)
    .lte('created_at', `${dateRange.to}T23:59:59.999Z`)
    .not('assigned_agent_id', 'is', null);

  if (ticketError) {
    return { data: null, error: ticketError.message };
  }

  if (!tickets || tickets.length === 0) {
    return { data: [], error: null };
  }

  // Aggregate per agent
  const agentMap = new Map<string, {
    tickets_assigned: number;
    tickets_resolved: number;
    total_fr: number;
    fr_count: number;
    total_res: number;
    res_count: number;
    sla_met: number;
    sla_breached: number;
  }>();

  for (const ticket of tickets) {
    const agentId = ticket.assigned_agent_id as string;
    let stats = agentMap.get(agentId);

    if (!stats) {
      stats = {
        tickets_assigned: 0,
        tickets_resolved: 0,
        total_fr: 0,
        fr_count: 0,
        total_res: 0,
        res_count: 0,
        sla_met: 0,
        sla_breached: 0,
      };
      agentMap.set(agentId, stats);
    }

    stats.tickets_assigned++;

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      stats.tickets_resolved++;
    }

    if (ticket.first_response_at && ticket.created_at) {
      const frMinutes = Math.round(
        (new Date(ticket.first_response_at).getTime() -
          new Date(ticket.created_at).getTime()) /
          60_000,
      );
      stats.total_fr += frMinutes;
      stats.fr_count++;
    }

    if (ticket.resolved_at && ticket.created_at) {
      const resMinutes = Math.round(
        (new Date(ticket.resolved_at).getTime() -
          new Date(ticket.created_at).getTime()) /
          60_000,
      );
      stats.total_res += resMinutes;
      stats.res_count++;
    }

    if (ticket.sla_due_date) {
      if (ticket.sla_breached) {
        stats.sla_breached++;
      } else if (ticket.status === 'resolved' || ticket.status === 'closed') {
        stats.sla_met++;
      }
    }
  }

  // Fetch agent names
  const agentIds = Array.from(agentMap.keys());
  const { data: agents } = await client
    .from('agents')
    .select('id, name')
    .in('id', agentIds);

  const agentNameMap = new Map<string, string>();
  if (agents) {
    for (const agent of agents) {
      agentNameMap.set(agent.id, agent.name ?? 'Unknown');
    }
  }

  // NPS per agent (average 0-10 over responded surveys in window). We
  // weight by the agent recorded on the survey at send time — not the
  // current ticket assignee — so reassignments don't distort credit.
  const npsByAgent = new Map<string, { total: number; count: number }>();
  if (agentIds.length > 0) {
    const { data: npsRows } = await client
      .from('nps_surveys')
      .select('agent_id, score, responded_at')
      .eq('tenant_id', tenantId)
      .not('responded_at', 'is', null)
      .in('agent_id', agentIds)
      .gte('responded_at', `${dateRange.from}T00:00:00.000Z`)
      .lte('responded_at', `${dateRange.to}T23:59:59.999Z`);
    for (const r of npsRows ?? []) {
      if (!r.agent_id || r.score === null) continue;
      const bucket = npsByAgent.get(r.agent_id) ?? { total: 0, count: 0 };
      bucket.total += r.score as number;
      bucket.count += 1;
      npsByAgent.set(r.agent_id, bucket);
    }
  }

  // Build results
  const results: AgentPerformance[] = Array.from(agentMap.entries()).map(
    ([agentId, stats]) => {
      const nps = npsByAgent.get(agentId);
      return {
        agent_id: agentId,
        agent_name: agentNameMap.get(agentId) ?? 'Unknown',
        tickets_assigned: stats.tickets_assigned,
        tickets_resolved: stats.tickets_resolved,
        avg_first_response_minutes:
          stats.fr_count > 0 ? Math.round(stats.total_fr / stats.fr_count) : null,
        avg_resolution_minutes:
          stats.res_count > 0 ? Math.round(stats.total_res / stats.res_count) : null,
        sla_met_count: stats.sla_met,
        sla_breached_count: stats.sla_breached,
        satisfaction_avg:
          nps && nps.count > 0
            ? Math.round((nps.total / nps.count) * 10) / 10
            : null,
      };
    },
  );

  // Sort by tickets_resolved descending
  results.sort((a, b) => b.tickets_resolved - a.tickets_resolved);

  return { data: results, error: null };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a human-readable label for a type+status combination.
 * Maps to the Spanish labels used in the NovaDesk reporting UI.
 */
const TYPE_LABELS: Record<string, string> = {
  warranty: 'Garantia',
  support: 'Soporte',
  incident: 'Incidente',
  request: 'Solicitud',
  backlog: 'Backlog',
  desarrollo_pendiente: 'Desarrollo Pendiente',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevos',
  assigned: 'Asignados',
  in_progress: 'En Progreso',
  pending: 'Pendientes',
  detenido: 'Detenidos',
  testing: 'Testing',
  resolved: 'Resueltos',
  closed: 'Cerrados',
  cancelled: 'Cancelados',
  backlog: 'Backlog',
};

function buildMetricLabel(type: string, status: string): string {
  const typeLabel = TYPE_LABELS[type] ?? type;
  const statusLabel = STATUS_LABELS[status] ?? status;
  return `${statusLabel} ${typeLabel}`;
}

function labelType(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function labelStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Ticket row we use to compute metrics. */
interface TicketForMetrics {
  id: string;
  status: string;
  type: string;
  urgency: string;
  category_id: string | null;
  assigned_agent_id: string | null;
  organization_id: string | null;
  created_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  sla_breached: boolean | null;
  first_response_at: string | null;
}

function inRange(value: string | null | undefined, fromIso: string, toIso: string): boolean {
  if (!value) return false;
  return value >= fromIso && value <= toIso;
}

// ---------------------------------------------------------------------------
// 6. getReportDashboard — All-in-one report data for the reports page
// ---------------------------------------------------------------------------

export interface ReportDashboard {
  // ── KPIs ────────────────────────────────────────────────────────────────
  // Activity in the selected date range
  createdInRange: number;
  closedInRange: number;
  resolvedInRange: number;
  avgResolutionMinutes: number | null;
  slaCompliance: { rate: number; met: number; breached: number; total: number };

  // Snapshot at the moment the report is generated
  openTicketsSnapshot: number;

  // Back-compat aliases so existing UIs keep working
  totalTickets: number;   // = createdInRange + closedInRange (unique tickets)
  openTickets: number;    // = openTicketsSnapshot
  closedTickets: number;  // = closedInRange

  // ── Activity matrix (date-filtered) ─────────────────────────────────────
  // Rows like "Cerrados Soporte: 12" meaning 12 tickets whose closed_at
  // falls in the range AND whose type = support.
  activityMetrics: GranularMetric[];

  // ── Snapshot matrix (current state, NO date filter) ─────────────────────
  // Rows like "Pendientes Soporte: 12" meaning 12 tickets currently in
  // status='pending' and type=support — regardless of when they were created.
  snapshotMetrics: GranularMetric[];

  // ── Breakdowns (over tickets with activity in range) ────────────────────
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  byCategory: Array<{ category_id: string | null; category_name: string; count: number }>;
  byUrgency: Array<{ urgency: string; count: number }>;
  byAgent: AgentPerformance[];
  byOrganization: Array<{ org_id: string; org_name: string; count: number }>;

  // Trends (daily) — created vs closed per day in range
  dailyTrend: Array<{ date: string; created: number; closed: number }>;

  // Deprecated alias: activityMetrics merged with snapshotMetrics, kept for
  // older callers + the Exportar CSV helper. Will be removed.
  gestionSoporte: GranularMetric[];
}

export async function getReportDashboard(
  client: SupabaseClient,
  tenantId: string,
  dateRange: { from: string; to: string },
  organizationId?: string | null,
): Promise<ServiceResult<ReportDashboard>> {
  try {
    const fromIso = `${dateRange.from}T00:00:00.000Z`;
    const toIso = `${dateRange.to}T23:59:59.999Z`;

    // Pull every non-deleted ticket for this tenant/org. We filter in-memory
    // by the correct date column per metric (created_at, closed_at, or
    // resolved_at). For a tenant with a few thousand tickets this is fine
    // and dramatically simpler than doing four parallel queries.
    let q = client
      .from('tickets')
      .select(
        'id, status, type, urgency, category_id, assigned_agent_id, organization_id, created_at, resolved_at, closed_at, sla_breached, first_response_at',
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    if (organizationId) q = q.eq('organization_id', organizationId);

    const [ticketResult, categoriesResult, orgsResult, agentsResult] = await Promise.all([
      q,
      client.from('categories').select('id, name').eq('tenant_id', tenantId),
      client.from('organizations').select('id, name').eq('tenant_id', tenantId).eq('is_active', true),
      client.from('agents').select('id, name').eq('tenant_id', tenantId),
    ]);

    const allTickets = (ticketResult.data ?? []) as TicketForMetrics[];
    const categories = categoriesResult.data ?? [];
    const orgs = orgsResult.data ?? [];
    const agents = agentsResult.data ?? [];

    const catMap = new Map(categories.map((c: any) => [c.id, c.name]));
    const orgMap = new Map(orgs.map((o: any) => [o.id, o.name]));
    const agentMap = new Map(agents.map((a: any) => [a.id, a.name]));

    // ── Date-sliced ticket sets ─────────────────────────────────────────────
    const createdInRange = allTickets.filter((t) => inRange(t.created_at, fromIso, toIso));
    const closedInRange = allTickets.filter((t) => inRange(t.closed_at, fromIso, toIso));
    const resolvedInRange = allTickets.filter((t) => inRange(t.resolved_at, fromIso, toIso));

    // Snapshot: whatever is currently open.
    const TERMINAL = new Set(['closed', 'resolved', 'cancelled']);
    const snapshotOpen = allTickets.filter((t) => !TERMINAL.has(t.status));

    // ── KPIs ────────────────────────────────────────────────────────────────
    // Unique tickets that had any activity in the range.
    const activityIds = new Set<string>();
    createdInRange.forEach((t) => activityIds.add(t.id));
    closedInRange.forEach((t) => activityIds.add(t.id));
    resolvedInRange.forEach((t) => activityIds.add(t.id));

    // avg resolution time — only over tickets whose resolved_at lives in the
    // range. Negative deltas (bad legacy data) are clamped to 0.
    let totalResMinutes = 0;
    let resCount = 0;
    for (const t of resolvedInRange) {
      if (!t.resolved_at || !t.created_at) continue;
      const delta =
        (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60000;
      if (delta < 0) continue;
      totalResMinutes += delta;
      resCount++;
    }

    // SLA — only over tickets closed in range
    let slaMet = 0;
    let slaBreached = 0;
    for (const t of closedInRange) {
      if (t.sla_breached === true) slaBreached++;
      else if (t.sla_breached === false) slaMet++;
    }
    const slaTotal = slaMet + slaBreached;

    // ── Activity matrix (Nuevos/Cerrados/Resueltos by type) ─────────────────
    // Each row reflects a transition that happened in the range.
    const activityMap = new Map<string, number>();
    const addActivity = (label: string) => {
      activityMap.set(label, (activityMap.get(label) ?? 0) + 1);
    };
    for (const t of createdInRange) {
      addActivity(`Creados ${labelType(t.type)}`);
    }
    for (const t of closedInRange) {
      addActivity(`Cerrados ${labelType(t.type)}`);
    }
    for (const t of resolvedInRange) {
      // Avoid double-counting: resolved → closed normally fires closed in
      // the same window, so only track resolutions that are NOT already
      // counted as closed in range.
      if (!closedInRange.some((c) => c.id === t.id)) {
        addActivity(`Resueltos ${labelType(t.type)}`);
      }
    }

    // ── Snapshot matrix (current state — ignores dates) ─────────────────────
    const snapshotMap = new Map<string, number>();
    for (const t of snapshotOpen) {
      const label = `${labelStatus(t.status)} ${labelType(t.type)}`;
      snapshotMap.set(label, (snapshotMap.get(label) ?? 0) + 1);
    }

    // ── Breakdowns — computed over tickets with activity in range ───────────
    const activityTickets = allTickets.filter((t) => activityIds.has(t.id));

    const statusCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    const catCounts = new Map<string, number>();
    const urgCounts = new Map<string, number>();
    const orgCounts = new Map<string, number>();
    for (const t of activityTickets) {
      statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1);
      typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
      const cid = t.category_id ?? 'uncategorized';
      catCounts.set(cid, (catCounts.get(cid) ?? 0) + 1);
      urgCounts.set(t.urgency, (urgCounts.get(t.urgency) ?? 0) + 1);
      if (t.organization_id) orgCounts.set(t.organization_id, (orgCounts.get(t.organization_id) ?? 0) + 1);
    }

    // By agent — counts every ticket touched in range, plus resolution stats
    const agentCounts = new Map<
      string,
      { assigned: number; resolved: number; totalRes: number; resCount: number; slaMet: number; slaBreached: number }
    >();
    for (const t of activityTickets) {
      if (!t.assigned_agent_id) continue;
      let s = agentCounts.get(t.assigned_agent_id);
      if (!s) s = { assigned: 0, resolved: 0, totalRes: 0, resCount: 0, slaMet: 0, slaBreached: 0 };
      s.assigned++;
      if (t.resolved_at && inRange(t.resolved_at, fromIso, toIso)) {
        s.resolved++;
        if (t.created_at) {
          const delta =
            (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60000;
          if (delta >= 0) {
            s.totalRes += delta;
            s.resCount++;
          }
        }
      }
      if (t.closed_at && inRange(t.closed_at, fromIso, toIso)) {
        if (t.sla_breached === true) s.slaBreached++;
        else if (t.sla_breached === false) s.slaMet++;
      }
      agentCounts.set(t.assigned_agent_id, s);
    }

    // Daily trend — created + closed per day in the range
    const dailyMap = new Map<string, { created: number; closed: number }>();
    const touchDay = (day: string, key: 'created' | 'closed') => {
      let d = dailyMap.get(day);
      if (!d) d = { created: 0, closed: 0 };
      d[key]++;
      dailyMap.set(day, d);
    };
    for (const t of createdInRange) touchDay(t.created_at.slice(0, 10), 'created');
    for (const t of closedInRange) if (t.closed_at) touchDay(t.closed_at.slice(0, 10), 'closed');

    const activityMetrics: GranularMetric[] = Array.from(activityMap.entries())
      .map(([label, count]) => ({
        label,
        count,
        avg_first_response_minutes: null,
        avg_resolution_minutes: null,
        sla_met_count: 0,
        sla_breached_count: 0,
      }))
      .sort((a, b) => b.count - a.count);

    const snapshotMetrics: GranularMetric[] = Array.from(snapshotMap.entries())
      .map(([label, count]) => ({
        label,
        count,
        avg_first_response_minutes: null,
        avg_resolution_minutes: null,
        sla_met_count: 0,
        sla_breached_count: 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      data: {
        // New KPIs
        createdInRange: createdInRange.length,
        closedInRange: closedInRange.length,
        resolvedInRange: resolvedInRange.length,
        openTicketsSnapshot: snapshotOpen.length,
        avgResolutionMinutes: resCount > 0 ? Math.round(totalResMinutes / resCount) : null,
        slaCompliance: {
          rate: slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : 100,
          met: slaMet,
          breached: slaBreached,
          total: slaTotal,
        },
        // Back-compat aliases
        totalTickets: activityIds.size,
        openTickets: snapshotOpen.length,
        closedTickets: closedInRange.length,
        // New split matrices
        activityMetrics,
        snapshotMetrics,
        // Legacy combined (activity first, then snapshot) for old CSV exports
        gestionSoporte: [...activityMetrics, ...snapshotMetrics],
        // Breakdowns
        byStatus: Array.from(statusCounts.entries())
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count),
        byType: Array.from(typeCounts.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
        byCategory: Array.from(catCounts.entries())
          .map(([cid, count]) => ({
            category_id: cid === 'uncategorized' ? null : cid,
            category_name: catMap.get(cid) ?? 'Sin categoría',
            count,
          }))
          .sort((a, b) => b.count - a.count),
        byUrgency: Array.from(urgCounts.entries())
          .map(([urgency, count]) => ({ urgency, count }))
          .sort((a, b) => b.count - a.count),
        byAgent: Array.from(agentCounts.entries())
          .map(([aid, s]) => ({
            agent_id: aid,
            agent_name: agentMap.get(aid) ?? 'Sin asignar',
            tickets_assigned: s.assigned,
            tickets_resolved: s.resolved,
            avg_first_response_minutes: null,
            avg_resolution_minutes: s.resCount > 0 ? Math.round(s.totalRes / s.resCount) : null,
            sla_met_count: s.slaMet,
            sla_breached_count: s.slaBreached,
            satisfaction_avg: null,
          }))
          .sort((a, b) => b.tickets_assigned - a.tickets_assigned),
        byOrganization: Array.from(orgCounts.entries())
          .map(([oid, count]) => ({ org_id: oid, org_name: orgMap.get(oid) ?? 'Sin org', count }))
          .sort((a, b) => b.count - a.count),
        dailyTrend: Array.from(dailyMap.entries())
          .map(([date, d]) => ({ date, ...d }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
