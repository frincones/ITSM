// ---------------------------------------------------------------------------
// Domain layer — tickets, the rest of it
// ---------------------------------------------------------------------------
// Core ticket operations (create, update, status, assign, comment) live in
// tickets.domain.ts. This module covers everything else the UI can do:
// tasks, solutions, followers, relations, attachments, the testing gate and
// the clause-4 commitments.
//
// The clause-4 functions (mitigation, correction plan) and the client
// priority rank carry contractual meaning and are moved VERBATIM from
// lib/actions/tickets.ts, validation rules included. They are not
// reinterpreted here: the wording of those rules is what gets argued over
// when a client disputes a figure.
// ---------------------------------------------------------------------------

import 'server-only';

import { addFollower, removeFollower } from '~/lib/services/ticket-followers.service';

import type { TicketType } from './tickets.domain';

import {
  asJson,
  fail,
  isClientActor,
  ok,
  requireUserId,
  resolveOrgScope,
  type DomainContext,
  type DomainResult,
} from './types';

/** Loads a ticket inside the caller's tenant and org scope, or null. */
async function loadTicket(ctx: DomainContext, ticketId: string, columns: string) {
  const { actor, client } = ctx;

  let q = client
    .from('tickets')
    .select(columns)
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);

  const orgScope = resolveOrgScope(actor);
  if (orgScope) q = q.in('organization_id', orgScope);

  const { data } = await q.maybeSingle();
  return data as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskFields {
  title: string;
  description?: string | null;
  assigned_agent_id?: string | null;
  due_date?: string | null;
}

export async function addTask(
  ctx: DomainContext,
  ticketId: string,
  fields: TaskFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const ticket = await loadTicket(ctx, ticketId, 'id');
  if (!ticket) return fail('Ticket not found', 'not_found');

  const { data, error } = await client
    .from('ticket_tasks')
    .insert({
      tenant_id: actor.tenantId,
      ticket_id: ticketId,
      title: fields.title,
      description: fields.description ?? null,
      assigned_agent_id: fields.assigned_agent_id ?? null,
      due_date: fields.due_date ?? null,
      // CHECK (status IN ('todo','in_progress','done')) — not 'pending'.
      status: 'todo',
      created_by: actor.userId,
    })
    .select('*')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function completeTask(
  ctx: DomainContext,
  taskId: string,
  completed: boolean,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: task } = await client
    .from('ticket_tasks')
    .select('id, ticket_id, status')
    .eq('id', taskId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();
  if (!task) return fail('Task not found', 'not_found');

  // Confirm the parent ticket is in scope — the task table is not org-scoped
  // on its own, so it inherits visibility from the ticket.
  const ticket = await loadTicket(ctx, task.ticket_id as string, 'id');
  if (!ticket) return fail('Task not found', 'not_found');

  const now = new Date().toISOString();
  const { data, error } = await client
    .from('ticket_tasks')
    // There is no completed_at column; `status` carries the whole state and
    // updated_at records when it last moved.
    .update({
      status: completed ? 'done' : 'todo',
      updated_at: now,
    })
    .eq('id', taskId)
    .eq('tenant_id', actor.tenantId)
    .select('*')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function listTasks(
  ctx: DomainContext,
  ticketId: string,
): Promise<DomainResult<{ tasks: unknown[] }>> {
  const ticket = await loadTicket(ctx, ticketId, 'id');
  if (!ticket) return fail('Ticket not found', 'not_found');

  const { data, error } = await ctx.client
    .from('ticket_tasks')
    .select('*')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) return fail(error.message, 'internal');
  return ok({ tasks: data ?? [] });
}

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------

export async function addSolution(
  ctx: DomainContext,
  ticketId: string,
  content: string,
  options: { contentHtml?: string | null; isApproved?: boolean } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  // author_id is NOT NULL REFERENCES auth.users(id), so an actor is required.
  const resolved = requireUserId(actor);
  // Narrow on the value, not the error: TypeScript discriminates this union
  // by `userId`, so checking `error` leaves userId as `string | null` and the
  // NOT NULL author column rejects it at the type level.
  if (!resolved.ok) return fail(resolved.error, 'forbidden');

  const ticket = await loadTicket(ctx, ticketId, 'id');
  if (!ticket) return fail('Ticket not found', 'not_found');

  const { data, error } = await client
    .from('ticket_solutions')
    .insert({
      tenant_id: actor.tenantId,
      ticket_id: ticketId,
      content,
      content_html: options.contentHtml ?? null,
      // The column is a boolean flag, not a status string.
      is_approved: options.isApproved ?? false,
      author_id: resolved.userId,
    })
    .select('*')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Followers
// ---------------------------------------------------------------------------

export async function followTicket(
  ctx: DomainContext,
  ticketId: string,
  agentId: string,
): Promise<DomainResult<{ following: boolean }>> {
  const { actor, client } = ctx;

  const ticket = await loadTicket(ctx, ticketId, 'id');
  if (!ticket) return fail('Ticket not found', 'not_found');

  const { data: agent } = await client
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();
  if (!agent) return fail('Agent not found in this tenant', 'not_found');

  await addFollower(client, {
    tenantId: actor.tenantId,
    ticketId,
    agentId,
    reason: 'manual',
    isAuto: false,
  });

  return ok({ following: true });
}

export async function unfollowTicket(
  ctx: DomainContext,
  ticketId: string,
  agentId: string,
): Promise<DomainResult<{ following: boolean }>> {
  const ticket = await loadTicket(ctx, ticketId, 'id');
  if (!ticket) return fail('Ticket not found', 'not_found');

  await removeFollower(ctx.client, { ticketId, agentId });
  return ok({ following: false });
}

export async function listFollowers(
  ctx: DomainContext,
  ticketId: string,
): Promise<DomainResult<{ followers: unknown[] }>> {
  const ticket = await loadTicket(ctx, ticketId, 'id');
  if (!ticket) return fail('Ticket not found', 'not_found');

  const { data, error } = await ctx.client
    .from('ticket_followers')
    .select('id, agent_id, contact_id, added_at, added_reason, is_auto, agents(name, email)')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('ticket_id', ticketId)
    .order('added_at', { ascending: true });

  if (error) return fail(error.message, 'internal');
  return ok({ followers: data ?? [] });
}

// ---------------------------------------------------------------------------
// Relations and attachments
// ---------------------------------------------------------------------------

/** ticket_relations.relation_type CHECK constraint, verbatim from 00004. */
export const TICKET_RELATION_TYPES = [
  'duplicate',
  'related',
  'parent',
  'child',
  'blocks',
  'blocked_by',
] as const;
export type TicketRelationType = (typeof TICKET_RELATION_TYPES)[number];

export async function relateTickets(
  ctx: DomainContext,
  ticketId: string,
  relatedTicketId: string,
  relationType: TicketRelationType,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (ticketId === relatedTicketId) {
    return fail('A ticket cannot be related to itself', 'invalid_input');
  }

  const [source, target] = await Promise.all([
    loadTicket(ctx, ticketId, 'id, ticket_number'),
    loadTicket(ctx, relatedTicketId, 'id, ticket_number'),
  ]);
  if (!source) return fail('Ticket not found', 'not_found');
  if (!target) return fail('Related ticket not found', 'not_found');

  const { data, error } = await client
    .from('ticket_relations')
    .insert({
      tenant_id: actor.tenantId,
      ticket_id: ticketId,
      related_ticket_id: relatedTicketId,
      relation_type: relationType,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail('These tickets are already related', 'conflict');
    }
    return fail(error.message, 'internal');
  }
  return ok({ relation: data, source, target });
}

export async function listAttachments(
  ctx: DomainContext,
  ticketId: string,
): Promise<DomainResult<{ attachments: unknown[] }>> {
  const ticket = await loadTicket(ctx, ticketId, 'id');
  if (!ticket) return fail('Ticket not found', 'not_found');

  const { data, error } = await ctx.client
    .from('ticket_attachments')
    // file_url and file_path are storage locations, not public links; they
    // are returned so a caller can fetch through the app's own endpoint.
    .select('id, file_name, mime_type, file_size, uploaded_by, followup_id, created_at')
    .eq('tenant_id', ctx.actor.tenantId)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) return fail(error.message, 'internal');
  return ok({ attachments: data ?? [] });
}

// ---------------------------------------------------------------------------
// Testing gate
// ---------------------------------------------------------------------------

/**
 * Records the outcome of client testing.
 *
 * Only writable while the ticket is in 'testing'. Allowing it from any
 * status leaked stuck results onto tickets that had already moved on — the
 * restriction is moved verbatim from the UI action.
 */
export async function setTestingResult(
  ctx: DomainContext,
  ticketId: string,
  result: 'passed' | 'failed' | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const ticket = await loadTicket(ctx, ticketId, 'id, status, custom_fields');
  if (!ticket) return fail('Ticket not found', 'not_found');

  if (ticket.status !== 'testing') {
    return fail(
      `A testing result can only be recorded while the ticket is in 'testing'; this one is '${ticket.status}'`,
      'conflict',
    );
  }

  const nextCustom: Record<string, unknown> = {
    ...((ticket.custom_fields as Record<string, unknown> | null) ?? {}),
  };
  if (result === null) delete nextCustom.testing_result;
  else nextCustom.testing_result = result;

  const { data, error } = await client
    .from('tickets')
    .update({
      custom_fields: asJson(nextCustom),
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select('id, ticket_number, status, custom_fields, testing_strikes')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Clause 4 — contractual commitments
// ---------------------------------------------------------------------------

/**
 * Records that mitigation was delivered.
 *
 * Rules moved verbatim from the UI action:
 *   - only on tickets that carry a mitigation deadline (mitigation_due_at)
 *   - only once; the first record is the one the contract measures
 */
export async function recordMitigation(
  ctx: DomainContext,
  ticketId: string,
  note: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const trimmed = note.trim();
  if (!trimmed) return fail('A mitigation note is required', 'invalid_input');

  const ticket = await loadTicket(
    ctx,
    ticketId,
    'id, ticket_number, mitigation_due_at, mitigation_at',
  );
  if (!ticket) return fail('Ticket not found', 'not_found');

  if (!ticket.mitigation_due_at) {
    return fail(
      'This ticket has no mitigation deadline, so clause 4 mitigation does not apply to it',
      'conflict',
    );
  }
  if (ticket.mitigation_at) {
    return fail(
      'Mitigation was already recorded for this ticket. The first record is the one the contract measures.',
      'conflict',
    );
  }

  const { data, error } = await client
    .from('tickets')
    .update({
      mitigation_at: new Date().toISOString(),
      mitigation_note: trimmed,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select('id, ticket_number, mitigation_at, mitigation_due_at, mitigation_note')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/**
 * Records a correction plan with a committed date.
 *
 * Restricted to critical and high severity, verbatim from the UI action:
 * clause 4 only requires a committed correction date for those.
 */
export async function recordCorrectionPlan(
  ctx: DomainContext,
  ticketId: string,
  committedDate: string,
  note: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const trimmed = note.trim();
  if (!trimmed) return fail('A correction plan note is required', 'invalid_input');

  const ticket = await loadTicket(ctx, ticketId, 'id, ticket_number, urgency');
  if (!ticket) return fail('Ticket not found', 'not_found');

  if (!['critical', 'high'].includes(ticket.urgency as string)) {
    return fail(
      'A correction plan with a committed date only applies to critical or high severity (contract cl. 4)',
      'conflict',
    );
  }

  const { data, error } = await client
    .from('tickets')
    .update({
      correction_plan_at: new Date().toISOString(),
      correction_committed_date: committedDate,
      correction_plan_note: trimmed,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select(
      'id, ticket_number, urgency, correction_plan_at, correction_committed_date, correction_plan_note',
    )
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/**
 * Sets the client's own priority ordering for a ticket.
 *
 * Stored in custom_fields.client_rank, not a column. Uniqueness is per
 * (organization, type): a client can hold rank 1 in warranty and rank 1 in
 * backlog at the same time, because they are separate queues.
 */
export async function setClientRank(
  ctx: DomainContext,
  ticketId: string,
  rank: number | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > 50)) {
    return fail('rank must be an integer between 1 and 50, or null to clear it', 'invalid_input');
  }

  const ticket = await loadTicket(
    ctx,
    ticketId,
    'id, ticket_number, organization_id, type, custom_fields',
  );
  if (!ticket) return fail('Ticket not found', 'not_found');

  if (rank !== null) {
    const { data: clash } = await client
      .from('tickets')
      .select('id, ticket_number, title')
      .eq('tenant_id', actor.tenantId)
      .eq('organization_id', ticket.organization_id as string)
      // The value comes from the column, so it is already a member of the enum.
      .eq('type', ticket.type as TicketType)
      .eq('custom_fields->>client_rank', String(rank))
      .neq('id', ticketId)
      .is('deleted_at', null)
      .maybeSingle();

    if (clash) {
      return fail(
        `Rank ${rank} is already taken by ${(clash as { ticket_number: string }).ticket_number} in the same client and ticket type. Pick another number.`,
        'conflict',
      );
    }
  }

  const nextCustom: Record<string, unknown> = {
    ...((ticket.custom_fields as Record<string, unknown> | null) ?? {}),
  };
  if (rank === null) delete nextCustom.client_rank;
  else nextCustom.client_rank = rank;

  const { data, error } = await client
    .from('tickets')
    .update({
      custom_fields: asJson(nextCustom),
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select('id, ticket_number, type, organization_id, custom_fields')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** Exported for the MCP layer so client actors are refused consistently. */
export function assertStaffActor(ctx: DomainContext): DomainResult<true> | null {
  if (isClientActor(ctx.actor)) {
    return fail('Not allowed for client users', 'forbidden');
  }
  return null;
}
