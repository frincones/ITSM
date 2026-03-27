'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createOrganizationSchema,
  updateOrganizationSchema,
  assignAgentSchema,
  createOrgUserSchema,
  orgAccessLevelEnum,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type CreateOrgUserInput,
} from '~/lib/schemas/organization.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActionResult<T = unknown> = { data: T; error: null } | { data: null; error: string };

/**
 * Authenticate the current user and resolve their agent record + tenant_id.
 * Returns an ActionResult-style error when the user or agent cannot be found.
 */
async function requireAgent(client: ReturnType<typeof getSupabaseServerClient>) {
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

  return { agent, user, error: null } as const;
}

// ---------------------------------------------------------------------------
// 1. createOrganization
// ---------------------------------------------------------------------------

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<ActionResult> {
  try {
    const validated = createOrganizationSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Check slug uniqueness within tenant
    const { data: existing } = await client
      .from('organizations')
      .select('id')
      .eq('tenant_id', agent.tenant_id)
      .eq('slug', validated.slug)
      .single();

    if (existing) {
      return { data: null, error: 'An organization with this slug already exists' };
    }

    const { data: org, error } = await client
      .from('organizations')
      .insert({
        ...validated,
        tenant_id: agent.tenant_id,
        is_active: true,
        contract_start: validated.contract_start
          ? validated.contract_start.toISOString()
          : null,
        contract_end: validated.contract_end
          ? validated.contract_end.toISOString()
          : null,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/organizations');
    return { data: org, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. updateOrganization
// ---------------------------------------------------------------------------

export async function updateOrganization(
  orgId: string,
  input: UpdateOrganizationInput,
): Promise<ActionResult> {
  try {
    const validated = updateOrganizationSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify org belongs to tenant
    const { data: existing } = await client
      .from('organizations')
      .select('id, tenant_id')
      .eq('id', orgId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Organization not found' };
    }

    // If slug is being changed, check uniqueness
    if (validated.slug) {
      const { data: slugConflict } = await client
        .from('organizations')
        .select('id')
        .eq('tenant_id', agent.tenant_id)
        .eq('slug', validated.slug)
        .neq('id', orgId)
        .single();

      if (slugConflict) {
        return { data: null, error: 'An organization with this slug already exists' };
      }
    }

    // Build update payload, converting dates if present
    const updatePayload: Record<string, unknown> = {
      ...validated,
      updated_at: new Date().toISOString(),
    };

    if (validated.contract_start !== undefined) {
      updatePayload.contract_start = validated.contract_start
        ? validated.contract_start.toISOString()
        : null;
    }

    if (validated.contract_end !== undefined) {
      updatePayload.contract_end = validated.contract_end
        ? validated.contract_end.toISOString()
        : null;
    }

    const { data: org, error } = await client
      .from('organizations')
      .update(updatePayload)
      .eq('id', orgId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/organizations');
    revalidatePath(`/home/organizations/${orgId}`);
    return { data: org, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. deactivateOrganization
// ---------------------------------------------------------------------------

export async function deactivateOrganization(
  orgId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify org belongs to tenant
    const { data: existing } = await client
      .from('organizations')
      .select('id, tenant_id')
      .eq('id', orgId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Organization not found' };
    }

    const { error } = await client
      .from('organizations')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)
      .eq('tenant_id', agent.tenant_id);

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/organizations');
    return { data: { id: orgId, is_active: false }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. assignAgentToOrganization
// ---------------------------------------------------------------------------

export async function assignAgentToOrganization(
  agentId: string,
  orgId: string,
  accessLevel: z.infer<typeof orgAccessLevelEnum>,
): Promise<ActionResult> {
  try {
    orgAccessLevelEnum.parse(accessLevel);

    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the target org belongs to the same tenant
    const { data: org } = await client
      .from('organizations')
      .select('id, tenant_id')
      .eq('id', orgId)
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)
      .single();

    if (!org) {
      return { data: null, error: 'Organization not found' };
    }

    // Verify the target agent belongs to the same tenant
    const { data: targetAgent } = await client
      .from('agents')
      .select('id, tenant_id')
      .eq('id', agentId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!targetAgent) {
      return { data: null, error: 'Agent not found' };
    }

    // Upsert the assignment (update access_level if already assigned)
    const { data: assignment, error } = await client
      .from('agent_organizations')
      .upsert(
        {
          agent_id: agentId,
          organization_id: orgId,
          access_level: accessLevel,
        },
        { onConflict: 'agent_id,organization_id' },
      )
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/organizations');
    revalidatePath(`/home/organizations/${orgId}`);
    return { data: assignment, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 5. removeAgentFromOrganization
// ---------------------------------------------------------------------------

export async function removeAgentFromOrganization(
  agentId: string,
  orgId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the org belongs to the same tenant
    const { data: org } = await client
      .from('organizations')
      .select('id, tenant_id')
      .eq('id', orgId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!org) {
      return { data: null, error: 'Organization not found' };
    }

    const { error } = await client
      .from('agent_organizations')
      .delete()
      .eq('agent_id', agentId)
      .eq('organization_id', orgId);

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/organizations');
    revalidatePath(`/home/organizations/${orgId}`);
    return { data: { agent_id: agentId, organization_id: orgId, removed: true }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 6. inviteOrganizationUser
// ---------------------------------------------------------------------------

export async function inviteOrganizationUser(
  orgId: string,
  input: CreateOrgUserInput,
): Promise<ActionResult> {
  try {
    const validated = createOrgUserSchema.parse({ ...input, organization_id: orgId });
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify org belongs to tenant and is active
    const { data: org } = await client
      .from('organizations')
      .select('id, tenant_id, max_users')
      .eq('id', orgId)
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)
      .single();

    if (!org) {
      return { data: null, error: 'Organization not found' };
    }

    // Check max_users limit
    if (org.max_users) {
      const { count } = await client
        .from('organization_users')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (count != null && count >= org.max_users) {
        return {
          data: null,
          error: `Organization has reached its maximum of ${org.max_users} users`,
        };
      }
    }

    // Check for duplicate email within the org
    const { data: existingUser } = await client
      .from('organization_users')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', validated.email)
      .single();

    if (existingUser) {
      return { data: null, error: 'A user with this email already exists in this organization' };
    }

    const { data: orgUser, error } = await client
      .from('organization_users')
      .insert({
        organization_id: orgId,
        tenant_id: agent.tenant_id,
        name: validated.name,
        email: validated.email,
        phone: validated.phone ?? null,
        role: validated.role,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath(`/home/organizations/${orgId}`);
    return { data: orgUser, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 7. updateOrganizationUser
// ---------------------------------------------------------------------------

export async function updateOrganizationUser(
  userId: string,
  input: Partial<CreateOrgUserInput>,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the user exists and belongs to an org in this tenant
    const { data: existingUser } = await client
      .from('organization_users')
      .select('id, organization_id, tenant_id')
      .eq('id', userId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existingUser) {
      return { data: null, error: 'Organization user not found' };
    }

    // Build update payload (only include provided fields)
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updatePayload.name = input.name;
    if (input.email !== undefined) updatePayload.email = input.email;
    if (input.phone !== undefined) updatePayload.phone = input.phone;
    if (input.role !== undefined) updatePayload.role = input.role;

    const { data: orgUser, error } = await client
      .from('organization_users')
      .update(updatePayload)
      .eq('id', userId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath(`/home/organizations/${existingUser.organization_id}`);
    return { data: orgUser, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 8. deactivateOrganizationUser
// ---------------------------------------------------------------------------

export async function deactivateOrganizationUser(
  userId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the user exists and belongs to an org in this tenant
    const { data: existingUser } = await client
      .from('organization_users')
      .select('id, organization_id, tenant_id')
      .eq('id', userId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existingUser) {
      return { data: null, error: 'Organization user not found' };
    }

    const { error } = await client
      .from('organization_users')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', agent.tenant_id);

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath(`/home/organizations/${existingUser.organization_id}`);
    return { data: { id: userId, is_active: false }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
