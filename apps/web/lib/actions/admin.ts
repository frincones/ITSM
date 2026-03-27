'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import {
  createCategorySchema,
  type CreateCategoryInput,
} from '~/lib/schemas/category.schema';

import {
  createAgentSchema,
  updateAgentSchema,
  type CreateAgentInput,
  type UpdateAgentInput,
} from '~/lib/schemas/agent.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActionResult<T = unknown> = { data: T; error: null } | { data: null; error: string };

/**
 * Authenticate the current user and resolve their agent record + tenant_id.
 * Only admins/supervisors are allowed to perform admin actions.
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
// 1. createCategory
// ---------------------------------------------------------------------------

export async function createCategory(
  input: CreateCategoryInput,
): Promise<ActionResult> {
  try {
    const validated = createCategorySchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAdmin(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const { data: category, error } = await client
      .from('categories')
      .insert({
        ...validated,
        tenant_id: agent.tenant_id, // NEVER from frontend
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/settings');
    revalidatePath('/home/tickets');
    return { data: category, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. updateCategory
// ---------------------------------------------------------------------------

export async function updateCategory(
  categoryId: string,
  input: Partial<CreateCategoryInput>,
): Promise<ActionResult> {
  try {
    const validated = createCategorySchema.partial().parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAdmin(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify category belongs to tenant
    const { data: existing } = await client
      .from('categories')
      .select('id, tenant_id')
      .eq('id', categoryId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Category not found' };
    }

    const { data: category, error } = await client
      .from('categories')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', categoryId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/settings');
    revalidatePath('/home/tickets');
    return { data: category, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. createAgent
// ---------------------------------------------------------------------------

export async function createAgent(
  input: CreateAgentInput,
): Promise<ActionResult> {
  try {
    const validated = createAgentSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent: currentAgent, error: authError } = await requireAdmin(client);

    if (authError || !currentAgent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Use admin client to create auth user (requires service_role key)
    const adminClient = getSupabaseServerAdminClient();

    // Step 1: Create the auth user
    const { data: authUser, error: authCreateError } =
      await adminClient.auth.admin.createUser({
        email: validated.email,
        email_confirm: true,
        user_metadata: { name: validated.name },
      });

    if (authCreateError) {
      return { data: null, error: authCreateError.message };
    }

    if (!authUser.user) {
      return { data: null, error: 'Failed to create auth user' };
    }

    // Step 2: Create the agent record
    const { data: newAgent, error: agentError } = await adminClient
      .from('agents')
      .insert({
        user_id: authUser.user.id,
        tenant_id: currentAgent.tenant_id, // NEVER from frontend
        name: validated.name,
        email: validated.email,
        role: validated.role,
        profile_id: validated.profile_id ?? null,
        skills: validated.skills ?? [],
        is_active: true,
      })
      .select()
      .single();

    if (agentError) {
      // Attempt to clean up the auth user if agent creation fails
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return { data: null, error: agentError.message };
    }

    revalidatePath('/home/settings');
    return { data: newAgent, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. updateAgent
// ---------------------------------------------------------------------------

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<ActionResult> {
  try {
    const validated = updateAgentSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent: currentAgent, error: authError } = await requireAdmin(client);

    if (authError || !currentAgent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify agent belongs to tenant
    const { data: existing } = await client
      .from('agents')
      .select('id, tenant_id')
      .eq('id', agentId)
      .eq('tenant_id', currentAgent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Agent not found' };
    }

    const { data: updatedAgent, error } = await client
      .from('agents')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('tenant_id', currentAgent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/settings');
    return { data: updatedAgent, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 5. deactivateAgent
// ---------------------------------------------------------------------------

export async function deactivateAgent(agentId: string): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent: currentAgent, error: authError } = await requireAdmin(client);

    if (authError || !currentAgent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Cannot deactivate yourself
    if (currentAgent.id === agentId) {
      return { data: null, error: 'Cannot deactivate your own account' };
    }

    // Verify agent belongs to tenant
    const { data: existing } = await client
      .from('agents')
      .select('id, tenant_id')
      .eq('id', agentId)
      .eq('tenant_id', currentAgent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Agent not found' };
    }

    const { data: deactivated, error } = await client
      .from('agents')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId)
      .eq('tenant_id', currentAgent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/settings');
    return { data: deactivated, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
