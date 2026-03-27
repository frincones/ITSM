'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createTicketSchema,
  updateTicketSchema,
  addFollowupSchema,
  addTaskSchema,
  addSolutionSchema,
  ticketStatusEnum,
  type CreateTicketInput,
  type UpdateTicketInput,
  type AddFollowupInput,
  type AddTaskInput,
  type AddSolutionInput,
} from '~/lib/schemas/ticket.schema';

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

/** Valid status transitions map. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['assigned', 'in_progress', 'cancelled'],
  assigned: ['in_progress', 'pending', 'cancelled'],
  in_progress: ['pending', 'testing', 'resolved', 'cancelled'],
  pending: ['in_progress', 'resolved', 'cancelled'],
  testing: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

// ---------------------------------------------------------------------------
// 1. createTicket
// ---------------------------------------------------------------------------

export async function createTicket(
  input: CreateTicketInput,
): Promise<ActionResult> {
  try {
    const validated = createTicketSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .insert({
        ...validated,
        tenant_id: agent.tenant_id, // NEVER from frontend
        created_by: user.id,
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/tickets');
    return { data: ticket, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. updateTicket
// ---------------------------------------------------------------------------

export async function updateTicket(
  ticketId: string,
  input: UpdateTicketInput,
): Promise<ActionResult> {
  try {
    const validated = updateTicketSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the ticket belongs to the same tenant
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/tickets');
    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: ticket, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. assignTicket
// ---------------------------------------------------------------------------

export async function assignTicket(
  ticketId: string,
  agentId?: string | null,
  groupId?: string | null,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ticket belongs to tenant
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id, status')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    const updatePayload: Record<string, unknown> = {
      status: 'assigned',
      updated_at: new Date().toISOString(),
    };

    if (agentId !== undefined) {
      updatePayload.assigned_agent_id = agentId;
    }

    if (groupId !== undefined) {
      updatePayload.assigned_group_id = groupId;
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .update(updatePayload)
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/tickets');
    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: ticket, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. changeTicketStatus
// ---------------------------------------------------------------------------

export async function changeTicketStatus(
  ticketId: string,
  newStatus: z.infer<typeof ticketStatusEnum>,
): Promise<ActionResult> {
  try {
    ticketStatusEnum.parse(newStatus);

    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch current ticket
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id, status, first_response_at')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
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
    if (newStatus === 'resolved') {
      updatePayload.resolved_at = now;
    }

    if (newStatus === 'closed') {
      updatePayload.closed_at = now;
    }

    // first_response_at: set on first transition away from 'new'
    if (existing.status === 'new' && !existing.first_response_at) {
      updatePayload.first_response_at = now;
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .update(updatePayload)
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/tickets');
    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: ticket, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 5. addFollowup
// ---------------------------------------------------------------------------

export async function addFollowup(
  ticketId: string,
  input: AddFollowupInput,
): Promise<ActionResult> {
  try {
    const validated = addFollowupSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ticket belongs to tenant
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    const { data: followup, error } = await client
      .from('ticket_followups')
      .insert({
        ticket_id: ticketId,
        tenant_id: agent.tenant_id,
        content: validated.content,
        is_private: validated.is_private,
        author_id: user.id,
        author_type: 'agent',
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: followup, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 6. addTask
// ---------------------------------------------------------------------------

export async function addTask(
  ticketId: string,
  input: AddTaskInput,
): Promise<ActionResult> {
  try {
    const validated = addTaskSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ticket belongs to tenant
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    const { data: task, error } = await client
      .from('ticket_tasks')
      .insert({
        ticket_id: ticketId,
        tenant_id: agent.tenant_id, // NEVER from frontend
        title: validated.title,
        description: validated.description ?? null,
        assigned_agent_id: validated.assigned_agent_id ?? null,
        due_date: validated.due_date ? validated.due_date.toISOString() : null,
        estimated_hours: validated.estimated_hours ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: task, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 7. addSolution
// ---------------------------------------------------------------------------

export async function addSolution(
  ticketId: string,
  input: AddSolutionInput,
): Promise<ActionResult> {
  try {
    const validated = addSolutionSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ticket belongs to tenant
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id, status')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    // Insert solution
    const { data: solution, error } = await client
      .from('ticket_solutions')
      .insert({
        ticket_id: ticketId,
        tenant_id: agent.tenant_id,
        content: validated.content,
        author_id: user.id,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    // Change ticket status to 'resolved'
    const now = new Date().toISOString();
    await client
      .from('tickets')
      .update({
        status: 'resolved',
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id);

    revalidatePath('/home/tickets');
    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: solution, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 8. deleteTicket (soft delete)
// ---------------------------------------------------------------------------

export async function deleteTicket(ticketId: string): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify ticket belongs to tenant and is not already deleted
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    const { error } = await client
      .from('tickets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id);

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/tickets');
    return { data: { id: ticketId, deleted: true }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
