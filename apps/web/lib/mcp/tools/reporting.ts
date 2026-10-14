// ---------------------------------------------------------------------------
// MCP Tools — Reporting, SLA and contract cycles
// ---------------------------------------------------------------------------
// All read-only. Most of these wrap Postgres functions that already encode
// the contractual arithmetic, so the tools scope and shape rather than
// recalculate.
//
// The honesty problem these tools have to solve: measured against production
// on 14-oct-2026, only 83 of 714 tickets carry an SLA target (11.6%) and
// ZERO are marked breached — because no organization has an sla_id, not
// because targets were met. An agent reading `sla_breached` alone would
// report 100% compliance in good faith and be wrong.
//
// So `sla_coverage` exists, every SLA description says what the number does
// and does not mean, and compliance questions are pointed at the contract
// cycle tools, which compute from the contract rather than from a column
// that was never populated.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  getAgentWorkload as domainAgentWorkload,
  getCycleCompliance as domainCycleCompliance,
  getCycleUsage as domainCycleUsage,
  getDailyActivity as domainDailyActivity,
  getSlaCoverage as domainSlaCoverage,
  getTerminationRisk as domainTerminationRisk,
  getTicketSlaStatus as domainTicketSla,
  getTicketStats as domainTicketStats,
  getTicketsAtRisk as domainAtRisk,
} from '~/lib/domain/reporting.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------------------
// sla_coverage
// ---------------------------------------------------------------------------

registry.register({
  name: 'sla_coverage',
  description:
    'How many tickets actually carry an SLA target, and which organizations have no SLA policy attached. CALL THIS BEFORE REPORTING ANY SLA COMPLIANCE FIGURE: where coverage is low, sla_breached = false means no target was ever set, not that targets were met. Returns an explicit interpretation of what the numbers support.',
  scope: 'slas:read',
  inputSchema: z.object({
    organization_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.6.0', tags: ['sla', 'reports', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainSlaCoverage(toDomainContext(ctx), {
        organization_id: input.organization_id ?? null,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// sla_tickets_at_risk
// ---------------------------------------------------------------------------

registry.register({
  name: 'sla_tickets_at_risk',
  description:
    'Tickets approaching their SLA deadline, computed in business minutes with pauses discounted. warn_fraction is how much of the window must be consumed to count as at risk (0.75 = 75%). Only covers tickets that HAVE a target — check sla_coverage to know how many that is.',
  scope: 'slas:read',
  inputSchema: z.object({
    warn_fraction: z.number().min(0.1).max(1).default(0.75),
  }),
  meta: { since: '1.6.0', tags: ['sla', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainAtRisk(toDomainContext(ctx), input.warn_fraction));
  },
});

// ---------------------------------------------------------------------------
// sla_ticket_status
// ---------------------------------------------------------------------------

registry.register({
  name: 'sla_ticket_status',
  description:
    'Full SLA picture for one ticket: computed status, business minutes paused, effective due date after pauses, when it was responded to, and its clause-4 mitigation and correction-plan state. Says so explicitly when the ticket has no target at all.',
  scope: 'slas:read',
  inputSchema: z.object({ ticket_id: z.string().uuid() }),
  meta: { since: '1.6.0', tags: ['sla', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainTicketSla(toDomainContext(ctx), input.ticket_id));
  },
});

// ---------------------------------------------------------------------------
// contract_cycle_usage
// ---------------------------------------------------------------------------

registry.register({
  name: 'contract_cycle_usage',
  description:
    "Quota consumption for a client's current billing cycle: the window, the contracted quota, tickets consumed, what remains and any carry-forward. Cycles run from the contract's cycle_start_day, not calendar months.",
  scope: 'reports:read',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    at: dateOnly.optional().describe('Report the cycle covering this date instead of today.'),
  }),
  meta: { since: '1.6.0', tags: ['contracts', 'reports', 'read'] },
  async handler(ctx, input) {
    return {
      usage: unwrap(
        await domainCycleUsage(toDomainContext(ctx), input.organization_id, input.at ?? null),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// contract_cycle_compliance
// ---------------------------------------------------------------------------

registry.register({
  name: 'contract_cycle_compliance',
  description:
    'Contractual compliance for a billing cycle, computed from the contract rather than from ticket flags: response performance against the agreed targets, whether the cycle is closed, and any service credits owed. THIS is the trustworthy source for "are we meeting the SLA" — not sla_breached on the tickets table.',
  scope: 'reports:read',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    at: dateOnly.optional(),
  }),
  meta: { since: '1.6.0', tags: ['contracts', 'sla', 'reports', 'read'] },
  async handler(ctx, input) {
    return {
      compliance: unwrap(
        await domainCycleCompliance(toDomainContext(ctx), input.organization_id, input.at ?? null),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// contract_termination_risk
// ---------------------------------------------------------------------------

registry.register({
  name: 'contract_termination_risk',
  description:
    'Whether a client has accumulated enough consecutive low-compliance cycles to trigger the contractual termination clause. Returns cycles evaluated, how many fell below threshold, whether they were consecutive, and a plain-language explanation.',
  scope: 'reports:read',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    at: dateOnly.optional(),
  }),
  meta: { since: '1.6.0', tags: ['contracts', 'risk', 'read'] },
  async handler(ctx, input) {
    return {
      risk: unwrap(
        await domainTerminationRisk(toDomainContext(ctx), input.organization_id, input.at ?? null),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// contract_daily_activity
// ---------------------------------------------------------------------------

registry.register({
  name: 'contract_daily_activity',
  description:
    'Day-by-day opened and closed ticket counts across a billing cycle. Use it to show how load was distributed rather than only the cycle total.',
  scope: 'reports:read',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    at: dateOnly.optional(),
  }),
  meta: { since: '1.6.0', tags: ['contracts', 'reports', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainDailyActivity(toDomainContext(ctx), input.organization_id, input.at ?? null),
    );
  },
});

// ---------------------------------------------------------------------------
// reports_agent_workload
// ---------------------------------------------------------------------------

registry.register({
  name: 'reports_agent_workload',
  description:
    'Per-agent workload counted live from tickets (not from the daily snapshot): open, in progress, testing, resolved and closed, sorted by active load. Use it to answer who is overloaded right now.',
  scope: 'reports:read',
  inputSchema: z.object({
    organization_id: z.string().uuid().optional(),
    include_inactive: z.boolean().default(false),
  }),
  meta: { since: '1.6.0', tags: ['reports', 'agents', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainAgentWorkload(toDomainContext(ctx), {
        organization_id: input.organization_id ?? null,
        include_inactive: input.include_inactive,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// reports_ticket_stats
// ---------------------------------------------------------------------------

registry.register({
  name: 'reports_ticket_stats',
  description:
    'Ticket counts broken down by status, type, urgency, channel and client, over an optional date range. Every breakdown comes from one pass over the same filtered set, so the totals agree with each other.',
  scope: 'reports:read',
  inputSchema: z.object({
    organization_id: z.string().uuid().optional(),
    created_after: z.string().datetime().optional(),
    created_before: z.string().datetime().optional(),
  }),
  meta: { since: '1.6.0', tags: ['reports', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainTicketStats(toDomainContext(ctx), {
        organization_id: input.organization_id ?? null,
        created_after: input.created_after ?? null,
        created_before: input.created_before ?? null,
      }),
    );
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __reportingToolsLoaded = true;
