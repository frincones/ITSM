import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { triggerNotification } from '~/lib/services/notification.service';

// ---------------------------------------------------------------------------
// GET /api/cron/sla-check
// ---------------------------------------------------------------------------

/**
 * Cron Job — SLA Monitoring
 *
 * Schedule: every 15 minutes inside the contract window, Mon-Fri 08:00-16:59
 * America/Bogota (see migration 00054). Outside those hours the SLA clock is
 * not running, so there is nothing a run could discover.
 *
 * Flow:
 *   1. Ask the database for tickets breaching or approaching their response
 *      deadline (sla_tickets_at_risk).
 *   2. Mark newly breached tickets and notify.
 *   3. Send a warning once per ticket per window for those approaching.
 *
 * ── What changed, and why it matters ────────────────────────────────────────
 *
 * This endpoint previously did nothing at all. It was never scheduled in
 * pg_cron, and its query filtered on `sla_due_date IS NOT NULL` against a
 * column that was NULL on every row because nothing ever computed it.
 *
 * Three correctness fixes came with wiring it up:
 *
 *   · Scope. It selected every open ticket with a due date. The contractual
 *     SLA is a RESPONSE SLA, so what matters is first_response_at, not status:
 *     an answered ticket is settled even while it stays open for weeks, and an
 *     unanswered one is at risk regardless of status. It now also requires
 *     sla_applies, so a client without a support contract can never appear.
 *
 *   · Pause credit. The contract suspends the clock while a ticket waits on
 *     the client (cl. 4). The deadline is now the stamped one plus the paused
 *     BUSINESS minutes — see migration 00054 for why business rather than wall
 *     minutes.
 *
 *   · Warning threshold. checkSLABreach() warned a flat 30 minutes out, which
 *     is most of the runway on a 4h P0 target and meaningless on a 48h P2 one.
 *     It is now a fraction of the target (75% elapsed).
 *
 * The configurable-escalation branch was also removed: it queried
 * `sla_escalation_levels`, a table that does not exist in any migration (the
 * real one is `sla_levels`, part of the unused pre-contract SLA model). That
 * query always errored and always fell through to the default notification, so
 * configurable escalation has never actually worked. Rather than leave a call
 * to a phantom table in place, escalation goes through triggerNotification —
 * and if per-level actions are wanted later they should hang off
 * organization_support_contracts, which is the model that reflects the
 * contract.
 */

interface AtRiskTicket {
  ticket_id: string;
  tenant_id: string;
  organization_id: string | null;
  ticket_number: string;
  title: string;
  urgency: string;
  status: string;
  assigned_agent_id: string | null;
  requester_email: string | null;
  already_breached: boolean;
  target_minutes: number | null;
  paused_minutes: number;
  effective_due_at: string;
  risk: 'breached' | 'warning';
}

/** Don't re-warn the same ticket within this window. */
const WARNING_COOLDOWN_MINUTES = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = getSupabaseServerClient();

    const { data, error } = await client.rpc('sla_tickets_at_risk', {
      p_warn_fraction: 0.75,
    });

    if (error) {
      console.error('[cron/sla-check] rpc error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tickets = (data ?? []) as unknown as AtRiskTicket[];

    if (tickets.length === 0) {
      return NextResponse.json({
        ok: true,
        checked: 0,
        breached: 0,
        warnings: 0,
      });
    }

    let breachedCount = 0;
    let warningCount = 0;

    for (const ticket of tickets) {
      const payload = {
        ticket: ticket as unknown as Record<string, unknown>,
        metadata: {
          effective_due_at: ticket.effective_due_at,
          paused_minutes: ticket.paused_minutes,
          target_minutes: ticket.target_minutes,
        },
      };

      if (ticket.risk === 'breached') {
        // Already-flagged breaches need no second notification — the flag is
        // what makes this idempotent across runs.
        if (ticket.already_breached) continue;

        breachedCount++;

        await client
          .from('tickets')
          .update({
            sla_breached: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ticket.ticket_id)
          .eq('tenant_id', ticket.tenant_id);

        await triggerNotification(
          client,
          ticket.tenant_id,
          'sla.breached',
          payload,
        );

        continue;
      }

      // ----- WARNING -----
      const since = new Date(
        Date.now() - WARNING_COOLDOWN_MINUTES * 60_000,
      ).toISOString();

      const { data: recent } = await client
        .from('notification_queue')
        .select('id')
        .eq('tenant_id', ticket.tenant_id)
        .like('body', `%${ticket.ticket_id}%`)
        .gte('created_at', since)
        .limit(1)
        .maybeSingle();

      if (recent) continue;

      warningCount++;
      await triggerNotification(
        client,
        ticket.tenant_id,
        'sla.warning',
        payload,
      );
    }

    return NextResponse.json({
      ok: true,
      checked: tickets.length,
      breached: breachedCount,
      warnings: warningCount,
    });
  } catch (err) {
    console.error('[cron/sla-check] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
