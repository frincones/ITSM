'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createChangeSchema,
  updateChangeSchema,
  changeValidationSchema,
  changeStatusEnum,
  type CreateChangeInput,
  type UpdateChangeInput,
  type ChangeValidationInput,
} from '~/lib/schemas/change.schema';

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

/** Valid change status transitions map. */
const VALID_TRANSITIONS: Record<string, string[]> = {
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

// ---------------------------------------------------------------------------
// 1. createChange
// ---------------------------------------------------------------------------

export async function createChange(
  input: CreateChangeInput,
): Promise<ActionResult> {
  try {
    const validated = createChangeSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Generate change number
    const { count } = await client
      .from('changes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', agent.tenant_id);

    const changeNumber = `CHG-${String((count ?? 0) + 1).padStart(6, '0')}`;

    const insertPayload: Record<string, unknown> = {
      ...validated,
      tenant_id: agent.tenant_id, // NEVER from frontend
      change_number: changeNumber,
      created_by: user.id,
      status: 'new',
      approval_status: 'pending',
    };

    // Coerce dates to ISO strings for Supabase
    if (validated.scheduled_start) {
      insertPayload.scheduled_start = validated.scheduled_start.toISOString();
    }
    if (validated.scheduled_end) {
      insertPayload.scheduled_end = validated.scheduled_end.toISOString();
    }

    const { data: change, error } = await client
      .from('changes')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/changes');
    return { data: change, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. updateChange
// ---------------------------------------------------------------------------

export async function updateChange(
  changeId: string,
  input: UpdateChangeInput,
): Promise<ActionResult> {
  try {
    const validated = updateChangeSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the change belongs to the same tenant
    const { data: existing } = await client
      .from('changes')
      .select('id, tenant_id')
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Change not found' };
    }

    const updatePayload: Record<string, unknown> = {
      ...validated,
      updated_at: new Date().toISOString(),
    };

    // Coerce dates to ISO strings for Supabase
    if (validated.scheduled_start) {
      updatePayload.scheduled_start = validated.scheduled_start.toISOString();
    }
    if (validated.scheduled_end) {
      updatePayload.scheduled_end = validated.scheduled_end.toISOString();
    }
    if (validated.actual_start) {
      updatePayload.actual_start = validated.actual_start.toISOString();
    }
    if (validated.actual_end) {
      updatePayload.actual_end = validated.actual_end.toISOString();
    }

    const { data: change, error } = await client
      .from('changes')
      .update(updatePayload)
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/changes');
    revalidatePath(`/home/changes/${changeId}`);
    return { data: change, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. changeChangeStatus
// ---------------------------------------------------------------------------

export async function changeChangeStatus(
  changeId: string,
  newStatus: z.infer<typeof changeStatusEnum>,
): Promise<ActionResult> {
  try {
    changeStatusEnum.parse(newStatus);

    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch current change
    const { data: existing } = await client
      .from('changes')
      .select('id, tenant_id, status')
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Change not found' };
    }

    // Validate status transition
    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return {
        data: null,
        error: `Invalid status transition from '${existing.status}' to '${newStatus}'`,
      };
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
    };

    // Record relevant timestamps
    if (newStatus === 'in_progress' && existing.status === 'scheduled') {
      updatePayload.actual_start = now;
    }

    if (newStatus === 'implemented' || newStatus === 'rolled_back') {
      updatePayload.actual_end = now;
    }

    const { data: change, error } = await client
      .from('changes')
      .update(updatePayload)
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/changes');
    revalidatePath(`/home/changes/${changeId}`);
    return { data: change, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. submitForApproval
// ---------------------------------------------------------------------------

export async function submitForApproval(
  changeId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch current change
    const { data: existing } = await client
      .from('changes')
      .select('id, tenant_id, status, rollback_plan, implementation_plan')
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Change not found' };
    }

    // Must be in evaluation status to submit for approval
    if (existing.status !== 'evaluation') {
      return {
        data: null,
        error: `Change must be in 'evaluation' status to submit for approval, current status: '${existing.status}'`,
      };
    }

    // Require rollback plan and implementation plan
    if (!existing.rollback_plan || !existing.implementation_plan) {
      return {
        data: null,
        error: 'Rollback plan and implementation plan are required before submitting for approval',
      };
    }

    const now = new Date().toISOString();
    const { data: change, error } = await client
      .from('changes')
      .update({
        status: 'approval_pending',
        approval_status: 'pending',
        updated_at: now,
      })
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/changes');
    revalidatePath(`/home/changes/${changeId}`);
    return { data: change, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 5. approveChange
// ---------------------------------------------------------------------------

export async function approveChange(
  changeId: string,
  comment?: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch current change
    const { data: existing } = await client
      .from('changes')
      .select('id, tenant_id, status')
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Change not found' };
    }

    if (existing.status !== 'approval_pending') {
      return {
        data: null,
        error: `Change must be in 'approval_pending' status to approve, current status: '${existing.status}'`,
      };
    }

    const now = new Date().toISOString();

    // Insert validation record
    const { error: validationError } = await client
      .from('change_validations')
      .insert({
        tenant_id: agent.tenant_id, // NEVER from frontend
        change_id: changeId,
        validator_id: agent.id,
        status: 'approved',
        comment: comment ?? null,
        validated_at: now,
      });

    if (validationError) {
      return { data: null, error: validationError.message };
    }

    // Update change status
    const { data: change, error } = await client
      .from('changes')
      .update({
        status: 'approved',
        approval_status: 'approved',
        updated_at: now,
      })
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/changes');
    revalidatePath(`/home/changes/${changeId}`);
    return { data: change, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 6. rejectChange
// ---------------------------------------------------------------------------

export async function rejectChange(
  changeId: string,
  comment: string,
): Promise<ActionResult> {
  try {
    if (!comment || comment.trim().length === 0) {
      return { data: null, error: 'A comment is required when rejecting a change' };
    }

    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch current change
    const { data: existing } = await client
      .from('changes')
      .select('id, tenant_id, status')
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Change not found' };
    }

    if (existing.status !== 'approval_pending') {
      return {
        data: null,
        error: `Change must be in 'approval_pending' status to reject, current status: '${existing.status}'`,
      };
    }

    const now = new Date().toISOString();

    // Insert validation record
    const { error: validationError } = await client
      .from('change_validations')
      .insert({
        tenant_id: agent.tenant_id, // NEVER from frontend
        change_id: changeId,
        validator_id: agent.id,
        status: 'rejected',
        comment: comment.trim(),
        validated_at: now,
      });

    if (validationError) {
      return { data: null, error: validationError.message };
    }

    // Update change status
    const { data: change, error } = await client
      .from('changes')
      .update({
        status: 'rejected',
        approval_status: 'rejected',
        updated_at: now,
      })
      .eq('id', changeId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/changes');
    revalidatePath(`/home/changes/${changeId}`);
    return { data: change, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
