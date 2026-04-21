import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { notifyTicketAssigned } from '~/lib/services/notify.service';

/**
 * Vercel Cron Job — Round-Robin Auto-Assign
 *
 * Finds every unassigned ticket (non-terminal status) across tenants and
 * assigns it to one of the TDX staff agents in strict rotation order.
 *
 * Rotation strategy: pick whichever eligible agent was assigned longest
 * ago (or has never been assigned). After assigning, bump that agent's
 * "last assigned" timestamp in-memory so the next iteration rotates to
 * a different agent. This intentionally ignores historical open-ticket
 * counts — so a bulk import concentrated on one person doesn't starve
 * the other agents.
 *
 * Eligible assignees per tenant = agents.role IN (admin, supervisor, agent)
 * AND is_active, excluding the admin@novadesk.com service account.
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

    // 3. Load the tenant's rotation cursor (shared with createTicket). We
    // advance it locally per assignment in this batch, then persist the
    // final value once at the end. Pure rotation — no dependency on the
    // historical open-ticket count.
    const { data: tenantRow } = await svc
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();

    const settings =
      ((tenantRow as { settings: Record<string, unknown> } | null)?.settings as
        | Record<string, unknown>
        | null) ?? {};
    let cursor =
      typeof settings.round_robin_last_agent_id === 'string'
        ? settings.round_robin_last_agent_id
        : null;

    // 4. Assign each ticket, rotating through agents in alphabetical order.
    for (const t of tickets) {
      const lastIdx = agents.findIndex((a) => a.id === cursor);
      const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % agents.length;
      const best = agents[nextIdx];
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

      cursor = best.id;
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

    // Persist the final cursor for this tenant so the next batch (and any
    // ticket created via createTicket between runs) picks up where we left.
    if (cursor && cursor !== settings.round_robin_last_agent_id) {
      await svc
        .from('tenants')
        .update({ settings: { ...settings, round_robin_last_agent_id: cursor } })
        .eq('id', tenantId);
    }
  }

  return NextResponse.json({
    ok: true,
    assigned: assignedCount,
    assignments: assignmentLog,
  });
}
