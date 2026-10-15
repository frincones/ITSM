// ---------------------------------------------------------------------------
// Domain layer — reporting, SLA and contract cycles
// ---------------------------------------------------------------------------
// Read-only. Most of this wraps Postgres functions that already encode the
// contractual arithmetic (business minutes, pause reasons, quota cycles,
// credit thresholds), so the work here is scoping and shaping, not
// recalculating. Re-implementing any of it in TypeScript would mean two
// answers to the same contractual question.
//
// IMPORTANT caveat, verified against production on 14-oct-2026:
//
//   - 644 of 727 tickets have sla_due_date = NULL
//   - NONE of the four organizations has an sla_id
//
// So `sla_breached` is false almost everywhere because no SLA was ever
// resolved, not because targets were met. Any compliance figure derived
// from the tickets table alone reads optimistically. The cycle functions
// (support_cycle_compliance) work off the contract and are the trustworthy
// source. Tools built on this expose `coverage` so a caller can tell the
// difference instead of reporting a false 100%.
// ---------------------------------------------------------------------------

import 'server-only';

import { fail, ok, resolveOrgScope, type DomainContext, type DomainResult } from './types';

/** Resolves the contract covering a date for an organization. */
async function resolveContractId(
  ctx: DomainContext,
  organizationId: string,
  at?: string | null,
): Promise<string | null> {
  const { actor, client } = ctx;
  const day = at ?? new Date().toISOString().slice(0, 10);

  const { data } = await client
    .from('organization_support_contracts')
    .select('id, effective_from, effective_to')
    .eq('tenant_id', actor.tenantId)
    .eq('organization_id', organizationId)
    .order('effective_from', { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    effective_from: string | null;
    effective_to: string | null;
  }>;

  const covering = rows.find(
    (r) => (r.effective_from ?? '0000-01-01') <= day && day <= (r.effective_to ?? '9999-12-31'),
  );
  return covering?.id ?? rows[0]?.id ?? null;
}

/** Guards an organization id against the caller's allowlist. */
function orgAllowed(ctx: DomainContext, organizationId: string): boolean {
  const scope = resolveOrgScope(ctx.actor, [organizationId]);
  return !scope || scope.includes(organizationId);
}

// ---------------------------------------------------------------------------
// SLA coverage — the honesty check
// ---------------------------------------------------------------------------

/**
 * How much of the ticket population actually has an SLA attached.
 *
 * This exists so a caller never reports compliance without knowing the
 * denominator. With coverage near zero, `sla_breached = false` means
 * "no target was ever set", not "we met it".
 */
export async function getSlaCoverage(
  ctx: DomainContext,
  filters: { organization_id?: string | null } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (filters.organization_id && !orgAllowed(ctx, filters.organization_id)) {
    return fail('organization_id is outside the caller allowlist', 'forbidden');
  }

  const base = () => {
    let q = client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', actor.tenantId)
      .is('deleted_at', null);
    const scope = resolveOrgScope(
      actor,
      filters.organization_id ? [filters.organization_id] : null,
    );
    if (scope) q = q.in('organization_id', scope);
    return q;
  };

  const [total, withSla, breached] = await Promise.all([
    base(),
    base().not('sla_due_date', 'is', null),
    base().eq('sla_breached', true),
  ]);

  const totalCount = total.count ?? 0;
  const withSlaCount = withSla.count ?? 0;

  // Organizations without an sla_id can never produce a due date.
  let orgQuery = client
    .from('organizations')
    .select('id, name, sla_id')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true);
  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) orgQuery = orgQuery.in('id', orgScope);
  const { data: orgs } = await orgQuery;

  const withoutSlaPolicy = (orgs ?? [])
    .filter((o) => !(o as { sla_id: string | null }).sla_id)
    .map((o) => (o as { name: string }).name);

  return ok({
    tickets_total: totalCount,
    tickets_with_sla_target: withSlaCount,
    tickets_without_sla_target: totalCount - withSlaCount,
    coverage_pct: totalCount ? Math.round((withSlaCount / totalCount) * 1000) / 10 : 0,
    tickets_marked_breached: breached.count ?? 0,
    organizations_without_sla_policy: withoutSlaPolicy,
    interpretation:
      withSlaCount === 0
        ? 'No ticket has an SLA target, so breach counts are meaningless. Compliance cannot be reported from the tickets table; use the contract cycle tools instead.'
        : withSlaCount < totalCount
          ? `Only ${withSlaCount} of ${totalCount} tickets carry an SLA target. Breach rates describe that subset only.`
          : 'Every ticket carries an SLA target.',
  });
}

// ---------------------------------------------------------------------------
// SLA — at risk and per-ticket status
// ---------------------------------------------------------------------------

export async function getTicketsAtRisk(
  ctx: DomainContext,
  warnFraction = 0.75,
): Promise<DomainResult<{ tickets: unknown[]; warn_fraction: number }>> {
  const { actor, client } = ctx;

  const { data, error } = await client.rpc('sla_tickets_at_risk', {
    p_warn_fraction: warnFraction,
  });
  if (error) return fail(error.message, 'internal');

  // The function is tenant-wide; scope its output to this caller.
  const rows = (data ?? []) as Array<{ tenant_id?: string; organization_id?: string }>;
  const orgScope = resolveOrgScope(actor);
  const scoped = rows
    .filter((r) => !r.tenant_id || r.tenant_id === actor.tenantId)
    .filter((r) => !orgScope || !r.organization_id || orgScope.includes(r.organization_id));

  return ok({ tickets: scoped, warn_fraction: warnFraction });
}

export async function getTicketSlaStatus(
  ctx: DomainContext,
  ticketId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  // Confirm the ticket is visible to this caller before asking about it.
  let q = client
    .from('tickets')
    .select('id, ticket_number, organization_id, sla_due_date, sla_breached, status')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);
  const orgScope = resolveOrgScope(actor);
  if (orgScope) q = q.in('organization_id', orgScope);

  const { data: ticket } = await q.maybeSingle();
  if (!ticket) return fail('Ticket not found', 'not_found');

  const [{ data: status }, { data: paused }, { data: clause4 }] = await Promise.all([
    client.rpc('ticket_sla_status', { p_ticket_id: ticketId }),
    // p_until is required, not optional: paused minutes are accumulated up to
    // a point in time. "Now" is what a caller asking about a live ticket
    // means, and ticket_sla_status already reports the same figure frozen at
    // resolution for closed ones.
    client.rpc('ticket_paused_business_minutes', {
      p_ticket_id: ticketId,
      p_until: new Date().toISOString(),
    }),
    client.rpc('ticket_clause4_status', { p_ticket_id: ticketId }),
  ]);

  return ok({
    ticket,
    sla_status: Array.isArray(status) ? (status[0] ?? null) : status,
    paused_business_minutes: paused ?? 0,
    clause4: Array.isArray(clause4) ? (clause4[0] ?? null) : clause4,
    ...(ticket.sla_due_date
      ? {}
      : {
          note: 'This ticket has no SLA due date, so no target applies to it. That is a configuration gap, not compliance.',
        }),
  });
}

// ---------------------------------------------------------------------------
// Contract cycles — the trustworthy compliance source
// ---------------------------------------------------------------------------

async function cycleCall(
  ctx: DomainContext,
  organizationId: string,
  // Narrowed to the cycle functions this helper actually dispatches to:
  // the client types rpc() against the known function names.
  fn: 'support_cycle_usage' | 'support_cycle_compliance' | 'support_termination_risk',
  at?: string | null,
): Promise<DomainResult<unknown>> {
  if (!orgAllowed(ctx, organizationId)) {
    return fail('organization_id is outside the caller allowlist', 'forbidden');
  }

  const contractId = await resolveContractId(ctx, organizationId, at);
  if (!contractId) {
    return fail(
      'This organization has no support contract, so cycle figures cannot be computed',
      'not_found',
    );
  }

  const params: Record<string, unknown> = { p_contract_id: contractId };
  if (at) params.p_at = at;

  const { data, error } = await ctx.client.rpc(fn, params);
  if (error) return fail(error.message, 'internal');

  return ok(Array.isArray(data) ? (data[0] ?? null) : data);
}

export async function getCycleUsage(
  ctx: DomainContext,
  organizationId: string,
  at?: string | null,
): Promise<DomainResult<unknown>> {
  return cycleCall(ctx, organizationId, 'support_cycle_usage', at);
}

export async function getCycleCompliance(
  ctx: DomainContext,
  organizationId: string,
  at?: string | null,
): Promise<DomainResult<unknown>> {
  return cycleCall(ctx, organizationId, 'support_cycle_compliance', at);
}

export async function getTerminationRisk(
  ctx: DomainContext,
  organizationId: string,
  at?: string | null,
): Promise<DomainResult<unknown>> {
  return cycleCall(ctx, organizationId, 'support_termination_risk', at);
}

export async function getDailyActivity(
  ctx: DomainContext,
  organizationId: string,
  at?: string | null,
): Promise<DomainResult<{ days: unknown[] }>> {
  if (!orgAllowed(ctx, organizationId)) {
    return fail('organization_id is outside the caller allowlist', 'forbidden');
  }

  const contractId = await resolveContractId(ctx, organizationId, at);
  if (!contractId) {
    return fail('This organization has no support contract', 'not_found');
  }

  const params: Record<string, unknown> = { p_contract_id: contractId };
  if (at) params.p_at = at;

  const { data, error } = await ctx.client.rpc('support_cycle_daily_activity', params);
  if (error) return fail(error.message, 'internal');
  return ok({ days: (data ?? []) as unknown[] });
}

// ---------------------------------------------------------------------------
// Operational reports
// ---------------------------------------------------------------------------

export interface AgentWorkloadFilters {
  organization_id?: string | null;
  include_inactive?: boolean;
}

/**
 * Per-agent workload: open, in progress, resolved and closed counts.
 *
 * Counted from tickets rather than daily_metrics so the numbers are current
 * rather than as of the last snapshot.
 */
export async function getAgentWorkload(
  ctx: DomainContext,
  filters: AgentWorkloadFilters = {},
): Promise<DomainResult<{ agents: unknown[] }>> {
  const { actor, client } = ctx;

  if (filters.organization_id && !orgAllowed(ctx, filters.organization_id)) {
    return fail('organization_id is outside the caller allowlist', 'forbidden');
  }

  let agentQuery = client
    .from('agents')
    .select('id, name, email, role, is_active')
    .eq('tenant_id', actor.tenantId);
  if (!filters.include_inactive) agentQuery = agentQuery.eq('is_active', true);

  const { data: agents, error: agentError } = await agentQuery;
  if (agentError) return fail(agentError.message, 'internal');

  let ticketQuery = client
    .from('tickets')
    .select('assigned_agent_id, status')
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .not('assigned_agent_id', 'is', null);

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) ticketQuery = ticketQuery.in('organization_id', orgScope);

  const { data: tickets, error: ticketError } = await ticketQuery;
  if (ticketError) return fail(ticketError.message, 'internal');

  const OPEN = ['new', 'assigned', 'backlog', 'pending', 'detenido', 'reopened', 'esperando_ventana'];
  const buckets = new Map<string, { open: number; in_progress: number; testing: number; resolved: number; closed: number }>();

  for (const row of (tickets ?? []) as Array<{ assigned_agent_id: string; status: string }>) {
    const b =
      buckets.get(row.assigned_agent_id) ??
      { open: 0, in_progress: 0, testing: 0, resolved: 0, closed: 0 };
    if (row.status === 'in_progress') b.in_progress += 1;
    else if (row.status === 'testing') b.testing += 1;
    else if (row.status === 'resolved') b.resolved += 1;
    else if (row.status === 'closed' || row.status === 'cancelled') b.closed += 1;
    else if (OPEN.includes(row.status)) b.open += 1;
    buckets.set(row.assigned_agent_id, b);
  }

  const result = ((agents ?? []) as Array<{ id: string; name: string }>).map((a) => {
    const b = buckets.get(a.id) ?? { open: 0, in_progress: 0, testing: 0, resolved: 0, closed: 0 };
    return { ...a, ...b, active_total: b.open + b.in_progress + b.testing };
  });

  result.sort((x, y) => y.active_total - x.active_total);
  return ok({ agents: result });
}

export interface TicketStatsFilters {
  organization_id?: string | null;
  created_after?: string | null;
  created_before?: string | null;
}

/**
 * Ticket counts grouped by status, type, urgency, channel and organization.
 *
 * One pass over the filtered set so every breakdown shares the same
 * denominator — separate count queries can disagree when rows change
 * between them.
 */
export async function getTicketStats(
  ctx: DomainContext,
  filters: TicketStatsFilters = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (filters.organization_id && !orgAllowed(ctx, filters.organization_id)) {
    return fail('organization_id is outside the caller allowlist', 'forbidden');
  }

  let query = client
    .from('tickets')
    .select('status, type, urgency, priority, channel, organization_id, sla_breached, resolved_at, closed_at, created_at')
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .limit(5000);

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) query = query.in('organization_id', orgScope);
  if (filters.created_after) query = query.gte('created_at', filters.created_after);
  if (filters.created_before) query = query.lte('created_at', filters.created_before);

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');

  // Through unknown: the rows carry enum unions, which do not overlap with
  // a plain string index signature even though the tallies only read keys.
  const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
  const tally = (key: string) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      const k = (r[key] ?? '(none)') as string;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

  const orgNames = new Map<string, string>();
  if (rows.length) {
    const { data: orgs } = await client
      .from('organizations')
      .select('id, name')
      .eq('tenant_id', actor.tenantId);
    for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) {
      orgNames.set(o.id, o.name);
    }
  }

  const byOrg = rows.reduce<Record<string, number>>((acc, r) => {
    const name = r.organization_id ? (orgNames.get(r.organization_id) ?? r.organization_id) : '(sin cliente)';
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});

  return ok({
    total: rows.length,
    by_status: tally('status'),
    by_type: tally('type'),
    by_urgency: tally('urgency'),
    by_channel: tally('channel'),
    by_organization: byOrg,
    ...(rows.length === 5000
      ? { truncated: true, note: 'Result capped at 5000 tickets; narrow the date range for exact figures.' }
      : {}),
  });
}
