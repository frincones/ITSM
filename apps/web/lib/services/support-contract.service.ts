// ---------------------------------------------------------------------------
// Support Contracts — SLA activation per client
// ---------------------------------------------------------------------------
// The single authority on whether a ticket carries an SLA at all.
//
// Nothing else in the codebase should decide this. The rule:
//
//   A ticket has an SLA only if its organization has a support contract in
//   force and sla_enabled on the ticket's opening date, AND its
//   classification counts toward SLA.
//
// Podenza has such a contract. Prosuministros does not — and the mechanism
// that keeps it out is the ABSENCE of a row in organization_support_contracts,
// not a flag someone has to remember to switch off. When client number five
// arrives, they get no SLA until somebody signs one.
//
// Pure business logic. No 'use server' — used by Server Actions & cron jobs.
// Mirrors the SQL helpers in migration 00048 so both layers agree.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

/** Ticket classifications that consume the monthly quota (contract cl. 2). */
const QUOTA_CONSUMING_TYPES = ['support', 'incident', 'request'] as const;

/**
 * Ticket classifications measured for SLA.
 *
 * Kept separate from {@link QUOTA_CONSUMING_TYPES} even though the lists
 * match today, because the contract treats them independently: a reopen
 * within 15 days creates a new response obligation (cl. 3) while consuming
 * no quota (cl. 2).
 *
 * `incident` is included deliberately. A platform failure fits none of the
 * three categories in clause 2, but P0/P1 in ANEXO A describe exactly
 * incidents, so the severity matrix plainly contemplates them. This is the
 * internally consistent reading — and the point the client may dispute
 * until an otrosí adds a "corrección de defectos" category.
 */
const SLA_COUNTING_TYPES = ['support', 'incident', 'request'] as const;

/** Reasons that genuinely stop the SLA clock, per contract clause 4. */
export const PAUSING_REASONS = [
  'espera_cliente_info',
  'espera_cliente_validacion',
  'dependencia_tercero',
  'ventana_mantenimiento',
  'fuerza_mayor',
] as const;

/** Recorded but carries no contractual basis, so it does NOT pause. */
export const NON_PAUSING_REASON = 'priorizacion_interna' as const;

export type SlaPauseReason =
  | (typeof PAUSING_REASONS)[number]
  | typeof NON_PAUSING_REASON;

/** Statuses whose pause reason is unambiguous and inferred automatically. */
const IMPLICIT_PAUSE_REASONS: Record<string, SlaPauseReason> = {
  pending: 'espera_cliente_info',
  // 00032 documents 'testing' as "the agent already did their part and is
  // waiting for the requester to confirm the fix" — clause 4's "validación".
  testing: 'espera_cliente_validacion',
};

/** Statuses that require an explicit justification to pause the clock. */
export const REASON_REQUIRED_STATUSES = [
  'detenido',
  'backlog',
  'esperando_ventana',
] as const;

export interface SupportContract {
  id: string;
  organization_id: string;
  plan_name: string;
  monthly_ticket_quota: number;
  ticket_unit_price_cop: number;
  monthly_fee_cop: number;
  calendar_id: string | null;
  cycle_start_day: number;
  sla_enabled: boolean;
  credit_min_tickets: number;
  effective_from: string;
  effective_to: string | null;
}

export interface SupportContractTarget {
  severity: 'low' | 'medium' | 'high' | 'critical';
  first_response_minutes: number;
  mitigation_same_day: boolean;
}

export interface ResolvedSla {
  /** FALSE means EXCLUDED from the compliance denominator — never "met". */
  applies: boolean;
  contract: SupportContract | null;
  /** Frozen onto the ticket so closed-cycle reports stay reproducible. */
  targetMinutes: number | null;
  /** Clause 4's separate P0 same-business-day mitigation commitment. */
  mitigationSameDay: boolean;
  /** Why the SLA does not apply — for logging, not for display to clients. */
  reason:
    | 'applies'
    | 'no_organization'
    | 'no_contract'
    | 'sla_disabled'
    | 'type_excluded'
    | 'no_target_for_severity';
}

const NOT_APPLICABLE = (reason: ResolvedSla['reason']): ResolvedSla => ({
  applies: false,
  contract: null,
  targetMinutes: null,
  mitigationSameDay: false,
  reason,
});

export function typeConsumesQuota(type: string): boolean {
  return (QUOTA_CONSUMING_TYPES as readonly string[]).includes(type);
}

export function typeCountsForSla(type: string): boolean {
  return (SLA_COUNTING_TYPES as readonly string[]).includes(type);
}

export function reasonPauses(reason: SlaPauseReason | null): boolean {
  return reason !== null && reason !== NON_PAUSING_REASON;
}

/**
 * Resolves the pause reason for a status transition.
 *
 * Fails closed: an unjustified pause does NOT stop the clock. If an agent
 * forgets to justify, the system errs against us — an understated compliance
 * figure is defensible, an inflated one collapses the moment the client
 * cross-checks their own email trail.
 */
export function resolvePauseReason(
  toStatus: string,
  explicit?: string | null,
): SlaPauseReason | null {
  const implicit = IMPLICIT_PAUSE_REASONS[toStatus];
  if (implicit) return implicit;

  if (!(REASON_REQUIRED_STATUSES as readonly string[]).includes(toStatus)) {
    return null;
  }

  const trimmed = explicit?.trim();
  if (!trimmed) return NON_PAUSING_REASON;

  const valid = [...PAUSING_REASONS, NON_PAUSING_REASON] as readonly string[];
  return valid.includes(trimmed)
    ? (trimmed as SlaPauseReason)
    : NON_PAUSING_REASON;
}

/**
 * Finds the support contract governing an organization on a given date.
 * Returns null when the client has none — which is the normal, expected
 * case for a client without a signed support agreement.
 */
export async function getContractAt(
  client: SupabaseClient,
  organizationId: string,
  at: Date,
): Promise<SupportContract | null> {
  // The contract's clock is defined in Colombian local time (clause 4), so
  // the effective-date comparison uses the Bogotá calendar day rather than
  // UTC — otherwise a ticket opened at 19:00 Bogotá on the day the contract
  // starts would resolve against the previous day.
  const bogotaDate = at.toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  });

  const { data, error } = await client
    .from('organization_support_contracts')
    .select(
      'id, organization_id, plan_name, monthly_ticket_quota, ticket_unit_price_cop, monthly_fee_cop, calendar_id, cycle_start_day, sla_enabled, credit_min_tickets, effective_from, effective_to',
    )
    .eq('organization_id', organizationId)
    .lte('effective_from', bogotaDate)
    .or(`effective_to.is.null,effective_to.gte.${bogotaDate}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as SupportContract;
}

/**
 * THE rule. Call this at ticket creation to decide whether an SLA applies
 * and what target to freeze onto the ticket.
 *
 * A ticket with no organization resolves to `applies: false` — an internal
 * ticket must never land in a client's SLA denominator.
 */
export async function resolveSlaForTicket(
  client: SupabaseClient,
  input: {
    organizationId: string | null;
    openedAt: Date;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  },
): Promise<ResolvedSla> {
  if (!input.organizationId) return NOT_APPLICABLE('no_organization');
  if (!typeCountsForSla(input.type)) return NOT_APPLICABLE('type_excluded');

  const contract = await getContractAt(
    client,
    input.organizationId,
    input.openedAt,
  );
  if (!contract) return NOT_APPLICABLE('no_contract');
  if (!contract.sla_enabled) return NOT_APPLICABLE('sla_disabled');

  const { data: target } = await client
    .from('support_contract_targets')
    .select('severity, first_response_minutes, mitigation_same_day')
    .eq('contract_id', contract.id)
    .eq('severity', input.severity)
    .maybeSingle();

  if (!target) {
    // A contract in force with no target for this severity is a
    // misconfiguration, not an exemption. Excluding the ticket is the safe
    // read — we never claim compliance against a target we never agreed.
    return { ...NOT_APPLICABLE('no_target_for_severity'), contract };
  }

  const resolved = target as unknown as SupportContractTarget;

  return {
    applies: true,
    contract,
    targetMinutes: resolved.first_response_minutes,
    mitigationSameDay: resolved.mitigation_same_day,
    reason: 'applies',
  };
}

// ---------------------------------------------------------------------------
// Stamping is NOT done here
// ---------------------------------------------------------------------------
// Freezing sla_applies / sla_contract_id / sla_target_minutes / sla_due_date /
// mitigation_due_at onto a ticket is the job of the trg_stamp_ticket_sla
// BEFORE INSERT trigger (migration 00052), which mirrors resolveSlaForTicket()
// above in SQL.
//
// It lives in the database because tickets are created from ten different code
// paths — createTicket, the portal (two), the inbox, inbound email, the AI
// assistant tools, the MCP tools, the AI chat route, the channel webhook and
// the public v1 API — plus imports and direct SQL. A TypeScript stamp would
// have to be called from every one of them and would drift the moment one was
// missed, which is precisely the failure the round-robin cleanup in 00049
// removed.
//
// Do not re-add an application-side stamp. If the rule changes, change
// resolveSlaForTicket() here AND stamp_ticket_sla() in SQL together, and keep
// them in agreement.
