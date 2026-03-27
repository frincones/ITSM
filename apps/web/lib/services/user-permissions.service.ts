import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All available modules in the platform. */
const ALL_MODULES: string[] = [
  'dashboard',
  'tickets',
  'problems',
  'changes',
  'kb',
  'inbox',
  'reports',
  'assets',
  'projects',
  'service_catalog',
  'automations',
  'workflows',
  'settings',
  'notifications',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PermissionScope = 'own' | 'group' | 'all';

export type UserType = 'tdx_agent' | 'org_user' | 'unknown';

export interface UserTypeResult {
  type: UserType;
  agent?: {
    id: string;
    name: string;
    email: string;
    role: string;
    profile_id: string | null;
    tenant_id: string;
    is_active: boolean;
  };
  orgUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
    profile_id: string | null;
    organization_id: string;
    tenant_id: string;
    is_active: boolean;
  };
  organizationId?: string;
}

export interface PermissionEntry {
  module: string;
  actions: string[];
  scope: PermissionScope;
}

export interface UnifiedUser {
  id: string;
  name: string;
  email: string;
  type: UserType;
  organizationName: string | null;
  role: string;
  profileName: string | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// 1. getUserType
// ---------------------------------------------------------------------------

/**
 * Determines whether a given auth `userId` is a TDX agent, an organization
 * (portal) user, or unknown.
 *
 * - First checks the `agents` table for `user_id`.
 * - If not found, checks `organization_users` for `user_id`.
 * - Returns `unknown` if neither match.
 */
export async function getUserType(
  client: SupabaseClient,
  userId: string,
): Promise<UserTypeResult> {
  // --- Check agents first ---
  const { data: agent, error: agentError } = await client
    .from('agents')
    .select('id, name, email, role, profile_id, tenant_id, is_active')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!agentError && agent) {
    return {
      type: 'tdx_agent',
      agent: agent as UserTypeResult['agent'],
    };
  }

  // --- Check organization_users ---
  const { data: orgUser, error: orgUserError } = await client
    .from('organization_users')
    .select('id, name, email, role, profile_id, organization_id, tenant_id, is_active')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!orgUserError && orgUser) {
    return {
      type: 'org_user',
      orgUser: orgUser as UserTypeResult['orgUser'],
      organizationId: orgUser.organization_id as string,
    };
  }

  return { type: 'unknown' };
}

// ---------------------------------------------------------------------------
// 2. getUserAllowedModules
// ---------------------------------------------------------------------------

/**
 * Returns the list of module names the user is allowed to access.
 *
 * - **tdx_agent with role `admin`** -> ALL modules.
 * - **tdx_agent with `profile_id`** -> modules from `profile_permissions`.
 * - **org_user with `profile_id`** -> INTERSECTION of `organization.enabled_modules`
 *   AND modules from `profile_permissions`.
 * - **org_user without `profile_id`** -> just `organization.enabled_modules`.
 * - **Fallback** -> `null` (means all allowed, backwards-compatible).
 */
export async function getUserAllowedModules(
  client: SupabaseClient,
  userId: string,
): Promise<string[] | null> {
  try {
    const userInfo = await getUserType(client, userId);

    // --- TDX Agent ---
    if (userInfo.type === 'tdx_agent' && userInfo.agent) {
      // Admins get everything
      if (userInfo.agent.role === 'admin') {
        return [...ALL_MODULES];
      }

      // Get profile-based modules
      let profileModules: string[] | null = null;
      if (userInfo.agent.profile_id) {
        profileModules = await getModulesFromProfile(
          client,
          userInfo.agent.profile_id,
        );
      }

      // Check if agent is assigned to a specific org → intersect with org enabled_modules
      const { data: agentOrg } = await client
        .from('agent_organizations')
        .select('organization_id')
        .eq('agent_id', userInfo.agent.id)
        .eq('is_default', true)
        .maybeSingle();

      if (agentOrg?.organization_id) {
        const orgModules = await getOrganizationEnabledModules(
          client,
          agentOrg.organization_id,
        );
        if (orgModules && profileModules) {
          // INTERSECT: only modules that are both in profile AND org
          return profileModules.filter((m) => orgModules.includes(m));
        }
        if (orgModules) return orgModules;
      }

      return profileModules;
    }

    // --- Organization User ---
    if (userInfo.type === 'org_user' && userInfo.orgUser) {
      // Fetch organization's enabled_modules
      const orgModules = await getOrganizationEnabledModules(
        client,
        userInfo.orgUser.organization_id,
      );

      if (!orgModules) {
        // Organization has no enabled_modules set -> fallback
        return null;
      }

      // If org_user has a profile, intersect with profile permissions
      if (userInfo.orgUser.profile_id) {
        const profileModules = await getModulesFromProfile(
          client,
          userInfo.orgUser.profile_id,
        );

        if (profileModules) {
          // INTERSECTION of org modules and profile modules
          const profileSet = new Set(profileModules);
          return orgModules.filter((m) => profileSet.has(m));
        }
      }

      // No profile -> just organization modules
      return orgModules;
    }

    // Unknown user type -> fallback
    return null;
  } catch {
    // If anything fails, return null (backwards-compatible: all allowed)
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. getUserPermissionsMatrix
// ---------------------------------------------------------------------------

/**
 * Returns the full RBAC permissions matrix for the user's profile.
 * Used to render the RBAC matrix UI.
 *
 * Returns an array of `{ module, actions[], scope }` entries, or `null`
 * if the user has no profile assigned.
 */
export async function getUserPermissionsMatrix(
  client: SupabaseClient,
  userId: string,
): Promise<PermissionEntry[] | null> {
  const userInfo = await getUserType(client, userId);

  let profileId: string | null = null;

  if (userInfo.type === 'tdx_agent' && userInfo.agent) {
    profileId = userInfo.agent.profile_id ?? null;
  } else if (userInfo.type === 'org_user' && userInfo.orgUser) {
    profileId = userInfo.orgUser.profile_id ?? null;
  }

  if (!profileId) return null;

  const { data: permissions, error } = await client
    .from('profile_permissions')
    .select('resource, actions, scope')
    .eq('profile_id', profileId);

  if (error || !permissions) return null;

  return permissions.map((p) => ({
    module: p.resource as string,
    actions: p.actions as string[],
    scope: p.scope as PermissionScope,
  }));
}

// ---------------------------------------------------------------------------
// 4. getAllUsersUnified
// ---------------------------------------------------------------------------

/**
 * Returns a unified list of agents + organization users for a given tenant.
 *
 * Each entry contains: id, name, email, type, organizationName, role,
 * profileName, isActive.
 */
export async function getAllUsersUnified(
  client: SupabaseClient,
  tenantId: string,
): Promise<UnifiedUser[]> {
  const results: UnifiedUser[] = [];

  // --- Agents ---
  const { data: agents } = await client
    .from('agents')
    .select(
      `
      id, name, email, role, is_active,
      profile:profiles ( name )
    `,
    )
    .eq('tenant_id', tenantId);

  if (agents) {
    for (const a of agents) {
      const profile = a.profile as { name: string } | null;
      results.push({
        id: a.id as string,
        name: a.name as string,
        email: a.email as string,
        type: 'tdx_agent',
        organizationName: null,
        role: a.role as string,
        profileName: profile?.name ?? null,
        isActive: a.is_active as boolean,
      });
    }
  }

  // --- Organization Users ---
  const { data: orgUsers } = await client
    .from('organization_users')
    .select(
      `
      id, name, email, role, is_active,
      organization:organizations ( name ),
      profile:profiles ( name )
    `,
    )
    .eq('tenant_id', tenantId);

  if (orgUsers) {
    for (const ou of orgUsers) {
      const org = ou.organization as { name: string } | null;
      const profile = ou.profile as { name: string } | null;
      results.push({
        id: ou.id as string,
        name: ou.name as string,
        email: ou.email as string,
        type: 'org_user',
        organizationName: org?.name ?? null,
        role: ou.role as string,
        profileName: profile?.name ?? null,
        isActive: ou.is_active as boolean,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. saveUserPermissions
// ---------------------------------------------------------------------------

/**
 * Saves the RBAC permissions matrix for a user.
 *
 * - If the user does not have a `profile_id`, creates a new custom profile
 *   (named `"Custom – {userName}"`) and assigns it.
 * - Then upserts `profile_permissions` for the given permissions array.
 *
 * @param permissions - Array of `{ module, actions[], scope }` to save.
 */
export async function saveUserPermissions(
  client: SupabaseClient,
  userId: string,
  userType: UserType,
  permissions: PermissionEntry[],
): Promise<{ success: boolean; error?: string; profileId?: string }> {
  try {
    const userInfo = await getUserType(client, userId);

    let profileId: string | null = null;
    let tenantId: string | null = null;
    let userName: string | null = null;
    let tableName: 'agents' | 'organization_users' | null = null;
    let recordId: string | null = null;

    if (userType === 'tdx_agent' && userInfo.type === 'tdx_agent' && userInfo.agent) {
      profileId = userInfo.agent.profile_id ?? null;
      tenantId = userInfo.agent.tenant_id;
      userName = userInfo.agent.name;
      tableName = 'agents';
      recordId = userInfo.agent.id;
    } else if (userType === 'org_user' && userInfo.type === 'org_user' && userInfo.orgUser) {
      profileId = userInfo.orgUser.profile_id ?? null;
      tenantId = userInfo.orgUser.tenant_id;
      userName = userInfo.orgUser.name;
      tableName = 'organization_users';
      recordId = userInfo.orgUser.id;
    } else {
      return { success: false, error: 'User not found or type mismatch.' };
    }

    if (!tenantId || !tableName || !recordId) {
      return { success: false, error: 'Missing tenant or record information.' };
    }

    // --- Create custom profile if user has none ---
    if (!profileId) {
      const { data: newProfile, error: profileError } = await client
        .from('profiles')
        .insert({
          tenant_id: tenantId,
          name: `Custom – ${userName}`,
          description: `Custom profile auto-created for ${userName}`,
          is_system: false,
        })
        .select('id')
        .single();

      if (profileError || !newProfile) {
        return {
          success: false,
          error: `Failed to create custom profile: ${profileError?.message ?? 'Unknown error'}`,
        };
      }

      profileId = newProfile.id as string;

      // Assign profile_id to the user record
      const { error: updateError } = await client
        .from(tableName)
        .update({ profile_id: profileId })
        .eq('id', recordId);

      if (updateError) {
        return {
          success: false,
          error: `Failed to assign profile to user: ${updateError.message}`,
        };
      }
    }

    // --- Delete existing permissions for this profile ---
    const { error: deleteError } = await client
      .from('profile_permissions')
      .delete()
      .eq('profile_id', profileId);

    if (deleteError) {
      return {
        success: false,
        error: `Failed to clear existing permissions: ${deleteError.message}`,
      };
    }

    // --- Insert new permissions ---
    if (permissions.length > 0) {
      const rows = permissions.map((p) => ({
        profile_id: profileId,
        resource: p.module,
        actions: p.actions,
        scope: p.scope,
      }));

      const { error: insertError } = await client
        .from('profile_permissions')
        .insert(rows);

      if (insertError) {
        return {
          success: false,
          error: `Failed to insert permissions: ${insertError.message}`,
        };
      }
    }

    return { success: true, profileId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the list of module (resource) names that a given profile has
 * permissions for.
 */
async function getModulesFromProfile(
  client: SupabaseClient,
  profileId: string,
): Promise<string[] | null> {
  const { data, error } = await client
    .from('profile_permissions')
    .select('resource')
    .eq('profile_id', profileId);

  // If RLS blocks access or no data, return null (= all allowed, backwards compatible)
  if (error || !data || data.length === 0) return null;

  return data.map((row) => row.resource as string);
}

/**
 * Fetches the `enabled_modules` column for an organization.
 */
async function getOrganizationEnabledModules(
  client: SupabaseClient,
  organizationId: string,
): Promise<string[] | null> {
  const { data, error } = await client
    .from('organizations')
    .select('enabled_modules')
    .eq('id', organizationId)
    .single();

  if (error || !data) return null;

  return (data.enabled_modules as string[] | null) ?? null;
}
