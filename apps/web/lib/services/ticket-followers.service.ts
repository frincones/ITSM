/**
 * Ticket followers (Zendesk/Freshdesk-style watchers).
 *
 * Followers receive the same in-app + email notifications as the current
 * assignee on status changes, new comments, and reassignments. They're
 * auto-added on key events (creation, assignment, commenting) and can be
 * added/removed manually from the ticket detail UI.
 *
 * Helpers here always use the service-role client so we never fail on RLS
 * (the caller is responsible for authorizing the action).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type FollowerReason =
  | 'creator'
  | 'assignment'
  | 'reassignment'
  | 'followup'
  | 'mention'
  | 'manual'
  | 'view';

/**
 * Idempotent add. If the (ticket, agent) pair already exists, no-op (we
 * don't update the added_at/added_reason on duplicate — the first reason
 * wins, which keeps the history honest).
 */
export async function addFollower(
  svc: SupabaseClient,
  params: {
    tenantId: string;
    ticketId: string;
    agentId: string;
    reason: FollowerReason;
    isAuto?: boolean;
  },
): Promise<void> {
  const { tenantId, ticketId, agentId, reason, isAuto = true } = params;
  await svc
    .from('ticket_followers')
    .upsert(
      {
        tenant_id: tenantId,
        ticket_id: ticketId,
        agent_id: agentId,
        added_reason: reason,
        is_auto: isAuto,
      },
      { onConflict: 'ticket_id,agent_id', ignoreDuplicates: true },
    );
}

/**
 * Bulk version for assignment hooks — the common pattern is "add both old
 * and new assignee in one go". Skips null/undefined agent ids silently.
 */
export async function addFollowersBulk(
  svc: SupabaseClient,
  params: {
    tenantId: string;
    ticketId: string;
    agentIds: Array<string | null | undefined>;
    reason: FollowerReason;
    isAuto?: boolean;
  },
): Promise<void> {
  const { tenantId, ticketId, agentIds, reason, isAuto = true } = params;
  const rows = agentIds
    .filter((id): id is string => Boolean(id))
    .map((agentId) => ({
      tenant_id: tenantId,
      ticket_id: ticketId,
      agent_id: agentId,
      added_reason: reason,
      is_auto: isAuto,
    }));
  if (!rows.length) return;
  await svc
    .from('ticket_followers')
    .upsert(rows, { onConflict: 'ticket_id,agent_id', ignoreDuplicates: true });
}

export async function removeFollower(
  svc: SupabaseClient,
  params: { ticketId: string; agentId: string },
): Promise<void> {
  await svc
    .from('ticket_followers')
    .delete()
    .eq('ticket_id', params.ticketId)
    .eq('agent_id', params.agentId);
}

export interface TicketFollower {
  agent_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  user_id: string | null;
  added_at: string;
  added_reason: string | null;
  is_auto: boolean;
}

/**
 * Returns the current follower list for a ticket, joined with agent info.
 * Used by the UI panel and by the notification fan-out.
 */
export async function listFollowers(
  svc: SupabaseClient,
  ticketId: string,
): Promise<TicketFollower[]> {
  const { data } = await svc
    .from('ticket_followers')
    .select(
      `agent_id, added_at, added_reason, is_auto,
       agent:agents(id, name, email, avatar_url, user_id)`,
    )
    .eq('ticket_id', ticketId)
    .order('added_at', { ascending: true });

  return ((data ?? []) as unknown as Array<{
    agent_id: string;
    added_at: string;
    added_reason: string | null;
    is_auto: boolean;
    agent: {
      id: string;
      name: string | null;
      email: string | null;
      avatar_url: string | null;
      user_id: string | null;
    } | null;
  }>).map((r) => ({
    agent_id: r.agent_id,
    name: r.agent?.name ?? null,
    email: r.agent?.email ?? null,
    avatar_url: r.agent?.avatar_url ?? null,
    user_id: r.agent?.user_id ?? null,
    added_at: r.added_at,
    added_reason: r.added_reason,
    is_auto: r.is_auto,
  }));
}

/**
 * Returns the set of auth user_ids and emails we should fan notifications
 * out to for a given ticket — i.e., the current assignee PLUS every
 * follower. Dedups by user_id so the same person never gets two emails
 * for the same event.
 */
export async function getNotificationRecipients(
  svc: SupabaseClient,
  params: {
    ticketId: string;
    assignedAgentId?: string | null;
    /**
     * When true, excludes the acting user from the recipient list — e.g.,
     * if Freddy posts a comment we don't email Freddy his own comment.
     */
    excludeUserId?: string | null;
  },
): Promise<Array<{ userId: string | null; email: string; name: string | null; agentId: string }>> {
  const followers = await listFollowers(svc, params.ticketId);

  // Make sure the current assignee is in the list even if no follower row
  // exists yet — that way the notification model is always correct even
  // before the auto-follow hooks have run on a given ticket.
  const rows = new Map<string, (typeof followers)[number]>();
  for (const f of followers) rows.set(f.agent_id, f);

  if (params.assignedAgentId && !rows.has(params.assignedAgentId)) {
    const { data: assignedAgent } = await svc
      .from('agents')
      .select('id, name, email, avatar_url, user_id')
      .eq('id', params.assignedAgentId)
      .maybeSingle();
    if (assignedAgent) {
      const a = assignedAgent as {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
        user_id: string | null;
      };
      rows.set(a.id, {
        agent_id: a.id,
        name: a.name,
        email: a.email,
        avatar_url: a.avatar_url,
        user_id: a.user_id,
        added_at: '',
        added_reason: 'assignee',
        is_auto: true,
      });
    }
  }

  const result: Array<{ userId: string | null; email: string; name: string | null; agentId: string }> = [];
  const seenEmails = new Set<string>();
  for (const r of rows.values()) {
    if (!r.email) continue;
    if (params.excludeUserId && r.user_id === params.excludeUserId) continue;
    const key = r.email.toLowerCase();
    if (seenEmails.has(key)) continue;
    seenEmails.add(key);
    result.push({ userId: r.user_id, email: r.email, name: r.name, agentId: r.agent_id });
  }
  return result;
}
