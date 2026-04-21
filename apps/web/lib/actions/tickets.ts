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

import {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyTicketStatusChanged,
  notifyTicketCommented,
  notifyTicketResolved,
} from '~/lib/services/notify.service';

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
    .select('id, tenant_id, role, name, email')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return { agent: null, user, error: 'Agent not found' } as const;
  }

  return { agent, user, error: null } as const;
}

/**
 * Like requireAgent but also works for client users (readonly agents).
 * Returns isClient=true if user is a readonly/client role.
 */
async function requireAuthUser(client: ReturnType<typeof getSupabaseServerClient>) {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { agent: null, user: null, isClient: false, error: 'Unauthorized' } as const;
  }

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role, name, email')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return { agent: null, user, isClient: false, error: 'User not found' } as const;
  }

  const isClient = agent.role === 'readonly';
  return { agent, user, isClient, error: null } as const;
}

/**
 * Round-robin assignment for a single freshly-created ticket.
 *
 * Uses a per-tenant cursor in `tenants.settings.round_robin_last_agent_id`
 * to rotate strictly through the eligible agents in alphabetical order.
 * This ignores the historical ticket distribution — a bulk import that
 * concentrated hundreds of tickets on one person can't starve the others.
 *
 * Skips the admin@novadesk.com service account so only real agents get
 * picked. Invoked fire-and-forget from createTicket so a failure never
 * blocks the ticket insert.
 */
async function autoAssignRoundRobin(
  client: ReturnType<typeof getSupabaseServerClient>,
  ticketId: string,
  tenantId: string,
): Promise<void> {
  const EXCLUDED_EMAILS = ['admin@novadesk.com'];

  const { data: allAgents } = await client
    .from('agents')
    .select('id, user_id, email, name, role')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('role', ['admin', 'supervisor', 'agent'])
    .order('name', { ascending: true });

  const agents = (allAgents ?? []).filter(
    (a: { email: string }) => !EXCLUDED_EMAILS.includes(a.email.toLowerCase()),
  );
  if (agents.length === 0) return;

  // Read the rotation cursor. Next agent = the one right after the cursor
  // in the (alphabetically) sorted list, wrapping around at the end.
  const { data: tenant } = await client
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();

  const settings =
    ((tenant as { settings: Record<string, unknown> } | null)?.settings as
      | Record<string, unknown>
      | null) ?? {};
  const lastAgentId =
    typeof settings.round_robin_last_agent_id === 'string'
      ? settings.round_robin_last_agent_id
      : null;

  const lastIdx = agents.findIndex((a: { id: string }) => a.id === lastAgentId);
  const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % agents.length;
  const best = agents[nextIdx];
  if (!best) return;

  // Advance the cursor (fire-and-forget — a stale cursor just risks one
  // duplicate pick, not a correctness issue).
  void client
    .from('tenants')
    .update({
      settings: { ...settings, round_robin_last_agent_id: best.id },
    })
    .eq('id', tenantId)
    .then(() => {});

  await client
    .from('tickets')
    .update({
      assigned_agent_id: best.id,
      status: 'assigned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId);

  // Notify the freshly-assigned agent
  const { notifyTicketAssigned } = await import('~/lib/services/notify.service');
  const { data: t } = await client
    .from('tickets')
    .select('ticket_number, title, type, urgency, status')
    .eq('id', ticketId)
    .maybeSingle();
  if (t) {
    notifyTicketAssigned({
      tenantId,
      ticketNumber: t.ticket_number,
      ticketId,
      title: t.title,
      type: t.type,
      urgency: t.urgency,
      status: t.status,
      agentUserId: best.user_id ?? undefined,
      agentEmail: best.email,
      agentName: best.name,
    }).catch(() => {});
  }
}

/** Valid status transitions map. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['backlog', 'assigned', 'in_progress', 'pending', 'detenido', 'testing', 'closed', 'cancelled'],
  backlog: ['new', 'assigned', 'in_progress', 'pending', 'detenido', 'testing', 'closed', 'cancelled'],
  assigned: ['backlog', 'in_progress', 'pending', 'detenido', 'testing', 'closed', 'cancelled'],
  in_progress: ['backlog', 'pending', 'detenido', 'testing', 'resolved', 'closed', 'cancelled'],
  pending: ['backlog', 'in_progress', 'detenido', 'testing', 'resolved', 'closed', 'cancelled'],
  detenido: ['backlog', 'in_progress', 'pending', 'testing', 'resolved', 'closed', 'cancelled'],
  testing: ['backlog', 'in_progress', 'pending', 'detenido', 'resolved', 'closed', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress', 'backlog'],
  cancelled: ['new', 'backlog'],
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

    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Path A: agent creates a ticket — uses agent.tenant_id, any org allowed.
    const { data: agent } = await client
      .from('agents')
      .select('id, tenant_id, role, name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    let tenantId: string;
    let enforcedOrgId: string | null = null;
    let agentEmailForNotify: string | undefined;

    const isClient = !agent || agent.role === 'readonly';

    if (agent && !isClient) {
      tenantId = agent.tenant_id;
      agentEmailForNotify = agent.email;
    } else {
      // Path B: client/readonly — enforce their own organization.
      const { data: orgUser } = await client
        .from('organization_users')
        .select('organization_id, organization:organizations(id, tenant_id)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      const org = (orgUser?.organization ?? null) as
        | { id: string; tenant_id: string }
        | null;

      if (!org) {
        return { data: null, error: 'Not authorized to create tickets' };
      }

      tenantId = org.tenant_id;
      enforcedOrgId = org.id;

      // Overwrite any org_id the client sent — never trust the browser.
      if (validated.organization_id && validated.organization_id !== org.id) {
        return { data: null, error: 'Invalid organization' };
      }
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .insert({
        ...validated,
        organization_id: enforcedOrgId ?? validated.organization_id,
        tenant_id: tenantId, // NEVER from frontend
        created_by: user.id,
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    // Fire-and-forget notification
    notifyTicketCreated({
      tenantId,
      ticketNumber: ticket.ticket_number,
      ticketId: ticket.id,
      title: ticket.title,
      type: ticket.type,
      urgency: ticket.urgency,
      status: ticket.status,
      requesterEmail: ticket.requester_email ?? undefined,
      agentUserId: user.id,
      agentEmail: agentEmailForNotify,
    }).catch(() => {});

    // Real-time round-robin: assign the brand-new ticket to the TDX staff
    // member with the fewest open tickets right now. This replaces the
    // every-5-minute cron we can't run on Hobby.
    autoAssignRoundRobin(client, ticket.id, tenantId).catch(() => {});

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
      updated_at: new Date().toISOString(),
    };

    // Only auto-flip to 'assigned' from the freshly-created 'new' state.
    // Reassigning a ticket that's already in progress / pending / testing
    // should keep the current status so clients don't reset real work.
    if (existing.status === 'new' && agentId) {
      updatePayload.status = 'assigned';
    }

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

    // Notify assigned agent
    if (agentId) {
      const { data: tgtAgent } = await client.from('agents').select('user_id, email, name').eq('id', agentId).single();
      if (tgtAgent) {
        notifyTicketAssigned({
          tenantId: agent.tenant_id, ticketNumber: ticket.ticket_number, ticketId: ticket.id,
          title: ticket.title, type: ticket.type, urgency: ticket.urgency, status: ticket.status,
          agentUserId: tgtAgent.user_id, agentEmail: tgtAgent.email, agentName: tgtAgent.name,
        }).catch(() => {});
      }
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
    const { agent, isClient, error: authError } = await requireAuthUser(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Clients can only set the statuses exposed in their UI picker
    const CLIENT_ALLOWED_STATUSES = [
      'new',
      'backlog',
      'in_progress',
      'pending',
      'detenido',
      'testing',
      'resolved',
      'closed',
    ];
    if (isClient && !CLIENT_ALLOWED_STATUSES.includes(newStatus)) {
      return { data: null, error: 'Not allowed for client users' };
    }

    // Fetch current ticket
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id, status, first_response_at, custom_fields')
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

    // Track when the ticket entered / left the Testing stage so the daily
    // "Nuevos Testing" metric can distinguish fresh transitions from the
    // snapshot of every ticket ever sitting in testing.
    const nextCustom: Record<string, unknown> = {
      ...((existing.custom_fields as Record<string, unknown> | null) ?? {}),
    };
    let customChanged = false;
    if (newStatus === 'testing' && existing.status !== 'testing') {
      nextCustom.testing_entered_at = now;
      // reset any previous result when re-entering testing
      delete nextCustom.testing_result;
      customChanged = true;
    }
    if (existing.status === 'testing' && newStatus !== 'testing') {
      delete nextCustom.testing_entered_at;
      delete nextCustom.testing_result;
      customChanged = true;
    }
    if (customChanged) {
      updatePayload.custom_fields = nextCustom;
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

    // Resolve the ASSIGNEE (not the actor) so email + in-app reach the
    // person responsible for the ticket.
    let assigneeEmail: string | undefined;
    let assigneeUserId: string | undefined;
    if (ticket.assigned_agent_id) {
      const { data: assignee } = await client
        .from('agents')
        .select('email, user_id')
        .eq('id', ticket.assigned_agent_id)
        .maybeSingle();
      assigneeEmail = assignee?.email ?? undefined;
      assigneeUserId = assignee?.user_id ?? undefined;
    }

    // Notify status change
    const notifyFn = newStatus === 'resolved' ? notifyTicketResolved : notifyTicketStatusChanged;
    notifyFn({
      tenantId: agent.tenant_id, ticketNumber: ticket.ticket_number, ticketId: ticket.id,
      title: ticket.title, type: ticket.type, urgency: ticket.urgency, status: newStatus,
      requesterEmail: ticket.requester_email ?? undefined,
      agentUserId: assigneeUserId, agentEmail: assigneeEmail,
    }).catch(() => {});

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
// 4b. setClientPriorityRank — manual 1..50 ordering used by client users
// ---------------------------------------------------------------------------

/**
 * Set (or clear) the client-defined priority rank for a ticket. Each rank
 * value is unique per organization among *open* tickets (not closed or
 * cancelled), so a client can express a strict ordering of the tickets that
 * still need attention.
 *
 * Pass `rank = null` to clear the rank.
 */

// ---------------------------------------------------------------------------
// 4c. setTestingResult — testing sub-state for a ticket in status='testing'
// ---------------------------------------------------------------------------

const TESTING_RESULT_VALUES = [
  'new',
  'pendiente',
  'exitoso',
  'fracaso',
] as const;
type TestingResult = (typeof TESTING_RESULT_VALUES)[number];

/**
 * Set or clear the testing sub-state on a ticket. Only meaningful while the
 * ticket is in status='testing'. Clients (readonly agents) + TDX agents are
 * both allowed to write it — Bibiana/Camilo/Daniel/Andres need to flag
 * exitoso/fracaso after QA, Freddy/Emma move tickets to pendiente when
 * awaiting something.
 *
 * Pass `result = null` to clear.
 */
export async function setTestingResult(
  ticketId: string,
  result: string | null,
): Promise<ActionResult> {
  try {
    if (
      result !== null &&
      !TESTING_RESULT_VALUES.includes(result as TestingResult)
    ) {
      return {
        data: null,
        error: `Valor inválido. Permitidos: ${TESTING_RESULT_VALUES.join(', ')}`,
      };
    }

    const client = getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    const { data: ticket, error: tErr } = await client
      .from('tickets')
      .select('id, tenant_id, status, custom_fields')
      .eq('id', ticketId)
      .is('deleted_at', null)
      .maybeSingle();

    if (tErr || !ticket) return { data: null, error: 'Ticket not found' };

    const currentCustom =
      (ticket.custom_fields as Record<string, unknown> | null) ?? {};
    const nextCustom: Record<string, unknown> = { ...currentCustom };
    if (result === null || result === 'new') {
      delete nextCustom.testing_result;
    } else {
      nextCustom.testing_result = result;
    }

    const { error } = await client
      .from('tickets')
      .update({
        custom_fields: nextCustom,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', ticketId);

    if (error) return { data: null, error: error.message };

    revalidatePath(`/home/tickets/${ticketId}`);
    revalidatePath('/home/tickets');
    revalidatePath('/home/workspace');
    revalidatePath('/home/reports');
    return { data: { testing_result: result }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function setClientPriorityRank(
  ticketId: string,
  rank: number | null,
): Promise<ActionResult> {
  try {
    if (
      rank !== null &&
      (!Number.isInteger(rank) || rank < 1 || rank > 50)
    ) {
      return { data: null, error: 'El orden debe ser un entero entre 1 y 50' };
    }

    const client = getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Fetch ticket with tenant + org scope
    const { data: ticket, error: tErr } = await client
      .from('tickets')
      .select('id, tenant_id, organization_id, custom_fields')
      .eq('id', ticketId)
      .is('deleted_at', null)
      .maybeSingle();

    if (tErr || !ticket) return { data: null, error: 'Ticket not found' };
    if (!ticket.organization_id) {
      return {
        data: null,
        error: 'El ticket no pertenece a ninguna organización',
      };
    }

    // Uniqueness check (only when setting a value)
    if (rank !== null) {
      const { data: clashes } = await client
        .from('tickets')
        .select('id, ticket_number, title')
        .eq('organization_id', ticket.organization_id)
        .neq('id', ticketId)
        .is('deleted_at', null)
        .not('status', 'in', '(closed,cancelled,resolved)')
        .eq('custom_fields->>client_rank', String(rank))
        .limit(1);

      if (clashes && clashes.length > 0) {
        const clash = clashes[0];
        return {
          data: null,
          error: `El orden ${rank} ya está asignado al ticket ${clash?.ticket_number ?? ''}. Escoge otro número.`,
        };
      }
    }

    const currentCustom =
      (ticket.custom_fields as Record<string, unknown> | null) ?? {};
    const nextCustom: Record<string, unknown> = { ...currentCustom };
    if (rank === null) {
      delete nextCustom.client_rank;
    } else {
      nextCustom.client_rank = rank;
    }

    const { error } = await client
      .from('tickets')
      .update({
        custom_fields: nextCustom,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', ticketId);

    if (error) return { data: null, error: error.message };

    revalidatePath(`/home/tickets/${ticketId}`);
    revalidatePath('/home/tickets');
    return { data: { client_rank: rank }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
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
    const { agent, user, isClient, error: authError } = await requireAuthUser(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Clients can only add public replies, not internal notes
    if (isClient && validated.is_private) {
      return { data: null, error: 'Clients cannot add internal notes' };
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

    // Notify on public replies (not internal notes)
    if (!validated.is_private) {
      const { data: tkt } = await client.from('tickets').select('ticket_number, title, type, urgency, requester_email').eq('id', ticketId).single();
      if (tkt) {
        notifyTicketCommented({
          tenantId: agent.tenant_id, ticketNumber: tkt.ticket_number, ticketId,
          title: tkt.title, type: tkt.type, urgency: tkt.urgency, status: '',
          comment: validated.content, agentName: agent.name,
          requesterEmail: tkt.requester_email ?? undefined,
          agentUserId: user.id, agentEmail: agent.email,
        }).catch(() => {});
      }
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

    const { data: { user } } = await client.auth.getUser();
    const { error } = await client
      .from('tickets')
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
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
