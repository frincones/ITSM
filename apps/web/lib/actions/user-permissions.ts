'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActionResult<T = unknown> = { data: T; error: null } | { data: null; error: string };

/**
 * Authenticate the current user and resolve their agent record + tenant_id.
 * Only admins are allowed to manage user permissions.
 */
async function requireAdmin(client: ReturnType<typeof getSupabaseServerClient>) {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { agent: null, user: null, error: 'Unauthorized' } as const;
  }

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return { agent: null, user, error: 'Agent not found' } as const;
  }

  if (!['admin', 'supervisor'].includes(agent.role)) {
    return { agent: null, user, error: 'Insufficient permissions' } as const;
  }

  return { agent, user, error: null } as const;
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const permissionEntrySchema = z.object({
  resource: z.string().min(1),
  actions: z.array(z.string()).min(1),
  scope: z.enum(['own', 'group', 'all']),
});

const savePermissionsSchema = z.object({
  userId: z.string().uuid(),
  userType: z.enum(['tdx_agent', 'org_user']),
  profileId: z.string().uuid().nullable(),
  customPermissions: z.array(permissionEntrySchema),
});

const assignOrganizationSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  accessLevel: z.enum(['full', 'tickets_only', 'readonly', 'portal_admin']),
});

const toggleActiveSchema = z.object({
  userId: z.string().uuid(),
  userType: z.enum(['tdx_agent', 'org_user']),
  isActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// 1. savePermissions
// ---------------------------------------------------------------------------

export async function savePermissions(
  input: z.infer<typeof savePermissionsSchema>,
): Promise<ActionResult> {
  try {
    const validated = savePermissionsSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAdmin(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // If a profile is selected (not custom), assign the profile_id directly
    if (validated.profileId) {
      // Verify profile belongs to tenant
      const { data: profile } = await client
        .from('profiles')
        .select('id, tenant_id')
        .eq('id', validated.profileId)
        .single();

      if (!profile) {
        return { data: null, error: 'Profile not found' };
      }

      // Assign profile_id to the appropriate table
      if (validated.userType === 'tdx_agent') {
        const { error } = await client
          .from('agents')
          .update({
            profile_id: validated.profileId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validated.userId)
          .eq('tenant_id', agent.tenant_id);

        if (error) {
          return { data: null, error: error.message };
        }
      } else {
        const { error } = await client
          .from('organization_users')
          .update({
            profile_id: validated.profileId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validated.userId)
          .eq('tenant_id', agent.tenant_id);

        if (error) {
          return { data: null, error: error.message };
        }
      }

      revalidatePath('/home/settings/users-permissions');
      return { data: { userId: validated.userId, profileId: validated.profileId }, error: null };
    }

    // Custom permissions: create a custom profile and assign it
    if (validated.customPermissions.length === 0) {
      return { data: null, error: 'No permissions provided' };
    }

    // Create a custom profile
    const { data: customProfile, error: profileError } = await client
      .from('profiles')
      .insert({
        tenant_id: agent.tenant_id,
        name: `Custom - ${validated.userId.slice(0, 8)}`,
        description: 'Custom permission profile',
        is_system: false,
      })
      .select()
      .single();

    if (profileError || !customProfile) {
      return { data: null, error: profileError?.message ?? 'Failed to create custom profile' };
    }

    // Insert permissions for the custom profile
    const permissionRows = validated.customPermissions.map((perm) => ({
      profile_id: customProfile.id,
      resource: perm.resource,
      actions: perm.actions,
      scope: perm.scope,
    }));

    const { error: permsError } = await client
      .from('profile_permissions')
      .insert(permissionRows);

    if (permsError) {
      return { data: null, error: permsError.message };
    }

    // Assign the custom profile to the user
    if (validated.userType === 'tdx_agent') {
      const { error } = await client
        .from('agents')
        .update({
          profile_id: customProfile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', validated.userId)
        .eq('tenant_id', agent.tenant_id);

      if (error) {
        return { data: null, error: error.message };
      }
    } else {
      const { error } = await client
        .from('organization_users')
        .update({
          profile_id: customProfile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', validated.userId)
        .eq('tenant_id', agent.tenant_id);

      if (error) {
        return { data: null, error: error.message };
      }
    }

    revalidatePath('/home/settings/users-permissions');
    return { data: { userId: validated.userId, profileId: customProfile.id }, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. assignOrganizationToUser
// ---------------------------------------------------------------------------

export async function assignOrganizationToUser(
  input: z.infer<typeof assignOrganizationSchema>,
): Promise<ActionResult> {
  try {
    const validated = assignOrganizationSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAdmin(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify organization belongs to tenant
    const { data: org } = await client
      .from('organizations')
      .select('id, tenant_id')
      .eq('id', validated.organizationId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!org) {
      return { data: null, error: 'Organization not found' };
    }

    // Verify user belongs to tenant
    const { data: orgUser } = await client
      .from('organization_users')
      .select('id, tenant_id')
      .eq('id', validated.userId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!orgUser) {
      return { data: null, error: 'Organization user not found' };
    }

    // Update organization_id on the user
    const { data: updated, error } = await client
      .from('organization_users')
      .update({
        organization_id: validated.organizationId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.userId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/settings/users-permissions');
    return { data: updated, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. toggleUserActive
// ---------------------------------------------------------------------------

export async function toggleUserActive(
  input: z.infer<typeof toggleActiveSchema>,
): Promise<ActionResult> {
  try {
    const validated = toggleActiveSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAdmin(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    if (validated.userType === 'tdx_agent') {
      // Cannot deactivate yourself
      if (agent.id === validated.userId) {
        return { data: null, error: 'Cannot change your own active status' };
      }

      // Verify agent belongs to tenant
      const { data: existing } = await client
        .from('agents')
        .select('id, tenant_id')
        .eq('id', validated.userId)
        .eq('tenant_id', agent.tenant_id)
        .single();

      if (!existing) {
        return { data: null, error: 'Agent not found' };
      }

      const { data: updated, error } = await client
        .from('agents')
        .update({
          is_active: validated.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', validated.userId)
        .eq('tenant_id', agent.tenant_id)
        .select()
        .single();

      if (error) {
        return { data: null, error: error.message };
      }

      revalidatePath('/home/settings/users-permissions');
      return { data: updated, error: null };
    } else {
      // org_user
      const { data: existing } = await client
        .from('organization_users')
        .select('id, tenant_id')
        .eq('id', validated.userId)
        .eq('tenant_id', agent.tenant_id)
        .single();

      if (!existing) {
        return { data: null, error: 'Organization user not found' };
      }

      const { data: updated, error } = await client
        .from('organization_users')
        .update({
          is_active: validated.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', validated.userId)
        .eq('tenant_id', agent.tenant_id)
        .select()
        .single();

      if (error) {
        return { data: null, error: error.message };
      }

      revalidatePath('/home/settings/users-permissions');
      return { data: updated, error: null };
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
