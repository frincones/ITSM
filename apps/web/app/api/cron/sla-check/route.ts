import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { checkSLABreach } from '~/lib/services/sla.service';
import { triggerNotification } from '~/lib/services/notification.service';

// ---------------------------------------------------------------------------
// GET /api/cron/sla-check
// ---------------------------------------------------------------------------

/**
 * Vercel Cron Job — SLA Monitoring
 *
 * Schedule: every minute (`* * * * *`)
 *
 * Flow:
 *   1. Find all open tickets with an SLA due date.
 *   2. For each ticket, check if it is breached or approaching breach.
 *   3. For breached tickets: mark `sla_breached = true`, trigger escalation.
 *   4. For warning tickets: send warning notifications.
 *   5. Execute SLA level actions (notify, escalate, reassign).
 */
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  try {
    const client = getSupabaseServerClient();

    // Fetch all open tickets with SLA due dates that are not yet breached
    const { data: tickets, error: fetchError } = await client
      .from('tickets')
      .select(
        'id, tenant_id, status, urgency, priority, sla_due_date, sla_breached, created_at, first_response_at, assigned_agent_id, assigned_group_id, title, requester_email',
      )
      .is('deleted_at', null)
      .not('sla_due_date', 'is', null)
      .not('status', 'in', '("closed","cancelled","resolved")')
      .order('sla_due_date', { ascending: true })
      .limit(500);

    if (fetchError) {
      console.error('[cron/sla-check] Fetch error:', fetchError.message);
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 },
      );
    }

    if (!tickets || tickets.length === 0) {
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
      const slaStatus = checkSLABreach({
        sla_due_date: ticket.sla_due_date,
        sla_breached: ticket.sla_breached,
        status: ticket.status,
      });

      // ----- BREACHED -----
      if (slaStatus.breached && !ticket.sla_breached) {
        breachedCount++;

        // Mark ticket as breached
        await client
          .from('tickets')
          .update({
            sla_breached: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ticket.id)
          .eq('tenant_id', ticket.tenant_id);

        // Load SLA escalation levels for this ticket's priority/urgency
        const { data: slaLevels } = await client
          .from('sla_escalation_levels')
          .select('*')
          .eq('tenant_id', ticket.tenant_id)
          .eq('trigger_type', 'breach')
          .order('level', { ascending: true })
          .limit(5);

        if (slaLevels && slaLevels.length > 0) {
          for (const level of slaLevels) {
            await executeSLAAction(client, ticket, level);
          }
        } else {
          // Default escalation: notify assigned agent and group members
          await triggerNotification(client, ticket.tenant_id, 'sla.breached', {
            ticket: ticket as unknown as Record<string, unknown>,
          });
        }
      }

      // ----- WARNING -----
      if (slaStatus.warning && !ticket.sla_breached) {
        warningCount++;

        // Check if we already sent a warning for this ticket recently
        const { data: recentWarning } = await client
          .from('notification_queue')
          .select('id')
          .eq('tenant_id', ticket.tenant_id)
          .eq('channel', 'in_app')
          .like('body', `%${ticket.id}%sla%warning%`)
          .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
          .limit(1)
          .maybeSingle();

        if (!recentWarning) {
          // Load warning-level escalation actions
          const { data: warningLevels } = await client
            .from('sla_escalation_levels')
            .select('*')
            .eq('tenant_id', ticket.tenant_id)
            .eq('trigger_type', 'warning')
            .order('level', { ascending: true })
            .limit(3);

          if (warningLevels && warningLevels.length > 0) {
            for (const level of warningLevels) {
              await executeSLAAction(client, ticket, level);
            }
          } else {
            // Default: send in-app warning notification
            await triggerNotification(client, ticket.tenant_id, 'sla.warning', {
              ticket: ticket as unknown as Record<string, unknown>,
              metadata: {
                minutes_remaining: slaStatus.minutesRemaining,
              },
            });
          }
        }
      }
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SLAEscalationLevel {
  id: string;
  tenant_id: string;
  level: number;
  trigger_type: string;
  action: string; // 'notify' | 'escalate' | 'reassign'
  config: Record<string, unknown>;
}

/**
 * Executes an SLA escalation action based on the level configuration.
 */
async function executeSLAAction(
  client: ReturnType<typeof getSupabaseServerClient>,
  ticket: Record<string, unknown>,
  level: SLAEscalationLevel,
): Promise<void> {
  const tenantId = ticket.tenant_id as string;

  switch (level.action) {
    case 'notify': {
      const eventType =
        level.trigger_type === 'breach' ? 'sla.breached' : 'sla.warning';

      await triggerNotification(client, tenantId, eventType, {
        ticket,
        metadata: {
          escalation_level: level.level,
        },
      });
      break;
    }

    case 'escalate': {
      const groupId = level.config.group_id as string | undefined;

      if (groupId) {
        await client
          .from('tickets')
          .update({
            assigned_group_id: groupId,
            assigned_agent_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ticket.id as string)
          .eq('tenant_id', tenantId);

        // Notify the new group
        await triggerNotification(client, tenantId, 'ticket.escalated', {
          ticket: {
            ...ticket,
            assigned_group_id: groupId,
            assigned_agent_id: null,
          },
          metadata: {
            escalation_level: level.level,
            reason: 'SLA breach escalation',
          },
        });
      }
      break;
    }

    case 'reassign': {
      const agentId = level.config.agent_id as string | undefined;

      if (agentId) {
        await client
          .from('tickets')
          .update({
            assigned_agent_id: agentId,
            status: 'assigned',
            updated_at: new Date().toISOString(),
          })
          .eq('id', ticket.id as string)
          .eq('tenant_id', tenantId);

        // Notify the new agent
        await triggerNotification(client, tenantId, 'ticket.reassigned', {
          ticket: {
            ...ticket,
            assigned_agent_id: agentId,
            status: 'assigned',
          },
          metadata: {
            escalation_level: level.level,
            reason: 'SLA breach reassignment',
          },
        });
      }
      break;
    }

    default:
      console.warn(
        `[cron/sla-check] Unknown SLA action: ${level.action}`,
      );
      break;
  }
}
