// ---------------------------------------------------------------------------
// Domain layer — organizations (clients), their users, agents and contracts
// ---------------------------------------------------------------------------
// An "organization" is a client company. Three things hang off it and each
// one has a different blast radius:
//
//   organization_users            people who log into the client portal
//   agent_organizations           which internal agents may see this client
//   organization_support_contracts quota, SLA and billing terms
//
// The dangerous operation here is deactivation. resolveOrgByPortalToken()
// filters on `is_active = true`, so setting it false CUTS PORTAL ACCESS FOR
// EVERY USER OF THAT CLIENT IMMEDIATELY — the portal link stops resolving
// and they cannot open or follow tickets. It does not touch their user rows,
// so reactivating restores access exactly as it was.
//
// That is why deactivate is its own function (never a patchable `is_active`
// field), reports what it is about to affect, and refuses when the client
// still has open tickets unless explicitly forced.
// ---------------------------------------------------------------------------

import 'server-only';

import { fail, ok, resolveOrgScope, type DomainContext, type DomainResult } from './types';

/** agent_organizations.access_level CHECK constraint. */
export const ORG_ACCESS_LEVELS = [
  'full',
  'tickets_only',
  'readonly',
  'portal_admin',
] as const;
export type OrgAccessLevel = (typeof ORG_ACCESS_LEVELS)[number];

/** organization_users.role CHECK constraint. */
export const ORG_USER_ROLES = ['admin', 'manager', 'user', 'readonly'] as const;
export type OrgUserRole = (typeof ORG_USER_ROLES)[number];

// `portal_token` is deliberately excluded: anyone holding it can open the
// client's portal without authenticating.
const ORG_COLUMNS =
  'id, name, slug, domain, logo_url, brand_colors, industry, contact_name, contact_email, contact_phone, address, notes, sla_id, is_active, max_users, contract_start, contract_end, enabled_modules, default_agent_id, default_group_id, default_category_id, created_at, updated_at';

/** Builds a URL-safe slug, stripping diacritics first. */
function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cliente'
  );
}

async function uniqueSlug(
  ctx: DomainContext,
  base: string,
  excludeId?: string,
): Promise<string> {
  const { actor, client } = ctx;
  for (let n = 1; n <= 50; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    let query = client
      .from('organizations')
      .select('id')
      .eq('tenant_id', actor.tenantId)
      .eq('slug', candidate);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Loads an organization the caller is allowed to see, or null. */
async function loadOrg(ctx: DomainContext, orgId: string, columns = ORG_COLUMNS) {
  const { actor, client } = ctx;

  const scope = resolveOrgScope(actor, [orgId]);
  if (scope && !scope.includes(orgId)) return null;

  const { data } = await client
    .from('organizations')
    .select(columns)
    .eq('id', orgId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  return data as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Write — organization
// ---------------------------------------------------------------------------

export interface OrganizationFields {
  name: string;
  slug?: string | null;
  domain?: string | null;
  industry?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  notes?: string | null;
  max_users?: number;
  contract_start?: string | null;
  contract_end?: string | null;
  default_agent_id?: string | null;
  default_group_id?: string | null;
  default_category_id?: string | null;
  sla_id?: string | null;
}

export async function createOrganization(
  ctx: DomainContext,
  fields: OrganizationFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  // An org-restricted key manages existing clients, not new ones: a key
  // scoped to client A has no business creating client B.
  if (actor.organizationIds && actor.organizationIds.length > 0) {
    return fail(
      'This key is restricted to specific organizations and cannot create new ones',
      'forbidden',
    );
  }

  const slug = await uniqueSlug(ctx, slugify(fields.slug ?? fields.name));

  const { data, error } = await client
    .from('organizations')
    .insert({
      tenant_id: actor.tenantId,
      name: fields.name,
      slug,
      domain: fields.domain ?? null,
      industry: fields.industry ?? null,
      contact_name: fields.contact_name ?? null,
      contact_email: fields.contact_email ?? null,
      contact_phone: fields.contact_phone ?? null,
      address: fields.address ?? null,
      notes: fields.notes ?? null,
      max_users: fields.max_users ?? 10,
      contract_start: fields.contract_start ?? null,
      contract_end: fields.contract_end ?? null,
      default_agent_id: fields.default_agent_id ?? null,
      default_group_id: fields.default_group_id ?? null,
      default_category_id: fields.default_category_id ?? null,
      sla_id: fields.sla_id ?? null,
      is_active: true,
    })
    .select(ORG_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(`An organization with slug '${slug}' already exists`, 'conflict');
    }
    return fail(error.message, 'internal');
  }
  return ok(data as Record<string, unknown>);
}

export async function updateOrganization(
  ctx: DomainContext,
  orgId: string,
  patch: Partial<OrganizationFields>,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadOrg(ctx, orgId, 'id, name, slug');
  if (!existing) return fail('Organization not found', 'not_found');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    'name',
    'domain',
    'industry',
    'contact_name',
    'contact_email',
    'contact_phone',
    'address',
    'notes',
    'max_users',
    'contract_start',
    'contract_end',
    'default_agent_id',
    'default_group_id',
    'default_category_id',
    'sla_id',
  ] as const) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }

  // The slug is part of the portal URL, so it only changes when asked for
  // explicitly — renaming a client must not silently break its links.
  if (patch.slug !== undefined && patch.slug !== null) {
    payload.slug = await uniqueSlug(ctx, slugify(patch.slug), orgId);
  }

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  const { data, error } = await client
    .from('organizations')
    .update(payload)
    .eq('id', orgId)
    .eq('tenant_id', actor.tenantId)
    .select(ORG_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') return fail('Slug already in use', 'conflict');
    return fail(error.message, 'internal');
  }
  return ok(data as Record<string, unknown>);
}

export interface SetActiveOptions {
  /**
   * Deactivate even when the client still has open tickets. Without this the
   * operation is refused, because cutting portal access mid-incident leaves
   * the client unable to follow work that is still in progress.
   */
  force?: boolean;
}

/**
 * Activates or deactivates a client.
 *
 * Deactivating takes the portal offline for every user of that client
 * immediately (resolveOrgByPortalToken filters on is_active). Their user
 * rows are untouched, so reactivating restores access as it was.
 */
export async function setOrganizationActive(
  ctx: DomainContext,
  orgId: string,
  isActive: boolean,
  options: SetActiveOptions = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadOrg(ctx, orgId, 'id, name, is_active');
  if (!existing) return fail('Organization not found', 'not_found');

  if (existing.is_active === isActive) {
    return fail(
      `Organization is already ${isActive ? 'active' : 'inactive'}`,
      'conflict',
    );
  }

  let openTickets = 0;
  let portalUsers = 0;

  if (!isActive) {
    const [tickets, users] = await Promise.all([
      client
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', actor.tenantId)
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .not('status', 'in', '(closed,cancelled,resolved)'),
      client
        .from('organization_users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', actor.tenantId)
        .eq('organization_id', orgId)
        .eq('is_active', true),
    ]);
    openTickets = tickets.count ?? 0;
    portalUsers = users.count ?? 0;

    if (openTickets > 0 && !options.force) {
      return fail(
        `'${existing.name}' still has ${openTickets} open ticket(s) and ${portalUsers} active portal user(s). Deactivating cuts their portal access immediately. Pass force: true to proceed anyway.`,
        'conflict',
      );
    }
  }

  const { data, error } = await client
    .from('organizations')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', orgId)
    .eq('tenant_id', actor.tenantId)
    .select(ORG_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');

  return ok({
    organization: data,
    ...(isActive ? {} : { portal_access_revoked_for_users: portalUsers, open_tickets: openTickets }),
  });
}

// ---------------------------------------------------------------------------
// Agent access
// ---------------------------------------------------------------------------

export async function assignAgent(
  ctx: DomainContext,
  orgId: string,
  agentId: string,
  options: { accessLevel?: OrgAccessLevel; isDefault?: boolean } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const org = await loadOrg(ctx, orgId, 'id, name');
  if (!org) return fail('Organization not found', 'not_found');

  // The agent must belong to this tenant; otherwise a valid-looking uuid
  // would grant a stranger access to a client's tickets.
  const { data: agent } = await client
    .from('agents')
    .select('id, name, is_active')
    .eq('id', agentId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!agent) return fail('Agent not found in this tenant', 'not_found');

  const { data, error } = await client
    .from('agent_organizations')
    .upsert(
      {
        tenant_id: actor.tenantId,
        organization_id: orgId,
        agent_id: agentId,
        access_level: options.accessLevel ?? 'full',
        is_default: options.isDefault ?? false,
      },
      { onConflict: 'agent_id,organization_id' },
    )
    .select('id, agent_id, organization_id, access_level, is_default, created_at')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function removeAgent(
  ctx: DomainContext,
  orgId: string,
  agentId: string,
): Promise<DomainResult<{ removed: boolean }>> {
  const { actor, client } = ctx;

  const org = await loadOrg(ctx, orgId, 'id, name, default_agent_id');
  if (!org) return fail('Organization not found', 'not_found');

  // Removing the default owner would leave new tickets unassigned with no
  // obvious cause, so it is refused until another default is chosen.
  if (org.default_agent_id === agentId) {
    return fail(
      `This agent is the default owner for '${org.name}'. Set a different default_agent_id before removing them.`,
      'conflict',
    );
  }

  const { error } = await client
    .from('agent_organizations')
    .delete()
    .eq('tenant_id', actor.tenantId)
    .eq('organization_id', orgId)
    .eq('agent_id', agentId);

  if (error) return fail(error.message, 'internal');
  return ok({ removed: true });
}

export async function listAgentAccess(
  ctx: DomainContext,
  orgId: string,
): Promise<DomainResult<{ agents: unknown[] }>> {
  const org = await loadOrg(ctx, orgId, 'id');
  if (!org) return fail('Organization not found', 'not_found');

  const { data, error } = await ctx.client
    .from('agent_organizations')
    .select('id, agent_id, access_level, is_default, created_at, agents(name, email, role, is_active)')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('organization_id', orgId);

  if (error) return fail(error.message, 'internal');
  return ok({ agents: data ?? [] });
}

// ---------------------------------------------------------------------------
// Portal users
// ---------------------------------------------------------------------------

export async function listUsers(
  ctx: DomainContext,
  orgId: string,
  options: { activeOnly?: boolean } = {},
): Promise<DomainResult<{ users: unknown[] }>> {
  const org = await loadOrg(ctx, orgId, 'id');
  if (!org) return fail('Organization not found', 'not_found');

  let query = ctx.client
    .from('organization_users')
    .select('id, user_id, name, email, phone, role, is_active, last_login_at, created_at')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (options.activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');
  return ok({ users: data ?? [] });
}

/**
 * Updates a portal user's name, role or active flag.
 *
 * Creating users is deliberately absent: it means provisioning an identity
 * and sending an invitation email, which is out of scope for the MCP.
 */
export async function updateUser(
  ctx: DomainContext,
  orgId: string,
  userRowId: string,
  patch: { name?: string; phone?: string | null; role?: OrgUserRole; is_active?: boolean },
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const org = await loadOrg(ctx, orgId, 'id');
  if (!org) return fail('Organization not found', 'not_found');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.role !== undefined) payload.role = patch.role;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  const { data, error } = await client
    .from('organization_users')
    .update(payload)
    .eq('id', userRowId)
    .eq('tenant_id', actor.tenantId)
    .eq('organization_id', orgId)
    .select('id, user_id, name, email, phone, role, is_active, last_login_at, updated_at')
    .maybeSingle();

  if (error) return fail(error.message, 'internal');
  if (!data) return fail('User not found in this organization', 'not_found');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Support contracts
// ---------------------------------------------------------------------------

/**
 * The contract in force for a client, with its SLA targets.
 *
 * Contracts are time-bounded (effective_from / effective_to), so "current"
 * means the row covering today. Historical rows are returned separately so a
 * caller can explain what the terms were when an old ticket was raised.
 */
export async function getContracts(
  ctx: DomainContext,
  orgId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const org = await loadOrg(ctx, orgId, 'id, name');
  if (!org) return fail('Organization not found', 'not_found');

  const { data: contracts, error } = await client
    .from('organization_support_contracts')
    .select('*')
    .eq('tenant_id', actor.tenantId)
    .eq('organization_id', orgId)
    .order('effective_from', { ascending: false });

  if (error) return fail(error.message, 'internal');

  const today = new Date().toISOString().slice(0, 10);
  const current =
    (contracts ?? []).find((c) => {
      const row = c as { effective_from: string | null; effective_to: string | null };
      const from = row.effective_from ?? '0000-01-01';
      const to = row.effective_to ?? '9999-12-31';
      return from <= today && today <= to;
    }) ?? null;

  let targets: unknown[] = [];
  if (current) {
    const { data } = await client
      .from('support_contract_targets')
      .select('severity, first_response_minutes, mitigation_same_day')
      .eq('tenant_id', actor.tenantId)
      .eq('contract_id', (current as { id: string }).id)
      .order('severity', { ascending: true });
    targets = data ?? [];
  }

  return ok({
    organization: org,
    current_contract: current,
    sla_targets: targets,
    history: contracts ?? [],
  });
}
