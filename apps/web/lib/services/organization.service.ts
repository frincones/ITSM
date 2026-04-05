import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  domain: string | null;
  industry: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  notes: string | null;
  sla_id: string | null;
  max_users: number | null;
  contract_start: string | null;
  contract_end: string | null;
  brand_colors: { primary?: string; secondary?: string } | null;
  logo_url: string | null;
  is_active: boolean;
  ai_context: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentOrganization {
  id: string;
  agent_id: string;
  organization_id: string;
  access_level: string;
  organization: Organization;
}

export interface OrganizationUser {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// getOrganizationsForAgent
// ---------------------------------------------------------------------------

/**
 * Returns the organizations an agent has access to.
 * Admin agents get ALL active organizations for the tenant.
 * Non-admin agents only see orgs they are explicitly assigned to.
 */
export async function getOrganizationsForAgent(
  client: SupabaseClient,
  agentId: string,
): Promise<Organization[]> {
  // 1. Fetch agent to check role and tenant_id
  const { data: agent, error: agentError } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('id', agentId)
    .eq('is_active', true)
    .single();

  if (agentError || !agent) return [];

  // 2. Admin → all active orgs for the tenant
  if (agent.role === 'admin') {
    const { data: orgs } = await client
      .from('organizations')
      .select('*')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)
      .order('name');

    return (orgs ?? []) as Organization[];
  }

  // 3. Non-admin → only assigned orgs
  const { data: assignments } = await client
    .from('agent_organizations')
    .select('organization:organizations(*)')
    .eq('agent_id', agentId);

  if (!assignments) return [];

  return assignments
    .map((a: Record<string, unknown>) => a.organization as Organization)
    .filter((org: Organization) => org && org.is_active);
}

// ---------------------------------------------------------------------------
// getOrganizationBySlug
// ---------------------------------------------------------------------------

/**
 * Resolves an organization by its slug within a specific tenant.
 * Used for portal subdomain resolution (e.g., acme.portal.novadesk.com).
 */
export async function getOrganizationBySlug(
  client: SupabaseClient,
  tenantId: string,
  slug: string,
): Promise<Organization | null> {
  const { data, error } = await client
    .from('organizations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  return data as Organization;
}

// ---------------------------------------------------------------------------
// checkOrganizationAccess
// ---------------------------------------------------------------------------

/**
 * Checks whether an agent has access to a specific organization.
 * Admin agents always have access.
 */
export async function checkOrganizationAccess(
  client: SupabaseClient,
  agentId: string,
  orgId: string,
): Promise<boolean> {
  // 1. Check if agent is admin
  const { data: agent } = await client
    .from('agents')
    .select('id, role')
    .eq('id', agentId)
    .eq('is_active', true)
    .single();

  if (!agent) return false;

  if (agent.role === 'admin') return true;

  // 2. Check agent_organizations assignment
  const { data: assignment } = await client
    .from('agent_organizations')
    .select('id')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .single();

  return !!assignment;
}

// ---------------------------------------------------------------------------
// getOrganizationFilter
// ---------------------------------------------------------------------------

/**
 * Returns an array of organization IDs that should be used for filtering
 * queries (tickets, users, etc.).
 *
 * - Admin with no selection → all org IDs (unscoped).
 * - Agent with selectedOrgId → verify access, return [selectedOrgId].
 * - Agent with no selection → return all assigned org IDs.
 *
 * Returns `null` when the agent is admin and no org is selected,
 * meaning "no filter needed — show everything".
 */
export async function getOrganizationFilter(
  client: SupabaseClient,
  agentId: string,
  selectedOrgId?: string | null,
): Promise<string[] | null> {
  // 1. Fetch agent role
  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('id', agentId)
    .eq('is_active', true)
    .single();

  if (!agent) return [];

  // 2. If a specific org is selected, verify access and return it
  if (selectedOrgId) {
    const hasAccess = await checkOrganizationAccess(client, agentId, selectedOrgId);

    if (!hasAccess) return [];

    return [selectedOrgId];
  }

  // 3. Admin with no selection → null (no filter, show all)
  if (agent.role === 'admin') {
    return null;
  }

  // 4. Non-admin with no selection → all assigned org IDs
  const { data: assignments } = await client
    .from('agent_organizations')
    .select('organization_id')
    .eq('agent_id', agentId);

  if (!assignments || assignments.length === 0) return [];

  return assignments.map(
    (a: { organization_id: string }) => a.organization_id,
  );
}

// ---------------------------------------------------------------------------
// getOrganizationUsers
// ---------------------------------------------------------------------------

/**
 * Returns all users belonging to an organization.
 */
export async function getOrganizationUsers(
  client: SupabaseClient,
  orgId: string,
): Promise<OrganizationUser[]> {
  const { data, error } = await client
    .from('organization_users')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name');

  if (error || !data) return [];

  return data as OrganizationUser[];
}
