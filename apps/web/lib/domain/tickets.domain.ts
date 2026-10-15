// ---------------------------------------------------------------------------
// Domain layer — tickets
// ---------------------------------------------------------------------------
// Single source of truth for ticket writes. Every entry point funnels here:
//
//   lib/actions/tickets.ts   (UI, identity from auth.uid())
//   lib/mcp/tools/tickets.ts (external agents, identity from the API key)
//   lib/ai/assistant-tools   (internal AI, identity from the session agent)
//   app/api/cron/*           (automation, identity = system)
//
// Identity arrives as a DomainActor. Nothing in this file calls
// `auth.getUser()` — that is the whole point, and the reason the MCP tools
// previously had to re-implement a bare INSERT and lost auto-assignment,
// notifications and followers in the process.
//
// Behavior preserved verbatim from lib/actions/tickets.ts: the status
// transition map, the first_response_at rule (which is contractual — see the
// inline note), reopen counting, testing timestamps, the pause-reason tagging
// and the notification/NPS fan-out. Changing any of those is out of scope for
// the extraction; this file must be a faithful move.
// ---------------------------------------------------------------------------

import 'server-only';

import { after } from 'next/server';

import { assignAndNotify } from '~/lib/services/assignment.service';
import {
  notifyTicketCreated,
  notifyTicketResolved,
  notifyTicketStatusChanged,
} from '~/lib/services/notify.service';
import { queueNpsForTicket } from '~/lib/services/nps.service';
import {
  NON_PAUSING_REASON,
  REASON_REQUIRED_STATUSES,
  type SlaPauseReason,
} from '~/lib/services/support-contract.service';
import { addFollower } from '~/lib/services/ticket-followers.service';

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

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
// Moved from lib/actions/tickets.ts unchanged. Exported so the MCP layer can
// advertise valid targets in a tool description and the UI can build pickers
// from the same map instead of duplicating it.

/** Every status the ticket_status enum allows. */
export type TicketStatus =
  | 'new'
  | 'backlog'
  | 'assigned'
  | 'in_progress'
  | 'pending'
  | 'detenido'
  | 'esperando_ventana'
  | 'testing'
  | 'resolved'
  | 'reopened'
  | 'closed'
  | 'cancelled';

export const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['backlog', 'assigned', 'in_progress', 'pending', 'detenido', 'testing', 'closed', 'cancelled'],
  backlog: ['new', 'assigned', 'in_progress', 'pending', 'detenido', 'testing', 'closed', 'cancelled'],
  assigned: ['backlog', 'in_progress', 'pending', 'detenido', 'testing', 'closed', 'cancelled'],
  in_progress: ['backlog', 'pending', 'detenido', 'esperando_ventana', 'testing', 'resolved', 'closed', 'cancelled'],
  pending: ['backlog', 'in_progress', 'detenido', 'testing', 'resolved', 'closed', 'cancelled'],
  detenido: ['backlog', 'in_progress', 'pending', 'testing', 'resolved', 'closed', 'cancelled'],
  // A fix that is ready but waiting on an agreed deploy window. Leaves to
  // resolved once deployed, or back to in_progress if the deploy fails.
  esperando_ventana: ['in_progress', 'detenido', 'testing', 'resolved', 'closed', 'cancelled'],
  testing: ['backlog', 'in_progress', 'pending', 'detenido', 'resolved', 'closed', 'cancelled'],
  resolved: ['closed', 'in_progress', 'reopened'],
  reopened: ['assigned', 'in_progress', 'pending', 'detenido', 'testing', 'resolved', 'closed', 'cancelled'],
  closed: ['in_progress', 'backlog', 'reopened'],
  cancelled: ['new', 'backlog'],
};

/**
 * Statuses a client/portal user may set from their own UI. 'reopened' is
 * deliberately included so a customer can reopen a ticket they believe was
 * closed prematurely — the common Zendesk / Freshdesk expectation.
 */
export const CLIENT_ALLOWED_STATUSES = [
  'new',
  'backlog',
  'in_progress',
  'pending',
  'detenido',
  'testing',
  'resolved',
  'reopened',
  'closed',
] as const;

/**
 * Transitions that cannot occur without the client having been told
 * something, and therefore the only ones that may stamp first_response_at.
 *
 * This is contractual, not cosmetic: the contract defines the response as
 * acknowledgement, classification, diagnosis and communication of the plan
 * (cl. 4). Stamping on internal movement (assigned, in_progress, testing…)
 * inflates measured compliance, and a client who produces their own email
 * trail showing the real figure is how service credits get owed (cl. 5).
 */
const COMMUNICATES_TO_CLIENT = ['resolved', 'closed'];

/**
 * Runs a side effect without blocking the response, but in a way that
 * survives a serverless environment.
 *
 * A bare `void promise` is NOT enough on Vercel: the function freezes as soon
 * as the handler returns, so anything still in flight is killed. That is why
 * a ticket created over MCP came back unassigned even with a default owner
 * configured, while the same code worked from the UI (where the Node server
 * stays alive between requests).
 *
 * `after()` registers the work with the platform so it completes after the
 * response is sent. It throws outside a request scope (cron scripts, tests,
 * direct invocations), so we fall back to fire-and-forget there — those
 * callers are long-lived processes where it already worked.
 */
function runAfterResponse(work: () => Promise<unknown>): void {
  try {
    after(() => work().catch(() => {}));
  } catch {
    void work().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

/**
 * Enum columns typed as unions rather than `string`.
 *
 * Mirrors the Postgres enums. Declaring these as `string` is what let
 * `channel: 'web'` through — a value the ticket_channel enum does not
 * contain, which would have failed every ticket created from the web form.
 */
export type TicketType =
  | 'incident'
  | 'request'
  | 'warranty'
  | 'support'
  | 'backlog'
  | 'desarrollo_pendiente';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CreateTicketFields {
  title: string;
  description: string;
  type: TicketType;
  urgency: SeverityLevel;
  impact: SeverityLevel;
  organization_id?: string | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  service_id?: string | null;
  requester_id?: string | null;
  requester_email?: string | null;
  assigned_agent_id?: string | null;
  assigned_group_id?: string | null;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  /**
   * Must be a member of the ticket_channel Postgres enum — a free string
   * fails the insert at runtime. Omit to accept the column default
   * ('portal'). Typed as a union so a bad value is a compile error.
   */
  channel?: TicketChannel;
}

/** Mirrors the ticket_channel enum declared in migration 00004. */
export type TicketChannel =
  | 'portal'
  | 'email'
  | 'whatsapp'
  | 'phone'
  | 'api'
  | 'ai_agent'
  | 'web_widget';

export interface CreateTicketOptions {
  /**
   * Force the requester to a specific identity, overriding whatever the
   * caller sent. The portal path uses this so a client cannot file a ticket
   * on somebody else's behalf. Staff agents legitimately may, so they leave
   * it unset.
   */
  forcedRequester?: { email: string; contactId: string | null } | null;
  /** Restrict the ticket to one organization regardless of the input. */
  enforcedOrganizationId?: string | null;
  /** Add the acting agent as the first follower. Default: staff only. */
  autoFollowCreator?: boolean;
  /** Run the default-owner assignment chain. Default: true. */
  autoAssign?: boolean;
  /** Emit the creation notification. Default: true. */
  notify?: boolean;
}

/**
 * Creates a ticket and runs the full side-effect chain: creator auto-follow,
 * creation notification and default-owner assignment.
 *
 * Side effects are fire-and-forget by design (inherited from the UI action):
 * a notification or assignment failure must never roll back the insert,
 * because an unassigned ticket is visible and recoverable while a lost one
 * is not.
 */
export async function createTicket(
  ctx: DomainContext,
  fields: CreateTicketFields,
  options: CreateTicketOptions = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;
  const {
    forcedRequester = null,
    enforcedOrganizationId = null,
    autoAssign = true,
    notify = true,
  } = options;

  const organizationId = enforcedOrganizationId ?? fields.organization_id ?? null;

  // An org-restricted actor may only file into its own organizations. We
  // reject rather than silently redirect: quietly moving a ticket to another
  // organization would be worse than a clear error.
  if (organizationId) {
    const scope = resolveOrgScope(actor, [organizationId]);
    if (scope && !scope.includes(organizationId)) {
      return fail('organization_id is outside the caller allowlist', 'forbidden');
    }
  }

  const autoFollowCreator =
    options.autoFollowCreator ?? (!!actor.agentId && !isClientActor(actor));

  const { data: ticket, error } = await client
    .from('tickets')
    .insert({
      tenant_id: actor.tenantId, // NEVER from caller input
      title: fields.title,
      description: fields.description,
      type: fields.type,
      urgency: fields.urgency,
      impact: fields.impact,
      organization_id: organizationId,
      category_id: fields.category_id ?? null,
      subcategory_id: fields.subcategory_id ?? null,
      service_id: fields.service_id ?? null,
      requester_email: forcedRequester?.email ?? fields.requester_email ?? null,
      requester_id: forcedRequester
        ? forcedRequester.contactId
        : (fields.requester_id ?? null),
      assigned_agent_id: fields.assigned_agent_id ?? null,
      assigned_group_id: fields.assigned_group_id ?? null,
      tags: fields.tags ?? [],
      custom_fields: asJson(fields.custom_fields ?? {}),
      status: 'new',
      // ticket_channel is a Postgres enum: portal | email | whatsapp | phone
      // | api | ai_agent | web_widget. Anything else fails the insert, so we
      // leave it unset when the caller named no channel and let the column
      // default ('portal') stand — which is what the UI path did before.
      ...(fields.channel ? { channel: fields.channel } : {}),
      created_by: actor.userId,
    })
    .select()
    .single();

  if (error) return fail(error.message, 'internal');
  if (!ticket) return fail('Ticket insert returned no row', 'internal');

  // Creator auto-follow: staff keep receiving updates even after the ticket
  // is reassigned to the client's default owner.
  // Captured before the closure: narrowing from the `if` does not survive
  // into a deferred callback.
  const creatorAgentId = actor.agentId;
  if (autoFollowCreator && creatorAgentId) {
    runAfterResponse(() => addFollower(client, {
      tenantId: actor.tenantId,
      ticketId: ticket.id,
      agentId: creatorAgentId,
      reason: 'creator',
    }));
  }

  if (notify) {
    runAfterResponse(() => notifyTicketCreated({
      tenantId: actor.tenantId,
      ticketNumber: ticket.ticket_number,
      ticketId: ticket.id,
      title: ticket.title,
      type: ticket.type,
      urgency: ticket.urgency,
      status: ticket.status,
      requesterEmail: ticket.requester_email ?? undefined,
      agentUserId: actor.userId ?? undefined,
      agentEmail: actor.email ?? undefined,
    }));
  }

  // Default-owner assignment (per-client override first, then the tenant
  // default). Skipped when the caller already named an assignee.
  if (autoAssign && !fields.assigned_agent_id) {
    runAfterResponse(() => assignAndNotify(client, {
      ticketId: ticket.id,
      tenantId: actor.tenantId,
      organizationId: ticket.organization_id ?? null,
    }));
  }

  return ok(ticket as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// changeTicketStatus
// ---------------------------------------------------------------------------

export interface ChangeStatusOptions {
  /**
   * Why the SLA clock should pause, for the statuses that require it
   * (detenido / backlog / esperando_ventana).
   *
   * Omitting it is not an error: the trigger records 'priorizacion_interna',
   * which does NOT pause the clock. That fail-closed default is intentional —
   * an unjustified pause must not hand us a deadline we cannot defend.
   */
  pauseReason?: SlaPauseReason | null;
  /** Emit status-change / resolution notifications. Default: true. */
  notify?: boolean;
  /** Queue the NPS survey on terminal transitions. Default: true. */
  queueNps?: boolean;
}

export async function changeTicketStatus(
  ctx: DomainContext,
  ticketId: string,
  newStatus: TicketStatus,
  options: ChangeStatusOptions = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;
  const { pauseReason = null, notify = true, queueNps = true } = options;

  if (
    isClientActor(actor) &&
    !(CLIENT_ALLOWED_STATUSES as readonly string[]).includes(newStatus)
  ) {
    return fail('Not allowed for client users', 'forbidden');
  }

  let query = client
    .from('tickets')
    .select(
      'id, tenant_id, organization_id, status, first_response_at, custom_fields, reopened_count',
    )
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);

  const orgScope = resolveOrgScope(actor);
  if (orgScope) query = query.in('organization_id', orgScope);

  const { data: existing } = await query.maybeSingle();
  if (!existing) return fail('Ticket not found', 'not_found');

  const allowed = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return fail(
      `Invalid status transition from '${existing.status}' to '${newStatus}'`,
      'invalid_transition',
    );
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { status: newStatus, updated_at: now };

  if (newStatus === 'resolved') updatePayload.resolved_at = now;
  if (newStatus === 'closed') updatePayload.closed_at = now;

  // Reopen tracking: count every transition INTO 'reopened' so metrics can
  // surface re-aperturas as a quality KPI.
  if (newStatus === 'reopened' && existing.status !== 'reopened') {
    updatePayload.last_reopened_at = now;
    updatePayload.reopened_count =
      ((existing as { reopened_count?: number | null }).reopened_count ?? 0) + 1;
    // Clear terminal timestamps so SLA/metrics treat the ticket as active
    // again rather than a stale closed one.
    updatePayload.closed_at = null;
    updatePayload.resolved_at = null;
  }

  // See COMMUNICATES_TO_CLIENT above for why only these two stamp a response.
  if (!existing.first_response_at && COMMUNICATES_TO_CLIENT.includes(newStatus)) {
    updatePayload.first_response_at = now;
  }

  // Track entry/exit of the Testing stage so the daily "Nuevos Testing"
  // metric can tell fresh transitions from the standing snapshot.
  const nextCustom: Record<string, unknown> = {
    ...((existing.custom_fields as Record<string, unknown> | null) ?? {}),
  };
  let customChanged = false;
  if (newStatus === 'testing' && existing.status !== 'testing') {
    nextCustom.testing_entered_at = now;
    delete nextCustom.testing_result;
    customChanged = true;
  }
  if (existing.status === 'testing' && newStatus !== 'testing') {
    delete nextCustom.testing_entered_at;
    delete nextCustom.testing_result;
    customChanged = true;
  }
  if (customChanged) updatePayload.custom_fields = nextCustom;

  // Hand the pause reason to the log_ticket_status_change trigger, which
  // reads it from a transaction-local setting. Going through the DB rather
  // than an argument means the reason is captured no matter which path
  // caused the change — UI, cron, direct SQL or MCP (00048/00049).
  if (
    REASON_REQUIRED_STATUSES.includes(
      newStatus as (typeof REASON_REQUIRED_STATUSES)[number],
    )
  ) {
    const { error: tagError } = await client.rpc('set_pause_reason', {
      p_reason: pauseReason ?? NON_PAUSING_REASON,
    });
    // A failed tag is not fatal: the trigger falls back to a non-pausing
    // reason. Erring against us is the safe direction.
    if (tagError) {
      console.warn('[domain.changeTicketStatus] pause reason not tagged:', tagError.message);
    }
  }

  const { data: ticket, error } = await client
    .from('tickets')
    .update(updatePayload)
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select()
    .single();

  if (error) return fail(error.message, 'internal');
  if (!ticket) return fail('Ticket update returned no row', 'internal');

  if (notify) {
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

    const notifyFn =
      newStatus === 'resolved' ? notifyTicketResolved : notifyTicketStatusChanged;
    runAfterResponse(() => notifyFn({
      tenantId: actor.tenantId,
      ticketNumber: ticket.ticket_number,
      ticketId: ticket.id,
      title: ticket.title,
      type: ticket.type,
      urgency: ticket.urgency,
      status: newStatus,
      requesterEmail: ticket.requester_email ?? undefined,
      agentUserId: assigneeUserId,
      agentEmail: assigneeEmail,
      assignedAgentId: ticket.assigned_agent_id ?? undefined,
    }));
  }

  // Queue the NPS survey on terminal transitions. The csat-dispatcher cron
  // sends the email a few minutes after this row appears.
  // Captured before the closure: narrowing from the `if` does not survive
  // into deferred work, and there is nobody to survey without an address.
  const surveyRecipient = ticket.requester_email;
  if (
    queueNps &&
    (newStatus === 'resolved' || newStatus === 'closed') &&
    existing.status !== newStatus &&
    surveyRecipient
  ) {
    runAfterResponse(() => queueNpsForTicket({
      tenantId: actor.tenantId,
      ticketId: ticket.id,
      recipientEmail: surveyRecipient,
      organizationId: ticket.organization_id,
      agentId: ticket.assigned_agent_id,
    }));
  }

  return ok(ticket as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// addFollowup
// ---------------------------------------------------------------------------

export interface AddFollowupFields {
  content: string;
  content_html?: string | null;
  is_private?: boolean;
  mentioned_agent_ids?: string[];
  mentioned_contact_ids?: string[];
  email_message_id?: string | null;
}

/**
 * Adds a comment. `ticket_followups.author_id` is a NOT NULL FK to
 * auth.users, so an actor without a resolved user id fails fast with a
 * typed error rather than a Postgres 23502 surfacing as an opaque 500 —
 * which is precisely how tickets_add_comment failed silently until now.
 */
export async function addFollowup(
  ctx: DomainContext,
  ticketId: string,
  fields: AddFollowupFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const resolved = requireUserId(actor);
  // Narrow on the value, not the error: TypeScript discriminates this union
  // by `userId`, so checking `error` leaves userId as `string | null` and the
  // NOT NULL author column rejects it at the type level.
  if (!resolved.ok) return fail(resolved.error, 'forbidden');

  let check = client
    .from('tickets')
    .select('id, organization_id, first_response_at')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);

  const orgScope = resolveOrgScope(actor);
  if (orgScope) check = check.in('organization_id', orgScope);

  const { data: ticket } = await check.maybeSingle();
  if (!ticket) return fail('Ticket not found', 'not_found');

  const isPrivate = fields.is_private ?? false;

  const { data: followup, error } = await client
    .from('ticket_followups')
    .insert({
      tenant_id: actor.tenantId,
      ticket_id: ticketId,
      content: fields.content,
      content_html: fields.content_html ?? null,
      is_private: isPrivate,
      author_id: resolved.userId,
      author_type: isClientActor(actor) ? 'contact' : 'agent',
      mentioned_agent_ids: fields.mentioned_agent_ids ?? [],
      mentioned_contact_ids: fields.mentioned_contact_ids ?? [],
      email_message_id: fields.email_message_id ?? null,
    })
    .select()
    .single();

  if (error) return fail(error.message, 'internal');

  // A public reply is the authoritative first response: it is the one event
  // that proves the client was actually told something (see cl. 4 note above).
  if (!isPrivate && !ticket.first_response_at) {
    await client
      .from('tickets')
      .update({ first_response_at: new Date().toISOString() })
      .eq('id', ticketId)
      .eq('tenant_id', actor.tenantId);
  }

  return ok(followup as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// assignTicket
// ---------------------------------------------------------------------------

export async function assignTicket(
  ctx: DomainContext,
  ticketId: string,
  assignment: { agentId?: string | null; groupId?: string | null },
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (isClientActor(actor)) {
    return fail('Not allowed for client users', 'forbidden');
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (assignment.agentId !== undefined) payload.assigned_agent_id = assignment.agentId;
  if (assignment.groupId !== undefined) payload.assigned_group_id = assignment.groupId;

  if (Object.keys(payload).length === 1) {
    return fail('Provide agentId and/or groupId', 'invalid_input');
  }

  let lookup = client
    .from('tickets')
    .select('id, status, organization_id')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);

  const orgScope = resolveOrgScope(actor);
  if (orgScope) lookup = lookup.in('organization_id', orgScope);

  const { data: existing } = await lookup.maybeSingle();
  if (!existing) return fail('Ticket not found', 'not_found');

  // Promote out of the intake state only. A ticket already in progress keeps
  // its status so a reassignment never resets real work — the MCP tool used
  // to force 'assigned' unconditionally, silently rewinding live tickets.
  if (existing.status === 'new' && assignment.agentId) {
    payload.status = 'assigned';
  }

  const { data: ticket, error } = await client
    .from('tickets')
    .update(payload)
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select()
    .single();
  if (error) return fail(error.message, 'internal');
  if (!ticket) return fail('Ticket not found', 'not_found');

  // Keep the new assignee in the follower list so they receive updates.
  const assigneeId = assignment.agentId;
  if (assigneeId) {
    runAfterResponse(() => addFollower(client, {
      tenantId: actor.tenantId,
      ticketId,
      agentId: assigneeId,
      reason: 'assignment',
    }));
  }

  return ok(ticket as Record<string, unknown>);
}
