import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { notifyTicketAssigned } from '~/lib/services/notify.service';

/**
 * Vercel Cron Job — AI Round-Robin Auto-Assign
 *
 * Schedule: every 5 minutes (`*\/5 * * * *`) — configured in vercel.json.
 *
 * Finds every unassigned ticket (non-terminal status) across tenants and
 * assigns it to one of the TDX staff agents in strict round-robin order,
 * deterministically distributing load between them.
 *
 * Eligible assignees per tenant = agents.role IN (admin, supervisor, agent)
 * AND is_active. The round-robin uses the current assignment counts
 * (excluding closed/cancelled/resolved tickets) as the "pointer", so the
 * next ticket goes to whoever has the fewest open tickets — and on a tie,
 * the agent that comes first alphabetically. That guarantees a balanced
 * distribution without a separate counter in the DB.
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

  // 1. Every tenant that has at least one unassigned ticket in an open state.
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
    return NextResponse.json({ ok: true, assigned: 0, message: 'No unassigned tickets' });
  }

  // Group by tenant so agents are scoped correctly.
  const byTenant = new Map<string, typeof unassigned>();
  for (const t of unassigned) {
    const list = byTenant.get(t.tenant_id) ?? [];
    list.push(t);
    byTenant.set(t.tenant_id, list);
  }

  let assignedCount = 0;
  const assignmentLog: Array<{ ticket: string; agent: string }> = [];

  for (const [tenantId, tickets] of byTenant.entries()) {
    // 2. Find eligible TDX staff for this tenant. System/service accounts
    // like Admin NovaDesk should not pick up tickets, so they are excluded
    // by email. Any other admin/supervisor/agent on an active account is
    // fair game.
    const EXCLUDED_EMAILS = ['admin@novadesk.com'];
    const { data: allAgents } = await svc
      .from('agents')
      .select('id, user_id, email, name, role')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .in('role', ['admin', 'supervisor', 'agent'])
      .order('name', { ascending: true });

    const agents = (allAgents ?? []).filter(
      (a) => !EXCLUDED_EMAILS.includes(a.email.toLowerCase()),
    );
    if (agents.length === 0) continue;

    // 3. Compute current open-ticket count per agent.
    const counts = new Map<string, number>();
    for (const a of agents) counts.set(a.id, 0);
    const { data: openCounts } = await svc
      .from('tickets')
      .select('assigned_agent_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
      .not('assigned_agent_id', 'is', null);
    for (const row of openCounts ?? []) {
      const aid = (row as { assigned_agent_id: string }).assigned_agent_id;
      if (counts.has(aid)) counts.set(aid, (counts.get(aid) ?? 0) + 1);
    }

    // 4. Assign each ticket to the agent with the smallest running count.
    for (const t of tickets) {
      // Pick the agent with fewest open tickets (tie-break: alphabetical).
      let best: { id: string; user_id: string | null; email: string; name: string } | null =
        null;
      let bestCount = Infinity;
      for (const a of agents) {
        const c = counts.get(a.id) ?? 0;
        if (c < bestCount) {
          best = a;
          bestCount = c;
        }
      }
      if (!best) continue;

      const { error: updateError } = await svc
        .from('tickets')
        .update({
          assigned_agent_id: best.id,
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

      counts.set(best.id, bestCount + 1);
      assignedCount++;
      assignmentLog.push({ ticket: t.ticket_number, agent: best.name });

      // Fire-and-forget notify the newly assigned agent.
      notifyTicketAssigned({
        tenantId,
        ticketNumber: t.ticket_number,
        ticketId: t.id,
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

  return NextResponse.json({
    ok: true,
    assigned: assignedCount,
    assignments: assignmentLog,
  });
}
