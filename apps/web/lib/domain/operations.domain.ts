// ---------------------------------------------------------------------------
// Domain layer — operations and catalog
// ---------------------------------------------------------------------------
// The supporting data the rest of the system routes on: assets and their
// custody chain, problems and their root-cause work, contacts, and the
// reference catalog (categories, groups, services, asset types).
//
// Catalog entries are read-only over MCP on purpose. A category or group is
// referenced by tickets, rules, workflows and SLA policies; renaming or
// deactivating one reshapes routing everywhere at once. Reading them is what
// an agent needs in order to fill category_id or assigned_group_id
// correctly — creating them is an administrative act that stays in the UI.
// ---------------------------------------------------------------------------

import 'server-only';

import { fail, ok, resolveOrgScope, type DomainContext, type DomainResult } from './types';

/** assets.status CHECK constraint. */
export const ASSET_STATUSES = [
  'available',
  'in_use',
  'maintenance',
  'retired',
  'lost',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** problem_status enum. */
export const PROBLEM_STATUSES = [
  'new',
  'accepted',
  'analysis',
  'root_cause_identified',
  'solution_planned',
  'resolved',
  'closed',
] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

const ASSET_COLUMNS =
  'id, asset_tag, name, asset_type_id, status, serial_number, purchase_date, purchase_cost, location, assigned_to, notes, organization_id, created_at, updated_at';

const PROBLEM_COLUMNS =
  'id, problem_number, title, description, status, urgency, impact, priority, root_cause, workaround, solution, category_id, assigned_agent_id, assigned_group_id, resolved_at, created_at, updated_at';

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

async function loadAsset(ctx: DomainContext, assetId: string, columns = ASSET_COLUMNS) {
  const { actor, client } = ctx;

  let q = client
    .from('assets')
    .select(columns)
    .eq('id', assetId)
    .eq('tenant_id', actor.tenantId);

  const orgScope = resolveOrgScope(actor);
  // Unassigned stock (organization_id null) belongs to the tenant, so an
  // org-scoped caller must still see it to allocate from it.
  if (orgScope) {
    q = q.or(`organization_id.in.(${orgScope.join(',')}),organization_id.is.null`);
  }

  const { data } = await q.maybeSingle();
  return data as Record<string, unknown> | null;
}

export interface AssetFields {
  asset_tag: string;
  name: string;
  asset_type_id?: string | null;
  status?: AssetStatus;
  serial_number?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number | null;
  location?: string | null;
  notes?: string | null;
  organization_id?: string | null;
}

export async function createAsset(
  ctx: DomainContext,
  fields: AssetFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const organizationId = fields.organization_id ?? null;
  if (organizationId) {
    const scope = resolveOrgScope(actor, [organizationId]);
    if (scope && !scope.includes(organizationId)) {
      return fail('organization_id is outside the caller allowlist', 'forbidden');
    }
  }

  const { data, error } = await client
    .from('assets')
    .insert({
      tenant_id: actor.tenantId,
      asset_tag: fields.asset_tag,
      name: fields.name,
      asset_type_id: fields.asset_type_id ?? null,
      status: fields.status ?? 'available',
      serial_number: fields.serial_number ?? null,
      purchase_date: fields.purchase_date ?? null,
      purchase_cost: fields.purchase_cost ?? null,
      location: fields.location ?? null,
      notes: fields.notes ?? null,
      organization_id: organizationId,
    })
    .select(ASSET_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(`Asset tag '${fields.asset_tag}' is already in use`, 'conflict');
    }
    return fail(error.message, 'internal');
  }
  return ok(data as Record<string, unknown>);
}

export async function updateAsset(
  ctx: DomainContext,
  assetId: string,
  patch: Partial<AssetFields>,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadAsset(ctx, assetId, 'id, status, assigned_to');
  if (!existing) return fail('Asset not found', 'not_found');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    'asset_tag',
    'name',
    'asset_type_id',
    'status',
    'serial_number',
    'purchase_date',
    'purchase_cost',
    'location',
    'notes',
    'organization_id',
  ] as const) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  // Retiring or losing an asset that is still in someone's hands leaves the
  // custody chain claiming a holder for something written off.
  if (
    (patch.status === 'retired' || patch.status === 'lost') &&
    existing.assigned_to
  ) {
    return fail(
      `This asset is still assigned. Return it with assets_return before marking it ${patch.status}.`,
      'conflict',
    );
  }

  const { data, error } = await client
    .from('assets')
    .update(payload)
    .eq('id', assetId)
    .eq('tenant_id', actor.tenantId)
    .select(ASSET_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') return fail('Asset tag is already in use', 'conflict');
    return fail(error.message, 'internal');
  }
  return ok(data as Record<string, unknown>);
}

/**
 * Hands an asset to an agent and opens a custody record.
 *
 * assets.assigned_to is the current holder; asset_assignments is the
 * history. Both are written so "who has it" and "who has had it" stay
 * consistent.
 */
export async function assignAsset(
  ctx: DomainContext,
  assetId: string,
  agentId: string,
  notes?: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadAsset(ctx, assetId, 'id, asset_tag, status, assigned_to');
  if (!existing) return fail('Asset not found', 'not_found');

  if (existing.status === 'retired' || existing.status === 'lost') {
    return fail(
      `Asset ${existing.asset_tag} is ${existing.status} and cannot be assigned`,
      'conflict',
    );
  }
  if (existing.assigned_to && existing.assigned_to !== agentId) {
    return fail(
      `Asset ${existing.asset_tag} is already assigned. Return it first so the custody record closes cleanly.`,
      'conflict',
    );
  }

  const { data: agent } = await client
    .from('agents')
    .select('id, name')
    .eq('id', agentId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();
  if (!agent) return fail('Agent not found in this tenant', 'not_found');

  const { error: histError } = await client.from('asset_assignments').insert({
    tenant_id: actor.tenantId,
    asset_id: assetId,
    agent_id: agentId,
    notes: notes ?? null,
  });
  // The custody record is the point of the operation, so a failure here
  // stops it rather than leaving a holder with no history.
  if (histError) return fail(`Custody record not written: ${histError.message}`, 'internal');

  const { data, error } = await client
    .from('assets')
    .update({
      assigned_to: agentId,
      status: 'in_use',
      updated_at: new Date().toISOString(),
    })
    .eq('id', assetId)
    .eq('tenant_id', actor.tenantId)
    .select(ASSET_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function returnAsset(
  ctx: DomainContext,
  assetId: string,
  options: { status?: AssetStatus; notes?: string | null } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadAsset(ctx, assetId, 'id, asset_tag, assigned_to');
  if (!existing) return fail('Asset not found', 'not_found');
  if (!existing.assigned_to) {
    return fail(`Asset ${existing.asset_tag} is not currently assigned`, 'conflict');
  }

  const now = new Date().toISOString();

  // Close the open custody record rather than inserting a new one.
  await client
    .from('asset_assignments')
    .update({ returned_at: now, ...(options.notes ? { notes: options.notes } : {}) })
    .eq('tenant_id', actor.tenantId)
    .eq('asset_id', assetId)
    .eq('agent_id', existing.assigned_to as string)
    .is('returned_at', null);

  const { data, error } = await client
    .from('assets')
    .update({
      assigned_to: null,
      status: options.status ?? 'available',
      updated_at: now,
    })
    .eq('id', assetId)
    .eq('tenant_id', actor.tenantId)
    .select(ASSET_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function getAssetHistory(
  ctx: DomainContext,
  assetId: string,
): Promise<DomainResult<{ assignments: unknown[] }>> {
  const existing = await loadAsset(ctx, assetId, 'id');
  if (!existing) return fail('Asset not found', 'not_found');

  const { data, error } = await ctx.client
    .from('asset_assignments')
    .select('id, agent_id, assigned_at, returned_at, notes, agents(name, email)')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('asset_id', assetId)
    .order('assigned_at', { ascending: false });

  if (error) return fail(error.message, 'internal');
  return ok({ assignments: data ?? [] });
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

async function loadProblem(ctx: DomainContext, problemId: string, columns = PROBLEM_COLUMNS) {
  const { data } = await ctx.client
    .from('problems')
    .select(columns)
    .eq('id', problemId)
    .eq('tenant_id', ctx.actor.tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

export interface ProblemPatch {
  title?: string;
  description?: string | null;
  urgency?: string;
  impact?: string;
  root_cause?: string | null;
  workaround?: string | null;
  solution?: string | null;
  category_id?: string | null;
  assigned_agent_id?: string | null;
  assigned_group_id?: string | null;
}

export async function updateProblem(
  ctx: DomainContext,
  problemId: string,
  patch: ProblemPatch,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadProblem(ctx, problemId, 'id, status');
  if (!existing) return fail('Problem not found', 'not_found');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    'title',
    'description',
    'urgency',
    'impact',
    'root_cause',
    'workaround',
    'solution',
    'category_id',
    'assigned_agent_id',
    'assigned_group_id',
  ] as const) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  const { data, error } = await client
    .from('problems')
    .update(payload)
    .eq('id', problemId)
    .eq('tenant_id', actor.tenantId)
    .select(PROBLEM_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/**
 * Moves a problem through its investigation lifecycle.
 *
 * Reaching root_cause_identified without a root cause recorded, or resolved
 * without a solution, would leave a problem record that claims knowledge it
 * does not hold — which defeats the purpose of problem management.
 */
export async function transitionProblem(
  ctx: DomainContext,
  problemId: string,
  status: ProblemStatus,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadProblem(
    ctx,
    problemId,
    'id, problem_number, status, root_cause, solution',
  );
  if (!existing) return fail('Problem not found', 'not_found');

  if (status === 'root_cause_identified' && !String(existing.root_cause ?? '').trim()) {
    return fail(
      'Record the root cause before moving the problem to root_cause_identified',
      'invalid_input',
    );
  }
  if (
    (status === 'resolved' || status === 'closed') &&
    !String(existing.solution ?? '').trim()
  ) {
    return fail(
      `Record the solution before marking the problem ${status}`,
      'invalid_input',
    );
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { status, updated_at: now };
  if (status === 'resolved' && !existing.resolved_at) payload.resolved_at = now;

  const { data, error } = await client
    .from('problems')
    .update(payload)
    .eq('id', problemId)
    .eq('tenant_id', actor.tenantId)
    .select(PROBLEM_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** Links a ticket to a problem as one of its symptoms. */
export async function linkTicketToProblem(
  ctx: DomainContext,
  problemId: string,
  ticketId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const problem = await loadProblem(ctx, problemId, 'id, problem_number');
  if (!problem) return fail('Problem not found', 'not_found');

  let tq = client
    .from('tickets')
    .select('id, ticket_number, organization_id')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);
  const orgScope = resolveOrgScope(actor);
  if (orgScope) tq = tq.in('organization_id', orgScope);

  const { data: ticket } = await tq.maybeSingle();
  if (!ticket) return fail('Ticket not found', 'not_found');

  const { data, error } = await client
    .from('problem_ticket_links')
    .upsert(
      { tenant_id: actor.tenantId, problem_id: problemId, ticket_id: ticketId },
      { onConflict: 'problem_id,ticket_id' },
    )
    .select('id, problem_id, ticket_id, created_at')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok({ link: data, problem, ticket });
}

export async function listProblemTickets(
  ctx: DomainContext,
  problemId: string,
): Promise<DomainResult<{ tickets: unknown[] }>> {
  const problem = await loadProblem(ctx, problemId, 'id');
  if (!problem) return fail('Problem not found', 'not_found');

  const { data, error } = await ctx.client
    .from('problem_ticket_links')
    .select('ticket_id, created_at, tickets(ticket_number, title, status, organization_id)')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('problem_id', problemId);

  if (error) return fail(error.message, 'internal');
  return ok({ tickets: data ?? [] });
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function updateContact(
  ctx: DomainContext,
  contactId: string,
  patch: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    organization_id?: string | null;
  },
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  let q = client
    .from('contacts')
    .select('id, organization_id')
    .eq('id', contactId)
    .eq('tenant_id', actor.tenantId);
  const orgScope = resolveOrgScope(actor);
  if (orgScope) q = q.in('organization_id', orgScope);

  const { data: existing } = await q.maybeSingle();
  if (!existing) return fail('Contact not found', 'not_found');

  if (patch.organization_id) {
    const scope = resolveOrgScope(actor, [patch.organization_id]);
    if (scope && !scope.includes(patch.organization_id)) {
      return fail('organization_id is outside the caller allowlist', 'forbidden');
    }
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ['name', 'email', 'phone', 'company', 'organization_id'] as const) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }
  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  const { data, error } = await client
    .from('contacts')
    .update(payload)
    .eq('id', contactId)
    .eq('tenant_id', actor.tenantId)
    .select('id, name, email, phone, company, organization_id, created_at, updated_at')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Catalog — read only
// ---------------------------------------------------------------------------

/**
 * The reference data tickets route on.
 *
 * Returned together because an agent filling a ticket usually needs more
 * than one of them, and separate round trips invite mismatched ids.
 */
export async function getCatalog(
  ctx: DomainContext,
  options: { include?: string[]; activeOnly?: boolean } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;
  const want = options.include?.length
    ? new Set(options.include)
    : new Set(['categories', 'groups', 'services', 'asset_types']);
  const activeOnly = options.activeOnly ?? true;

  const result: Record<string, unknown> = {};

  if (want.has('categories')) {
    let q = client
      .from('categories')
      .select('id, name, parent_id, applies_to, default_group_id, default_sla_id, sort_order, is_active')
      .eq('tenant_id', actor.tenantId)
      .order('sort_order', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data } = await q;
    result.categories = data ?? [];
  }

  if (want.has('groups')) {
    const { data } = await client
      .from('groups')
      .select('id, name, description, parent_group_id, manager_agent_id, email, auto_assign, auto_assign_method, sla_id')
      .eq('tenant_id', actor.tenantId)
      .order('name', { ascending: true });
    result.groups = data ?? [];
  }

  if (want.has('services')) {
    const [{ data: catalogs }, { data: services }] = await Promise.all([
      client
        .from('service_catalogs')
        .select('id, name, description, sort_order, is_active')
        .eq('tenant_id', actor.tenantId)
        .order('sort_order', { ascending: true }),
      client
        .from('services')
        .select('*')
        .eq('tenant_id', actor.tenantId)
        .limit(200),
    ]);
    result.service_catalogs = catalogs ?? [];
    result.services = services ?? [];
  }

  if (want.has('asset_types')) {
    let q = client
      .from('asset_types')
      .select('id, name, description, icon, is_active')
      .eq('tenant_id', actor.tenantId)
      .order('name', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data } = await q;
    result.asset_types = data ?? [];
  }

  return ok(result);
}
