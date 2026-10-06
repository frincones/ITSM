// ---------------------------------------------------------------------------
// Ticket Assignment — default assignee resolution
// ---------------------------------------------------------------------------
// Replaces round-robin rotation with a deterministic default assignee.
//
// Round-robin had three separate implementations that all had to agree
// (createTicket, the inbound-email service, and the auto-assign cron), each
// mutating a shared cursor in tenants.settings.round_robin_last_agent_id.
// Three copies of a stateful rotation is three chances to drift. This is one
// implementation with no shared mutable state.
//
// Ownership is per CLIENT: each organization has its own dedicated owner
// (Podenza → Emma Castillo, Prosuministros → Freddy Rincones), seeded in
// 00049 onto organizations.default_agent_id.
//
// Resolution order:
//   1. organizations.default_agent_id  — the client's owner (the column was
//      added in 00034 for exactly this: "an optional specific agent")
//   2. tenants.settings.default_assignee_agent_id — tenant-wide fallback,
//      which in practice only catches tickets created with no client
//      selected (the create form allows that). Without it such a ticket is
//      orphaned: no owner, no notification, no SLA.
//   3. null — leave unassigned rather than guess
//
// Defaults live in data, not in code. Hardcoding a name or email would break
// the day that person changes address, goes on leave, or hands over the
// queue — and it would break silently, leaving tickets unassigned while the
// SLA clock runs.
//
// Pure business logic. No 'use server' — used by Server Actions & cron jobs.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedAssignee {
  agentId: string;
  userId: string | null;
  email: string;
  name: string;
  source: 'organization_default' | 'tenant_default';
}

/** Service accounts must never pick up tickets. */
const EXCLUDED_EMAILS = ['admin@novadesk.com'];

async function loadAgent(
  client: SupabaseClient,
  tenantId: string,
  agentId: string,
): Promise<Omit<ResolvedAssignee, 'source'> | null> {
  const { data } = await client
    .from('agents')
    .select('id, user_id, email, name, role, is_active')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!data) return null;

  const agent = data as unknown as {
    id: string;
    user_id: string | null;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
  };

  // A default pointing at a deactivated or ineligible agent is a
  // misconfiguration. Returning null lets the caller fall through or leave
  // the ticket unassigned, which is visible — silently assigning to someone
  // who no longer works the queue is not.
  if (!agent.is_active) return null;
  if (!['admin', 'supervisor', 'agent'].includes(agent.role)) return null;
  if (EXCLUDED_EMAILS.includes(agent.email.toLowerCase())) return null;

  return {
    agentId: agent.id,
    userId: agent.user_id,
    email: agent.email,
    name: agent.name,
  };
}

/**
 * Resolves who should own a new ticket.
 *
 * Returns null when nothing is configured — callers must leave the ticket
 * unassigned in that case, never fall back to picking someone.
 */
export async function resolveDefaultAssignee(
  client: SupabaseClient,
  tenantId: string,
  organizationId?: string | null,
): Promise<ResolvedAssignee | null> {
  // 1. Per-client override.
  if (organizationId) {
    const { data: org } = await client
      .from('organizations')
      .select('default_agent_id')
      .eq('id', organizationId)
      .maybeSingle();

    const orgDefault = (org as { default_agent_id: string | null } | null)
      ?.default_agent_id;

    if (orgDefault) {
      const agent = await loadAgent(client, tenantId, orgDefault);
      if (agent) return { ...agent, source: 'organization_default' };
    }
  }

  // 2. Tenant-wide default.
  const { data: tenant } = await client
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();

  const settings =
    ((tenant as { settings: Record<string, unknown> } | null)?.settings as
      | Record<string, unknown>
      | null) ?? {};

  const tenantDefault =
    typeof settings.default_assignee_agent_id === 'string'
      ? settings.default_assignee_agent_id
      : null;

  if (tenantDefault) {
    const agent = await loadAgent(client, tenantId, tenantDefault);
    if (agent) return { ...agent, source: 'tenant_default' };
  }

  // 3. Nothing configured.
  return null;
}

/**
 * Assigns a freshly-created ticket to the default assignee.
 *
 * Moves the ticket to 'assigned' only when it is still 'new', matching the
 * previous behaviour. Deliberately does NOT touch first_response_at: being
 * assigned is not a response to the client, and the contract defines the
 * response SLA as acknowledgement, classification, diagnosis and
 * communication of the plan (cl. 4) — all of which require a human.
 */
export async function assignToDefault(
  client: SupabaseClient,
  ticketId: string,
  tenantId: string,
  organizationId?: string | null,
): Promise<ResolvedAssignee | null> {
  const assignee = await resolveDefaultAssignee(
    client,
    tenantId,
    organizationId,
  );
  if (!assignee) return null;

  const { error } = await client
    .from('tickets')
    .update({
      assigned_agent_id: assignee.agentId,
      status: 'assigned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
    .eq('status', 'new');

  if (error) return null;
  return assignee;
}

/**
 * Assigns a new ticket to the default owner, subscribes them as a follower
 * and notifies them. The full side-effect chain the round-robin helpers used
 * to duplicate in three places.
 */
export async function assignAndNotify(
  client: SupabaseClient,
  params: {
    ticketId: string;
    tenantId: string;
    organizationId?: string | null;
  },
): Promise<ResolvedAssignee | null> {
  const { ticketId, tenantId, organizationId } = params;

  const assignee = await assignToDefault(
    client,
    ticketId,
    tenantId,
    organizationId,
  );
  if (!assignee) return null;

  const { addFollower } = await import('~/lib/services/ticket-followers.service');
  await addFollower(client, {
    tenantId,
    ticketId,
    agentId: assignee.agentId,
    reason: 'assignment',
  }).catch(() => {});

  const { data: ticket } = await client
    .from('tickets')
    .select('ticket_number, title, type, urgency, status')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticket) {
    const t = ticket as unknown as {
      ticket_number: string;
      title: string;
      type: string;
      urgency: string;
      status: string;
    };
    const { notifyTicketAssigned } = await import(
      '~/lib/services/notify.service'
    );
    await notifyTicketAssigned({
      tenantId,
      ticketNumber: t.ticket_number,
      ticketId,
      title: t.title,
      type: t.type,
      urgency: t.urgency,
      status: t.status,
      assignedAgentId: assignee.agentId,
      agentUserId: assignee.userId ?? undefined,
      agentEmail: assignee.email,
      agentName: assignee.name,
    }).catch(() => {});
  }

  return assignee;
}
