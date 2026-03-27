'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createProblemSchema,
  updateProblemSchema,
  linkTicketSchema,
  problemStatusEnum,
  type CreateProblemInput,
  type UpdateProblemInput,
  type LinkTicketInput,
} from '~/lib/schemas/problem.schema';

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

/** Valid problem status transitions map. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['accepted', 'closed'],
  accepted: ['analysis', 'closed'],
  analysis: ['root_cause_identified', 'closed'],
  root_cause_identified: ['solution_planned', 'closed'],
  solution_planned: ['resolved', 'closed'],
  resolved: ['closed', 'analysis'],
  closed: [],
};

// ---------------------------------------------------------------------------
// 1. createProblem
// ---------------------------------------------------------------------------

export async function createProblem(
  input: CreateProblemInput,
): Promise<ActionResult> {
  try {
    const validated = createProblemSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Generate problem number
    const { count } = await client
      .from('problems')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', agent.tenant_id);

    const problemNumber = `PRB-${String((count ?? 0) + 1).padStart(6, '0')}`;

    const { data: problem, error } = await client
      .from('problems')
      .insert({
        ...validated,
        tenant_id: agent.tenant_id, // NEVER from frontend
        problem_number: problemNumber,
        created_by: user.id,
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/problems');
    return { data: problem, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. updateProblem
// ---------------------------------------------------------------------------

export async function updateProblem(
  problemId: string,
  input: UpdateProblemInput,
): Promise<ActionResult> {
  try {
    const validated = updateProblemSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the problem belongs to the same tenant
    const { data: existing } = await client
      .from('problems')
      .select('id, tenant_id')
      .eq('id', problemId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Problem not found' };
    }

    const { data: problem, error } = await client
      .from('problems')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', problemId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/problems');
    revalidatePath(`/home/problems/${problemId}`);
    return { data: problem, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. linkTicketToProblem
// ---------------------------------------------------------------------------

export async function linkTicketToProblem(
  input: LinkTicketInput,
): Promise<ActionResult> {
  try {
    const validated = linkTicketSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify problem belongs to tenant
    const { data: problem } = await client
      .from('problems')
      .select('id, tenant_id')
      .eq('id', validated.problem_id)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!problem) {
      return { data: null, error: 'Problem not found' };
    }

    // Verify ticket belongs to tenant
    const { data: ticket } = await client
      .from('tickets')
      .select('id, tenant_id')
      .eq('id', validated.ticket_id)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!ticket) {
      return { data: null, error: 'Ticket not found' };
    }

    const { data: link, error } = await client
      .from('problem_ticket_links')
      .insert({
        tenant_id: agent.tenant_id, // NEVER from frontend
        problem_id: validated.problem_id,
        ticket_id: validated.ticket_id,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return { data: null, error: 'Ticket is already linked to this problem' };
      }
      return { data: null, error: error.message };
    }

    revalidatePath(`/home/problems/${validated.problem_id}`);
    revalidatePath(`/home/tickets/${validated.ticket_id}`);
    return { data: link, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. changeProblemStatus
// ---------------------------------------------------------------------------

export async function changeProblemStatus(
  problemId: string,
  newStatus: z.infer<typeof problemStatusEnum>,
): Promise<ActionResult> {
  try {
    problemStatusEnum.parse(newStatus);

    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch current problem
    const { data: existing } = await client
      .from('problems')
      .select('id, tenant_id, status')
      .eq('id', problemId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Problem not found' };
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

    if (newStatus === 'resolved') {
      updatePayload.resolved_at = now;
    }

    const { data: problem, error } = await client
      .from('problems')
      .update(updatePayload)
      .eq('id', problemId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/problems');
    revalidatePath(`/home/problems/${problemId}`);
    return { data: problem, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
