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
  notifyTicketAssigned,
  notifyTicketCommented,
} from '~/lib/services/notify.service';

// createTicket and changeTicketStatus — including their transition rules,
// timestamping and side-effect fan-out — now live in the domain layer so the
// MCP tools and internal AI agents execute the same path as the UI.
import {
  createTicket as domainCreateTicket,
  changeTicketStatus as domainChangeStatus,
} from '~/lib/domain/tickets.domain';

import { type SlaPauseReason } from '~/lib/services/support-contract.service';

import {
  addFollower,
  addFollowersBulk,
  removeFollower,
  type FollowerReason,
} from '~/lib/services/ticket-followers.service';

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

// The status transition map lives in lib/domain/tickets.domain.ts
// (VALID_TRANSITIONS): one map, enforced for the UI, the MCP tools and
// anything else that moves a ticket.

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
    // Forced requester for the client path — we never trust whatever the
    // browser sent because a client could otherwise submit a ticket on
    // somebody else's behalf. Stays null for staff agents who are
    // legitimately allowed to register a ticket for another person.
    let forcedRequesterEmail: string | null = null;
    let forcedRequesterId: string | null = null;

    const isClient = !agent || agent.role === 'readonly';

    if (agent && !isClient) {
      tenantId = agent.tenant_id;
      agentEmailForNotify = agent.email;
    } else {
      // Path B: client/readonly — enforce their own organization AND
      // their own requester identity.
      const { data: orgUser } = await client
        .from('organization_users')
        .select(
          'organization_id, email, organization:organizations(id, tenant_id)',
        )
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

      // Force requester to be the logged-in user.
      forcedRequesterEmail = (orgUser?.email as string | null) ?? user.email ?? null;
      if (!forcedRequesterEmail) {
        return { data: null, error: 'No requester email on file' };
      }

      // Best-effort match a contacts row in the same org so the list view
      // shows the requester's name. If none exists we still create with
      // the email; a contacts row can be linked later.
      const { data: contactMatch } = await client
        .from('contacts')
        .select('id')
        .eq('organization_id', org.id)
        .ilike('email', forcedRequesterEmail)
        .limit(1)
        .maybeSingle();
      forcedRequesterId = contactMatch?.id ?? null;
    }

    // The insert and its whole side-effect chain (creator auto-follow,
    // creation notification, default-owner assignment) live in the domain
    // layer so the MCP tools and internal AI agents run exactly this path
    // instead of a reduced copy of it.
    const result = await domainCreateTicket(
      {
        actor: {
          tenantId,
          agentId: agent?.id ?? null,
          userId: user.id,
          role: agent?.role ?? null,
          email: agentEmailForNotify ?? null,
          organizationIds: enforcedOrgId ? [enforcedOrgId] : null,
          channel: 'ui',
        },
        client,
      },
      {
        ...validated,
        organization_id: enforcedOrgId ?? validated.organization_id ?? null,
        requester_email: validated.requester_email ?? null,
        requester_id: validated.requester_id ?? null,
        channel: 'web',
      },
      {
        enforcedOrganizationId: enforcedOrgId,
        // For clients the requester is pinned server-side; staff agents may
        // legitimately file on someone else's behalf.
        forcedRequester:
          forcedRequesterEmail !== null
            ? { email: forcedRequesterEmail, contactId: forcedRequesterId }
            : null,
        autoFollowCreator: !!agent && !isClient,
      },
    );

    if (result.error !== null) {
      return { data: null, error: result.error };
    }

    revalidatePath('/home/tickets');
    return { data: result.data, error: null };
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

    // Verify the ticket belongs to the same tenant. Fetch the current
    // assignee so we can keep them as follower if this update reassigns.
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id, assigned_agent_id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }
    const previousAssigneeId = (existing as { assigned_agent_id: string | null })
      .assigned_agent_id;

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

    const newAssigneeId =
      (validated as { assigned_agent_id?: string | null }).assigned_agent_id
      ?? previousAssigneeId;
    const reassigned =
      (validated as { assigned_agent_id?: string | null }).assigned_agent_id !==
        undefined && newAssigneeId !== previousAssigneeId;

    if (reassigned || !previousAssigneeId) {
      addFollowersBulk(client, {
        tenantId: agent.tenant_id,
        ticketId,
        agentIds: [previousAssigneeId, newAssigneeId, agent.id],
        reason: reassigned ? 'reassignment' : 'assignment',
      }).catch(() => {});
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

    // Verify ticket belongs to tenant. We also pull the current assignee
    // so we can keep them as a follower after the reassignment.
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id, status, assigned_agent_id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    const previousAssigneeId = (existing as { assigned_agent_id: string | null })
      .assigned_agent_id;

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

    // Auto-follow the previous and new assignee so the outgoing agent
    // keeps getting updates until the ticket is closed.
    const isReassignment = agentId && agentId !== previousAssigneeId;
    addFollowersBulk(client, {
      tenantId: agent.tenant_id,
      ticketId,
      agentIds: [previousAssigneeId, agentId ?? null, agent.id],
      reason: isReassignment ? 'reassignment' : 'assignment',
    }).catch(() => {});

    // Notify assigned agent
    if (agentId) {
      const { data: tgtAgent } = await client.from('agents').select('user_id, email, name').eq('id', agentId).single();
      if (tgtAgent) {
        notifyTicketAssigned({
          tenantId: agent.tenant_id, ticketNumber: ticket.ticket_number, ticketId: ticket.id,
          title: ticket.title, type: ticket.type, urgency: ticket.urgency, status: ticket.status,
          assignedAgentId: agentId,
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
  /**
   * Why the SLA clock should pause, for the statuses that require it
   * (detenido / backlog / esperando_ventana — see REASON_REQUIRED_STATUSES).
   *
   * Omitting it on one of those is not an error: the trigger records
   * 'priorizacion_interna', which does NOT pause the clock. That fail-closed
   * default is intentional — an unjustified pause must not hand us deadline we
   * cannot defend to the client.
   */
  pauseReason?: SlaPauseReason | null,
): Promise<ActionResult> {
  try {
    ticketStatusEnum.parse(newStatus);

    const client = getSupabaseServerClient();
    const { agent, isClient, error: authError } = await requireAuthUser(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Transition validation, timestamping, reopen counting, testing-stage
    // tracking, pause-reason tagging, notifications and the NPS queue all
    // live in the domain layer so MCP and internal agents run this exact
    // path rather than a reduced copy of it.
    const result = await domainChangeStatus(
      {
        actor: {
          tenantId: agent.tenant_id,
          agentId: agent.id,
          userId: null,
          role: isClient ? 'readonly' : agent.role,
          email: agent.email,
          organizationIds: null,
          channel: 'ui',
        },
        client,
      },
      ticketId,
      newStatus,
      { pauseReason: pauseReason ?? null },
    );

    if (result.error !== null) {
      return { data: null, error: result.error };
    }

    revalidatePath('/home/tickets');
    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: result.data, error: null };
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

    // The Testing sub-state is only meaningful while the ticket is in
    // status='testing'. Allowing writes from any status leaked stuck
    // 'fracaso' flags onto resolved/closed tickets (48 such rows in prod
    // before the 00041 cleanup) and corrupted the "Casos Fracaso Testing"
    // report. The UI already hides the picker outside testing — this is
    // defense-in-depth against direct API calls.
    if (ticket.status !== 'testing') {
      return {
        data: null,
        error: 'El resultado de testing solo puede marcarse mientras el ticket está en estado Testing',
      };
    }

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

    // Fetch ticket with tenant + org + type scope. `type` is part of the
    // uniqueness key now: a client can have rank 1 in warranty AND rank 1
    // in support concurrently — they're independent prioritizations.
    const { data: ticket, error: tErr } = await client
      .from('tickets')
      .select('id, tenant_id, organization_id, type, custom_fields')
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

    // Uniqueness check (only when setting a value) — scoped by type so
    // each ticket type has its own independent 1..50 ordering.
    if (rank !== null) {
      const { data: clashes } = await client
        .from('tickets')
        .select('id, ticket_number, title')
        .eq('organization_id', ticket.organization_id)
        .eq('type', ticket.type)
        .neq('id', ticketId)
        .is('deleted_at', null)
        .not('status', 'in', '(closed,cancelled,resolved)')
        .eq('custom_fields->>client_rank', String(rank))
        .limit(1);

      if (clashes && clashes.length > 0) {
        const clash = clashes[0];
        return {
          data: null,
          error: `El orden ${rank} ya está asignado a otro ticket del mismo tipo (${clash?.ticket_number ?? ''}). Escoge otro número.`,
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

    // Product rule: internal notes must never reach contacts. Strip contact
    // mentions defensively even if the UI already filtered them out.
    const mentionedAgentIds = validated.mentioned_agent_ids ?? [];
    const mentionedContactIds = validated.is_private
      ? []
      : (validated.mentioned_contact_ids ?? []);

    // Verify ticket belongs to tenant — and grab every column the notify
    // path will need, so we don't have to round-trip again later.
    // first_response_at is included so we can stamp it below on the first
    // staff reply without an extra round-trip.
    const { data: existing } = await client
      .from('tickets')
      .select(
        'id, tenant_id, organization_id, ticket_number, title, type, urgency, requester_email, assigned_agent_id, first_response_at',
      )
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return { data: null, error: 'Ticket not found' };
    }

    // Compute the email Message-ID up front so we can persist it alongside
    // the row. The domain must match the `from` domain Resend is configured
    // with so receiving MTAs don't reject it as forged.
    const emailMessageId = `ticket-${ticketId}-${crypto.randomUUID()}@itsm.tdxcore.com`;

    const { data: followup, error } = await client
      .from('ticket_followups')
      .insert({
        ticket_id: ticketId,
        tenant_id: agent.tenant_id,
        content: validated.content,
        content_html: validated.content_html ?? null,
        is_private: validated.is_private,
        author_id: user.id,
        author_type: 'agent',
        email_message_id: emailMessageId,
        mentioned_agent_ids: mentionedAgentIds,
        mentioned_contact_ids: mentionedContactIds,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    // First-response stamping: ITIL "first response" = the first PUBLIC
    // reply from a staff agent. Until migration 00045 this only fired
    // when status left 'new' via changeTicketStatus, so an agent who
    // replied without moving status left first_response_at NULL and
    // broke every FRT metric. Doing it here closes that hole. Fire-and-
    // forget + .is('first_response_at', null) keeps it race-safe even
    // when two replies land at the same moment.
    if (
      !isClient &&
      !validated.is_private &&
      !(existing as { first_response_at: string | null }).first_response_at
    ) {
      client
        .from('tickets')
        .update({ first_response_at: new Date().toISOString() })
        .eq('id', ticketId)
        .is('first_response_at', null)
        .then(({ error: frtErr }) => {
          if (frtErr) console.warn('[addFollowup] first_response_at stamp failed:', frtErr);
        });
    }

    // Link any attachments uploaded before submit to this followup so the
    // timeline / preview UI can group them under the message that was sent.
    // We scope by tenant + ticket as a defense-in-depth check (RLS already
    // enforces tenant). Failures are non-fatal — the file still uploaded.
    // Fire-and-forget: the attachment link doesn't have to settle before we
    // return. Realtime + the timeline's own attachments query will pick it
    // up moments later.
    const attachmentIds = validated.attachment_ids ?? [];
    if (attachmentIds.length > 0 && followup?.id) {
      client
        .from('ticket_attachments')
        .update({ followup_id: followup.id as string })
        .in('id', attachmentIds)
        .eq('ticket_id', ticketId)
        .eq('tenant_id', agent.tenant_id)
        .is('followup_id', null)
        .then(({ error: linkErr }) => {
          if (linkErr) console.warn('[addFollowup] attachment link failed:', linkErr);
        });
    }

    // Auto-follow on participation — any agent who posts a followup,
    // public or private, becomes a follower on that ticket.
    if (!isClient) {
      addFollower(client, {
        tenantId: agent.tenant_id,
        ticketId,
        agentId: agent.id,
        reason: 'followup',
      }).catch(() => {});
    }

    // Auto-follow every mentioned agent and contact (public replies only
    // for contacts — per the internal-note policy above, contact lists are
    // already empty for private notes).
    for (const mentionedAgentId of mentionedAgentIds) {
      addFollower(client, {
        tenantId: agent.tenant_id,
        ticketId,
        agentId: mentionedAgentId,
        reason: 'mention',
        isAuto: false,
      }).catch(() => {});
    }
    for (const mentionedContactId of mentionedContactIds) {
      // The generic helper expects agent_id; for contacts we go direct.
      client
        .from('ticket_followers')
        .upsert(
          {
            tenant_id: agent.tenant_id,
            ticket_id: ticketId,
            contact_id: mentionedContactId,
            added_reason: 'mention',
            is_auto: false,
          },
          { onConflict: 'ticket_id,contact_id', ignoreDuplicates: true },
        )
        .then(() => {});
    }

    // Notify on public replies and internal notes. We reuse the columns
    // already fetched in the tenant-verification query above instead of
    // round-tripping the database again — that single round-trip was
    // visible as ~50–150ms of dead time before the editor cleared.
    notifyTicketCommented({
      tenantId: agent.tenant_id,
      ticketNumber: existing.ticket_number,
      ticketId,
      title: existing.title,
      type: existing.type,
      urgency: existing.urgency,
      status: '',
      comment: validated.content,
      commentHtml: validated.content_html ?? null,
      agentName: agent.name,
      // Internal notes never reach the requester; passing undefined makes
      // notifyTicketCommented skip the email path entirely.
      requesterEmail: validated.is_private
        ? undefined
        : (existing.requester_email ?? undefined),
      agentUserId: user.id,
      agentEmail: agent.email,
      assignedAgentId: existing.assigned_agent_id ?? undefined,
      emailMessageId,
      ccContactIds: validated.is_private ? [] : mentionedContactIds,
      mentionedAgentIds: validated.is_private ? undefined : mentionedAgentIds,
      followupId: followup.id as string,
      isInternal: validated.is_private,
    }).catch(() => {});

    // No revalidatePath here: the ticket-detail page subscribes to
    // ticket_followups via Supabase Realtime, so the new message lands in
    // the timeline through the websocket — no server re-render needed.
    // Re-introducing revalidatePath would force the next navigation to
    // re-run all ~10 parallel queries on this route for no UI gain.
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

// ---------------------------------------------------------------------------
// 12. Ticket followers — manual subscribe / unsubscribe
// ---------------------------------------------------------------------------

/**
 * Manually subscribe the current agent (or an arbitrary agent) to a ticket
 * so they receive all email + in-app updates until they unfollow or the
 * ticket is closed. Clients (role=readonly) cannot follow tickets.
 */
export async function followTicket(
  ticketId: string,
  agentId?: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);
    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return { data: null, error: 'Ticket not found' };

    const targetAgentId = agentId ?? agent.id;
    await addFollower(client, {
      tenantId: agent.tenant_id,
      ticketId,
      agentId: targetAgentId,
      reason: 'manual' satisfies FollowerReason,
      isAuto: false,
    });

    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: { ticketId, agentId: targetAgentId }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function unfollowTicket(
  ticketId: string,
  agentId?: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);
    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const targetAgentId = agentId ?? agent.id;
    await removeFollower(client, { ticketId, agentId: targetAgentId });

    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: { ticketId, agentId: targetAgentId }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 11. Clause-4 commitments — P0 mitigation & P0/P1 correction plan
// ---------------------------------------------------------------------------
// Contract cl. 4 carries two duties beyond the response SLA:
//   · P0      → a mitigation or temporary solution by the close of the same
//               business day
//   · P0 + P1 → a correction plan WITH a committed date, inside the response
//               window
//
// Both are recorded, not inferred. An agent states that the commitment was
// communicated to the client, and the timestamp of that statement is the
// evidence we can produce if the client disputes it later. Nothing derives
// these from status changes: a status change is not a promise to a client.

/**
 * Records that a mitigation or temporary solution was delivered to the client.
 *
 * Only for severities that carry the duty — `mitigation_due_at` being set is
 * what marks that, and it is stamped at ticket creation from the contract's
 * targets. The note is mandatory: it is the evidence of what was delivered.
 */
export async function recordMitigation(
  ticketId: string,
  note: string,
): Promise<ActionResult> {
  try {
    const trimmed = note.trim();
    if (!trimmed) {
      return {
        data: null,
        error: 'Describe la mitigación entregada — es la evidencia del cumplimiento',
      };
    }

    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);
    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }
    // Clients must not be able to record TDX's own commitments.
    if (agent.role === 'readonly') return { data: null, error: 'Unauthorized' };

    const { data: ticket, error: tErr } = await client
      .from('tickets')
      .select('id, mitigation_due_at, mitigation_at')
      .eq('id', ticketId)
      .is('deleted_at', null)
      .maybeSingle();

    if (tErr || !ticket) return { data: null, error: 'Ticket not found' };

    if (!ticket.mitigation_due_at) {
      return {
        data: null,
        error:
          'Este ticket no tiene compromiso de mitigación (solo aplica a severidad crítica bajo contrato con SLA)',
      };
    }

    // First delivery is the one the contract measures. Re-recording would
    // overwrite the evidence of whether we met the deadline.
    if (ticket.mitigation_at) {
      return {
        data: null,
        error: 'La mitigación ya fue registrada y no puede reescribirse',
      };
    }

    const { data: updated, error: uErr } = await client
      .from('tickets')
      .update({
        mitigation_at: new Date().toISOString(),
        mitigation_note: trimmed,
        updated_by: user.id,
      })
      .eq('id', ticketId)
      .select('id, mitigation_at, mitigation_due_at')
      .single();

    if (uErr) return { data: null, error: uErr.message };

    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: updated, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Records the correction plan and the date committed to the client (P0/P1).
 *
 * Unlike the mitigation, this one may be updated: a committed date can
 * legitimately move, and the contract does not forbid re-committing. Each
 * change lands in audit_logs, so the history of what was promised stays
 * reconstructible.
 */
export async function recordCorrectionPlan(
  ticketId: string,
  committedDate: string,
  note: string,
): Promise<ActionResult> {
  try {
    const trimmed = note.trim();
    if (!trimmed) {
      return {
        data: null,
        error: 'Describe el plan de corrección — es la evidencia del compromiso',
      };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(committedDate)) {
      return { data: null, error: 'Fecha comprometida inválida (formato YYYY-MM-DD)' };
    }

    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);
    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }
    if (agent.role === 'readonly') return { data: null, error: 'Unauthorized' };

    const { data: ticket, error: tErr } = await client
      .from('tickets')
      .select('id, urgency')
      .eq('id', ticketId)
      .is('deleted_at', null)
      .maybeSingle();

    if (tErr || !ticket) return { data: null, error: 'Ticket not found' };

    if (!['critical', 'high'].includes(ticket.urgency)) {
      return {
        data: null,
        error:
          'El plan de corrección con fecha comprometida solo aplica a severidad crítica o alta (contrato cl. 4)',
      };
    }

    const { data: updated, error: uErr } = await client
      .from('tickets')
      .update({
        correction_plan_at: new Date().toISOString(),
        correction_committed_date: committedDate,
        correction_plan_note: trimmed,
        updated_by: user.id,
      })
      .eq('id', ticketId)
      .select('id, correction_plan_at, correction_committed_date')
      .single();

    if (uErr) return { data: null, error: uErr.message };

    revalidatePath(`/home/tickets/${ticketId}`);
    return { data: updated, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
