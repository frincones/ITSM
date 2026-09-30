import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { resolveDefaultAssignee } from '~/lib/services/assignment.service';
import { notifyTicketAssigned } from '~/lib/services/notify.service';

/**
 * Cron Job — Default-Owner Auto-Assign
 *
 * Safety net for unassigned tickets in an open state. Real-time assignment
 * happens in createTicket and the inbound-email service; this catches
 * anything those paths missed (a failed fire-and-forget, a row inserted by
 * import or direct SQL).
 *
 * Replaces the previous round-robin rotation, which spread tickets across
 * every active agent regardless of which client they belonged to. Each
 * client has a dedicated owner instead (organizations.default_agent_id), so
 * a Podenza ticket never lands on the person who handles Prosuministros —
 * see assignment.service.ts for the resolution order.
 *
 * A client with no owner configured leaves its tickets unassigned, which is
 * visible in the queue. That is intentional: guessing an owner is worse.
 *
 * Deliberately does NOT touch status or first_response_at for tickets that
 * are already past 'new'. Being assigned is not a response to the client.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const TERMINAL_STATUSES = ['closed', 'cancelled', 'resolved'];
  const { data: unassigned, error: unassignedError } = await svc
    .from('tickets')
    .select(
      'id, tenant_id, organization_id, ticket_number, title, type, urgency, status, requester_email',
    )
    .is('assigned_agent_id', null)
    .is('deleted_at', null)
    .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
    .order('created_at', { ascending: true });

  if (unassignedError) {
    return NextResponse.json(
      { error: unassignedError.message },
      { status: 500 },
    );
  }

  if (!unassigned || unassigned.length === 0) {
    return NextResponse.json({
      ok: true,
      assigned: 0,
      message: 'No unassigned tickets',
    });
  }

  let assignedCount = 0;
  const assignmentLog: Array<{ ticket: string; agent: string }> = [];
  const unresolved: string[] = [];

  // Cache the resolved assignee per (tenant, organization) — the default is
  // stable within a run, so this keeps the query count flat regardless of how
  // many tickets the batch picks up.
  const cache = new Map<
    string,
    Awaited<ReturnType<typeof resolveDefaultAssignee>>
  >();

  for (const t of unassigned) {
    const cacheKey = `${t.tenant_id}:${t.organization_id ?? '-'}`;
    if (!cache.has(cacheKey)) {
      cache.set(
        cacheKey,
        await resolveDefaultAssignee(svc, t.tenant_id, t.organization_id),
      );
    }
    const assignee = cache.get(cacheKey) ?? null;

    // No default configured, or it points at an inactive agent. Leave the
    // ticket unassigned — that is visible in the queue, whereas silently
    // handing it to an arbitrary agent is not.
    if (!assignee) {
      unresolved.push(t.ticket_number);
      continue;
    }

    const { error: updateError } = await svc
      .from('tickets')
      .update({
        assigned_agent_id: assignee.agentId,
        // Only flip to "assigned" when the ticket is still fresh.
        ...(t.status === 'new' ? { status: 'assigned' } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', t.id);

    if (updateError) {
      console.error(
        '[auto-assign] failed to assign',
        t.ticket_number,
        updateError.message,
      );
      continue;
    }

    assignedCount++;
    assignmentLog.push({ ticket: t.ticket_number, agent: assignee.name });

    notifyTicketAssigned({
      tenantId: t.tenant_id,
      ticketNumber: t.ticket_number,
      ticketId: t.id,
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

  if (unresolved.length > 0) {
    console.warn(
      '[auto-assign] no default assignee resolved for',
      unresolved.length,
      'ticket(s):',
      unresolved.join(', '),
    );
  }

  return NextResponse.json({
    ok: true,
    assigned: assignedCount,
    assignments: assignmentLog,
    unresolved,
  });
}
