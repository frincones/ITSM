// ---------------------------------------------------------------------------
// Monthly cycle report — the data behind contract clause 7
// ---------------------------------------------------------------------------
// Cl. 7 obliges TDX to deliver, per cycle and at no cost: ticket volume by
// category and severity, consumption against quota with overage detail, SLA
// compliance and any credits owed, the period's reclassifications, and root
// causes with recommendations.
//
// Every number here comes from a SQL function so the report and any other
// consumer cannot disagree. Nothing is recomputed in TypeScript.
//
// The cycle is NOT a calendar month: it runs from the contract's cycle_start_day
// to the day before the next one (cl. 8 — the 22nd to the 21st for Podenza).
//
// Pure business logic. No 'use server' — used by Server Components & actions.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CycleUsage {
  cycle_start: string;
  cycle_end: string;
  cycle_label: string;
  quota: number;
  /** Raw ticket count for the cycle, before any carry-forward credit. */
  consumed: number;
  /**
   * Net quota credit carried in from reclassifications of tickets whose own
   * cycle already closed (cl. 2). Shown separately rather than netted silently:
   * a client who counts 32 tickets while the report says 30 deserves the
   * arithmetic, not just the answer. Can be negative.
   */
  quota_carried: number;
  consumed_net: number;
  remaining: number;
  overage: number;
  pct_used: number;
  overage_cop: number;
  /** Once true the figures come from the frozen snapshot, not a live count. */
  is_closed: boolean;
}

export interface CycleCompliance {
  cycle_start: string;
  cycle_end: string;
  cycle_label: string;
  is_closed: boolean;
  /** Tickets that actually carried an SLA and are settled. The denominator. */
  measurable: number;
  met: number;
  breached: number;
  /** Still inside their deadline — neither met nor breached yet. */
  pending: number;
  /** No SLA owed: no contract in force, or a classification outside SLA. */
  excluded_count: number;
  /** NULL when nothing was measurable. Never 100 for an empty set. */
  compliance_pct: number | null;
  credit_tickets: number;
  credit_cop: number;
  credit_suppressed: boolean;
  credit_basis: string;
}

export interface CycleReclassification {
  ticket_id: string;
  ticket_number: string;
  title: string;
  from_type: string;
  to_type: string;
  /** 'restituye' | 'consume' | 'sin efecto' */
  quota_effect: string;
  changed_at: string;
}

export interface BandStatus {
  plan_name: string;
  quota: number;
  band_low: number;
  band_high: number;
  /** NULL on the top plan. */
  ascend_at: number | null;
  /** NULL on the bottom plan. */
  descend_at: number | null;
  cycles_considered: number;
  consecutive_above: number;
  consecutive_below: number;
  /** 'ascenso' | 'descenso' | 'estable' */
  direction: string;
  adjustment_due: boolean;
  target_plan: string | null;
  target_fee_cop: number | null;
  effective_from: string | null;
  detail: string;
}

export interface TerminationRisk {
  cycles_evaluated: number;
  below_70_total: number;
  below_70_consecutive: number;
  at_risk: boolean;
  detail: string;
}

export interface CycleReport {
  organizationId: string;
  organizationName: string;
  contractId: string;
  planName: string;
  usage: CycleUsage | null;
  compliance: CycleCompliance | null;
  reclassifications: CycleReclassification[];
  terminationRisk: TerminationRisk | null;
  /**
   * Capacity band (cl. 6). NULL when the contract is not on a catalogue plan,
   * which means it has no band at all.
   */
  band: BandStatus | null;
}

/**
 * Formats a compliance figure the way it must always be shown: with its
 * denominator.
 *
 * The contract as signed sets no minimum volume for credits, so a 3-ticket
 * cycle with one miss reads 66.7% and triggers the maximum 5-ticket credit —
 * about 16.7% of the monthly fee for one late reply. "93%" hides that.
 * "93% (14 de 15)" is what makes the number arguable.
 */
export function formatCompliance(c: CycleCompliance | null): string {
  if (!c || c.compliance_pct === null) return 'Sin datos';
  return `${c.compliance_pct}% (${c.met} de ${c.measurable})`;
}

/**
 * The contract's credit scale, for display next to the computed figure so the
 * client and TDX read the same rule (cl. 5).
 */
export const CREDIT_SCALE = [
  { range: '≥ 95%', credit: 0, label: 'Sin crédito' },
  { range: '90% – 94.99%', credit: 1, label: '1 ticket' },
  { range: '80% – 89.99%', credit: 2, label: '2 tickets' },
  { range: '70% – 79.99%', credit: 3, label: '3 tickets' },
  { range: '< 70%', credit: 5, label: '5 tickets (tope)' },
] as const;

/** The support contract in force for an organization on a given date. */
async function contractFor(
  client: SupabaseClient,
  organizationId: string,
  at: string,
): Promise<{ id: string; plan_name: string } | null> {
  const { data } = await client
    .from('organization_support_contracts')
    .select('id, plan_name')
    .eq('organization_id', organizationId)
    .lte('effective_from', at)
    .or(`effective_to.is.null,effective_to.gte.${at}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { id: string; plan_name: string } | null) ?? null;
}

/**
 * Assembles the clause-7 report for one client and one cycle.
 *
 * Returns null when the organization has no support contract in force on that
 * date. That is not an error — it is the correct answer for a client we owe no
 * SLA, and the caller must render it as "no contract", never as an empty report
 * with zeroes that read like perfect performance.
 */
export async function getCycleReport(
  client: SupabaseClient,
  organizationId: string,
  /** Any date inside the wanted cycle. Defaults to today in Bogotá. */
  at?: string,
): Promise<CycleReport | null> {
  const atDate =
    at ??
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

  const contract = await contractFor(client, organizationId, atDate);
  if (!contract) return null;

  const { data: org } = await client
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle();

  const [usageRes, complianceRes, reclassRes, riskRes, bandRes] =
    await Promise.all([
    client.rpc('support_cycle_usage', {
      p_contract_id: contract.id,
      p_at: atDate,
    }),
    client.rpc('support_cycle_compliance', {
      p_contract_id: contract.id,
      p_at: atDate,
    }),
    client.rpc('support_cycle_reclassifications', {
      p_contract_id: contract.id,
      p_at: atDate,
    }),
    client.rpc('support_termination_risk', {
      p_contract_id: contract.id,
      p_at: atDate,
    }),
    client.rpc('support_band_status', {
      p_contract_id: contract.id,
      p_at: atDate,
    }),
  ]);

  const first = <T,>(res: { data: unknown }): T | null =>
    ((res.data as T[] | null)?.[0] as T) ?? null;

  return {
    organizationId,
    organizationName: (org as { name: string } | null)?.name ?? '',
    contractId: contract.id,
    planName: contract.plan_name,
    usage: first<CycleUsage>(usageRes),
    compliance: first<CycleCompliance>(complianceRes),
    reclassifications:
      (reclassRes.data as CycleReclassification[] | null) ?? [],
    terminationRisk: first<TerminationRisk>(riskRes),
    band: first<BandStatus>(bandRes),
  };
}

/**
 * Daily ticket counts for the cycle, from ticket_status_history.
 *
 * Reads the history table rather than tickets.created_at because that is what
 * "cuántos tickets se atendieron por día" actually asks: movement, not just
 * arrivals. Opened and closed are counted separately.
 *
 * Only meaningful from the service start date onward — roughly 80% of the
 * historical rows are Excel imports whose created_at is the spreadsheet date,
 * so earlier daily counts are noise.
 */
export async function getDailyActivity(
  client: SupabaseClient,
  organizationId: string,
  cycleStart: string,
  cycleEnd: string,
): Promise<Array<{ date: string; opened: number; closed: number }>> {
  const { data } = await client
    .from('ticket_status_history')
    .select('to_status, from_status, changed_at')
    .eq('organization_id', organizationId)
    .gte('changed_at', `${cycleStart}T00:00:00-05:00`)
    .lte('changed_at', `${cycleEnd}T23:59:59-05:00`)
    .order('changed_at', { ascending: true });

  const byDay = new Map<string, { opened: number; closed: number }>();

  for (const row of (data ?? []) as Array<{
    to_status: string;
    from_status: string | null;
    changed_at: string;
  }>) {
    const day = new Date(row.changed_at).toLocaleDateString('en-CA', {
      timeZone: 'America/Bogota',
    });
    const entry = byDay.get(day) ?? { opened: 0, closed: 0 };

    // from_status NULL is the creation row written by the trigger.
    if (row.from_status === null) entry.opened++;
    if (row.to_status === 'closed' || row.to_status === 'resolved') {
      entry.closed++;
    }

    byDay.set(day, entry);
  }

  return [...byDay.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
