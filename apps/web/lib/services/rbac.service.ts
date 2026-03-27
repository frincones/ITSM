import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Matches the PostgreSQL `permission_scope` enum. */
type PermissionScope = 'own' | 'group' | 'all';

interface ProfilePermission {
  id: string;
  resource: string;
  actions: string[];
  scope: PermissionScope;
  conditions: Record<string, unknown>;
}

interface GroupMembership {
  id: string;
  group_id: string;
  role: string;
}

export interface AgentWithProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_id: string | null;
  skills: string[];
  is_active: boolean;
  profile: {
    id: string;
    name: string;
    permissions: ProfilePermission[];
  } | null;
  groups: GroupMembership[];
}

// ---------------------------------------------------------------------------
// getAgentWithProfile
// ---------------------------------------------------------------------------

/**
 * Fetches the agent record together with its RBAC profile (permissions) and
 * group memberships.  Returns `null` when no matching agent is found.
 */
export async function getAgentWithProfile(
  client: SupabaseClient,
  agentId: string,
): Promise<AgentWithProfile | null> {
  // 1. Agent + profile
  const { data: agent, error: agentError } = await client
    .from('agents')
    .select(
      `
      id, tenant_id, user_id, name, email, role,
      profile_id, skills, is_active,
      profile:profiles (
        id, name,
        permissions:profile_permissions (
          id, resource, actions, scope, conditions
        )
      )
    `,
    )
    .eq('id', agentId)
    .single();

  if (agentError || !agent) return null;

  // 2. Group memberships
  const { data: groups } = await client
    .from('group_members')
    .select('id, group_id, role')
    .eq('agent_id', agentId);

  return {
    ...(agent as unknown as Omit<AgentWithProfile, 'groups'>),
    groups: (groups ?? []) as GroupMembership[],
  };
}

// ---------------------------------------------------------------------------
// getCurrentAgent
// ---------------------------------------------------------------------------

/**
 * Resolves the current agent from `auth.uid()`.
 * Returns `null` when the user is not authenticated or has no agent record.
 */
export async function getCurrentAgent(
  client: SupabaseClient,
): Promise<AgentWithProfile | null> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) return null;

  // Look up the agent by user_id
  const { data: agentRow, error: agentError } = await client
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (agentError || !agentRow) return null;

  return getAgentWithProfile(client, agentRow.id);
}

// ---------------------------------------------------------------------------
// checkPermission
// ---------------------------------------------------------------------------

/**
 * Checks whether an agent is allowed to perform `action` on `resource`,
 * respecting the RBAC profile's permission scope (`own` | `group` | `all`).
 *
 * @param client          – Authenticated Supabase client (RLS-aware).
 * @param agentId         – The agent whose permissions are being checked.
 * @param resource        – The resource name (e.g. `'tickets'`, `'problems'`).
 * @param action          – The action name (e.g. `'create'`, `'update'`, `'delete'`).
 * @param resourceOwnerId  – The agent id that owns the target resource (for scope = `own`).
 * @param resourceGroupId  – The group id associated with the target resource (for scope = `group`).
 */
export async function checkPermission(
  client: SupabaseClient,
  agentId: string,
  resource: string,
  action: string,
  resourceOwnerId?: string,
  resourceGroupId?: string,
): Promise<boolean> {
  const agent = await getAgentWithProfile(client, agentId);

  if (!agent || !agent.is_active) return false;
  if (!agent.profile) return false;

  const permission = agent.profile.permissions.find(
    (p) => p.resource === resource,
  );

  if (!permission) return false;
  if (!permission.actions.includes(action)) return false;

  switch (permission.scope) {
    case 'all':
      return true;

    case 'group':
      // The agent must belong to the same group as the resource
      if (!resourceGroupId) return false;
      return agent.groups.some((g) => g.group_id === resourceGroupId);

    case 'own':
      // The agent must be the owner of the resource
      if (!resourceOwnerId) return false;
      return agent.id === resourceOwnerId;

    default:
      return false;
  }
}
