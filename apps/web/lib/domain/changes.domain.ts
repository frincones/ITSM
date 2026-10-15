// ---------------------------------------------------------------------------
// Domain layer — change management
// ---------------------------------------------------------------------------
// A change goes through a governed lifecycle:
//
//   new → evaluation → approval_pending → approved → scheduled
//       → in_progress → testing → implemented → closed
//
// with rejected and rolled_back as exits. The transition map is moved
// verbatim from lib/actions/changes.ts.
//
// Two status fields exist and they are not the same thing:
//   status           where the change is in its lifecycle
//   approval_status  the outcome of the approval gate (pending/approved/rejected)
//
// Approval is modelled as a decision, not an edit: approve and reject are
// separate functions that write a change_validations record naming the
// approver, and the MCP tools that expose them sit behind their own scope.
// An agent should not be able to approve a change by PATCHing a field.
// ---------------------------------------------------------------------------

import 'server-only';

import { fail, ok, requireUserId, type DomainContext, type DomainResult } from './types';

/** change_status enum. */
export const CHANGE_STATUSES = [
  'new',
  'evaluation',
  'approval_pending',
  'approved',
  'scheduled',
  'in_progress',
  'testing',
  'implemented',
  'rolled_back',
  'closed',
  'rejected',
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/** change_type enum. */
export const CHANGE_TYPES = ['standard', 'normal', 'emergency'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** risk_level reuses the severity_level enum. */
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Moved verbatim from lib/actions/changes.ts. */
export const CHANGE_TRANSITIONS: Record<string, string[]> = {
  new: ['evaluation', 'rejected', 'closed'],
  evaluation: ['approval_pending', 'rejected', 'closed'],
  approval_pending: ['approved', 'rejected'],
  approved: ['scheduled', 'closed'],
  scheduled: ['in_progress', 'closed'],
  in_progress: ['testing', 'rolled_back', 'closed'],
  testing: ['implemented', 'in_progress', 'rolled_back'],
  implemented: ['closed'],
  rolled_back: ['closed'],
  closed: [],
  rejected: [],
};

const CHANGE_COLUMNS =
  'id, change_number, title, description, status, change_type, risk_level, impact_analysis, rollback_plan, implementation_plan, scheduled_start, scheduled_end, actual_start, actual_end, category_id, assigned_agent_id, assigned_group_id, approval_status, created_by, created_at, updated_at';

async function loadChange(ctx: DomainContext, changeId: string, columns = CHANGE_COLUMNS) {
  const { data } = await ctx.client
    .from('changes')
    .select(columns)
    .eq('id', changeId)
    .eq('tenant_id', ctx.actor.tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export interface ChangeFields {
  title: string;
  description?: string | null;
  change_type?: ChangeType;
  risk_level?: RiskLevel;
  impact_analysis?: string | null;
  rollback_plan?: string | null;
  implementation_plan?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  category_id?: string | null;
  assigned_agent_id?: string | null;
  assigned_group_id?: string | null;
}

export async function createChange(
  ctx: DomainContext,
  fields: ChangeFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (
    fields.scheduled_start &&
    fields.scheduled_end &&
    fields.scheduled_end < fields.scheduled_start
  ) {
    return fail('scheduled_end cannot be earlier than scheduled_start', 'invalid_input');
  }

  const { data, error } = await client
    .from('changes')
    .insert({
      tenant_id: actor.tenantId,
      title: fields.title,
      description: fields.description ?? null,
      change_type: fields.change_type ?? 'normal',
      risk_level: fields.risk_level ?? 'medium',
      impact_analysis: fields.impact_analysis ?? null,
      rollback_plan: fields.rollback_plan ?? null,
      implementation_plan: fields.implementation_plan ?? null,
      scheduled_start: fields.scheduled_start ?? null,
      scheduled_end: fields.scheduled_end ?? null,
      category_id: fields.category_id ?? null,
      assigned_agent_id: fields.assigned_agent_id ?? null,
      assigned_group_id: fields.assigned_group_id ?? null,
      // change_number is assigned by the generate_change_number trigger.
      status: 'new',
      approval_status: 'pending',
      created_by: actor.userId,
    })
    .select(CHANGE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function updateChange(
  ctx: DomainContext,
  changeId: string,
  patch: Partial<ChangeFields>,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadChange(
    ctx,
    changeId,
    'id, status, scheduled_start, scheduled_end',
  );
  if (!existing) return fail('Change not found', 'not_found');

  // A closed or rejected change is a historical record. Editing it would
  // rewrite what was approved after the fact.
  if (existing.status === 'closed' || existing.status === 'rejected') {
    return fail(
      `This change is ${existing.status} and can no longer be edited`,
      'conflict',
    );
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    'title',
    'description',
    'change_type',
    'risk_level',
    'impact_analysis',
    'rollback_plan',
    'implementation_plan',
    'scheduled_start',
    'scheduled_end',
    'category_id',
    'assigned_agent_id',
    'assigned_group_id',
  ] as const) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  const start = (payload.scheduled_start ?? existing.scheduled_start) as string | null;
  const end = (payload.scheduled_end ?? existing.scheduled_end) as string | null;
  if (start && end && end < start) {
    return fail('scheduled_end cannot be earlier than scheduled_start', 'invalid_input');
  }

  const { data, error } = await client
    .from('changes')
    .update(payload)
    .eq('id', changeId)
    .eq('tenant_id', actor.tenantId)
    .select(CHANGE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Moves a change through its lifecycle.
 *
 * The approval gate is excluded on purpose: reaching 'approved' or
 * 'rejected' from 'approval_pending' has to go through approveChange or
 * rejectChange, which record who decided and why. Allowing it here would let
 * a caller approve a change without leaving an approver on record.
 */
export async function transitionChange(
  ctx: DomainContext,
  changeId: string,
  newStatus: ChangeStatus,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadChange(ctx, changeId, 'id, change_number, status');
  if (!existing) return fail('Change not found', 'not_found');

  const current = existing.status as string;

  if (current === 'approval_pending' && (newStatus === 'approved' || newStatus === 'rejected')) {
    return fail(
      `Use the approval tools to ${newStatus === 'approved' ? 'approve' : 'reject'} a change: the decision has to record who made it.`,
      'forbidden',
    );
  }

  const allowed = CHANGE_TRANSITIONS[current] ?? [];
  if (!allowed.includes(newStatus)) {
    return fail(
      `Invalid status transition from '${current}' to '${newStatus}'. Allowed: ${allowed.length ? allowed.join(', ') : 'none, this is a terminal state'}`,
      'invalid_transition',
    );
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { status: newStatus, updated_at: now };

  // Stamp the real implementation window as it happens, so planned vs actual
  // can be compared afterwards.
  if (newStatus === 'in_progress' && current === 'scheduled') payload.actual_start = now;
  if (newStatus === 'implemented' || newStatus === 'rolled_back') payload.actual_end = now;

  const { data, error } = await client
    .from('changes')
    .update(payload)
    .eq('id', changeId)
    .eq('tenant_id', actor.tenantId)
    .select(CHANGE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/**
 * Submits a change for approval.
 *
 * Refuses when the rollback plan is missing: approving a change nobody can
 * undo is the failure mode change management exists to prevent. Emergency
 * changes are exempt, since they are raised mid-incident.
 */
export async function submitForApproval(
  ctx: DomainContext,
  changeId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadChange(
    ctx,
    changeId,
    'id, change_number, status, change_type, rollback_plan, implementation_plan',
  );
  if (!existing) return fail('Change not found', 'not_found');

  const current = existing.status as string;
  if (current !== 'evaluation') {
    return fail(
      `A change must be in 'evaluation' to be submitted for approval, current status: '${current}'`,
      'conflict',
    );
  }

  if (
    existing.change_type !== 'emergency' &&
    !String(existing.rollback_plan ?? '').trim()
  ) {
    return fail(
      'This change has no rollback plan. Add one before submitting it for approval, or raise it as an emergency change.',
      'invalid_input',
    );
  }

  const { data, error } = await client
    .from('changes')
    .update({
      status: 'approval_pending',
      approval_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', changeId)
    .eq('tenant_id', actor.tenantId)
    .select(CHANGE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Approval gate
// ---------------------------------------------------------------------------

async function recordDecision(
  ctx: DomainContext,
  changeId: string,
  decision: 'approved' | 'rejected',
  comment: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  // change_validations.validator_id is NOT NULL REFERENCES agents(id), so a
  // caller with no acting agent cannot decide. That is the right outcome: an
  // approval with no approver is not an approval.
  if (!actor.agentId) {
    return fail(
      'This caller has no acting agent, so it cannot approve or reject a change. Assign an active agent to the API key (api_keys.actor_agent_id).',
      'forbidden',
    );
  }
  const resolved = requireUserId(actor);
  // Narrow on the value, not the error: TypeScript discriminates this union
  // by `userId`, so checking `error` leaves userId as `string | null` and the
  // NOT NULL author column rejects it at the type level.
  if (!resolved.ok) return fail(resolved.error, 'forbidden');

  const existing = await loadChange(ctx, changeId, 'id, change_number, status, created_by');
  if (!existing) return fail('Change not found', 'not_found');

  if (existing.status !== 'approval_pending') {
    return fail(
      `A change must be in 'approval_pending' to be decided, current status: '${existing.status}'`,
      'conflict',
    );
  }

  // Separation of duties: the person who raised the change does not get to
  // approve it. This is the whole point of the gate.
  if (decision === 'approved' && existing.created_by && existing.created_by === actor.userId) {
    return fail(
      'You raised this change, so you cannot approve it. Approval has to come from someone else.',
      'forbidden',
    );
  }

  const now = new Date().toISOString();

  const { error: validationError } = await client.from('change_validations').insert({
    tenant_id: actor.tenantId,
    change_id: changeId,
    validator_id: actor.agentId,
    status: decision,
    comment: comment ?? null,
    validated_at: now,
  });

  // The validation record IS the decision's audit trail, so a failure here
  // must stop the whole operation rather than silently changing the status.
  if (validationError) {
    return fail(
      `Decision not recorded, change left untouched: ${validationError.message}`,
      'internal',
    );
  }

  const { data, error } = await client
    .from('changes')
    .update({
      status: decision === 'approved' ? 'approved' : 'rejected',
      approval_status: decision,
      updated_at: now,
    })
    .eq('id', changeId)
    .eq('tenant_id', actor.tenantId)
    .select(CHANGE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export function approveChange(
  ctx: DomainContext,
  changeId: string,
  comment?: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  return recordDecision(ctx, changeId, 'approved', comment ?? null);
}

export function rejectChange(
  ctx: DomainContext,
  changeId: string,
  comment: string,
): Promise<DomainResult<Record<string, unknown>>> {
  return recordDecision(ctx, changeId, 'rejected', comment);
}

/** Approval history for a change: who decided, when and why. */
export async function listValidations(
  ctx: DomainContext,
  changeId: string,
): Promise<DomainResult<{ validations: unknown[] }>> {
  const existing = await loadChange(ctx, changeId, 'id');
  if (!existing) return fail('Change not found', 'not_found');

  const { data, error } = await ctx.client
    .from('change_validations')
    .select('id, validator_id, status, comment, validated_at, created_at, agents(name, email)')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('change_id', changeId)
    .order('created_at', { ascending: false });

  if (error) return fail(error.message, 'internal');
  return ok({ validations: data ?? [] });
}
