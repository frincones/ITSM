'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createWorkflowSchema,
  updateWorkflowSchema,
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
} from '~/lib/schemas/workflow.schema';

import {
  executeWorkflow,
  type WorkflowContext,
} from '~/lib/services/workflow.service';

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
// 1. createWorkflow
// ---------------------------------------------------------------------------

export async function createWorkflow(
  input: CreateWorkflowInput,
): Promise<ActionResult> {
  try {
    const validated = createWorkflowSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Insert workflow
    const { data: workflow, error } = await client
      .from('workflows')
      .insert({
        name: validated.name,
        description: validated.description ?? null,
        trigger_type: validated.trigger_type,
        trigger_config: validated.trigger_config ?? {},
        is_active: validated.is_active,
        tenant_id: agent.tenant_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !workflow) {
      return { data: null, error: error?.message ?? 'Failed to create workflow' };
    }

    // Insert steps
    if (validated.steps.length > 0) {
      const stepsToInsert = validated.steps.map((step) => ({
        workflow_id: workflow.id,
        step_order: step.step_order,
        name: step.name,
        type: step.type,
        config: step.config,
        next_step_id: step.next_step_id ?? null,
        false_step_id: step.false_step_id ?? null,
      }));

      const { error: stepsError } = await client
        .from('workflow_steps')
        .insert(stepsToInsert);

      if (stepsError) {
        // Rollback: delete the workflow if steps fail
        await client.from('workflows').delete().eq('id', workflow.id);
        return { data: null, error: stepsError.message };
      }
    }

    revalidatePath('/home/admin/workflows');
    return { data: workflow, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. updateWorkflow
// ---------------------------------------------------------------------------

export async function updateWorkflow(
  workflowId: string,
  input: UpdateWorkflowInput,
): Promise<ActionResult> {
  try {
    const validated = updateWorkflowSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ownership
    const { data: existing } = await client
      .from('workflows')
      .select('id, tenant_id')
      .eq('id', workflowId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Workflow not found' };
    }

    // Update workflow fields (exclude steps)
    const { steps, ...workflowFields } = validated;

    const { data: workflow, error } = await client
      .from('workflows')
      .update({
        ...workflowFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    // If steps are provided, replace all steps
    if (steps && steps.length > 0) {
      // Delete existing steps
      await client
        .from('workflow_steps')
        .delete()
        .eq('workflow_id', workflowId);

      // Insert new steps
      const stepsToInsert = steps.map((step) => ({
        workflow_id: workflowId,
        step_order: step.step_order,
        name: step.name,
        type: step.type,
        config: step.config,
        next_step_id: step.next_step_id ?? null,
        false_step_id: step.false_step_id ?? null,
      }));

      const { error: stepsError } = await client
        .from('workflow_steps')
        .insert(stepsToInsert);

      if (stepsError) {
        return { data: null, error: stepsError.message };
      }
    }

    revalidatePath('/home/admin/workflows');
    revalidatePath(`/home/admin/workflows/${workflowId}`);
    return { data: workflow, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. toggleWorkflow
// ---------------------------------------------------------------------------

export async function toggleWorkflow(
  workflowId: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const { data: workflow, error } = await client
      .from('workflows')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', workflowId)
      .eq('tenant_id', agent.tenant_id)
      .select('id, name, is_active')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/admin/workflows');
    return { data: workflow, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. deleteWorkflow
// ---------------------------------------------------------------------------

export async function deleteWorkflow(
  workflowId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ownership
    const { data: existing } = await client
      .from('workflows')
      .select('id, tenant_id')
      .eq('id', workflowId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Workflow not found' };
    }

    // Delete steps first (cascade would handle this, but explicit is better)
    await client
      .from('workflow_steps')
      .delete()
      .eq('workflow_id', workflowId);

    // Delete the workflow
    const { error } = await client
      .from('workflows')
      .delete()
      .eq('id', workflowId)
      .eq('tenant_id', agent.tenant_id);

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/admin/workflows');
    return { data: { deleted: true }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 5. testWorkflow
// ---------------------------------------------------------------------------

/**
 * Dry-run a workflow with mock context. Creates a real execution record
 * tagged as a test run so it can be distinguished from production executions.
 */
export async function testWorkflow(
  workflowId: string,
  mockContext: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ownership
    const { data: existing } = await client
      .from('workflows')
      .select('id, tenant_id')
      .eq('id', workflowId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Workflow not found' };
    }

    const context: WorkflowContext = {
      entity: { ...mockContext, _test_run: true },
      tenant_id: agent.tenant_id,
      metadata: { is_test: true, triggered_by: agent.id },
    };

    const result = await executeWorkflow(
      client,
      workflowId,
      'test',
      'test-resource',
      context,
    );

    return { data: result, error: result.error ?? null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 6. getWorkflowExecutions
// ---------------------------------------------------------------------------

export async function getWorkflowExecutions(
  workflowId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const { data: executions, error } = await client
      .from('workflow_executions')
      .select(
        'id, workflow_id, status, trigger_resource_type, trigger_resource_id, started_at, completed_at',
      )
      .eq('workflow_id', workflowId)
      .eq('tenant_id', agent.tenant_id)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: executions, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
