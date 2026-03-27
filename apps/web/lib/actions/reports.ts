'use server';

import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { dateRangeSchema } from '~/lib/schemas/common.schema';
import {
  getGranularMetrics,
  getSLAComplianceRate,
  getAgentPerformance,
} from '~/lib/services/metrics.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActionResult<T = unknown> = { data: T; error: null } | { data: null; error: string };

/**
 * Authenticate the current user and resolve their agent record + tenant_id.
 */
async function requireAgent(client: ReturnType<typeof getSupabaseServerClient>) {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { agent: null, user: null, error: 'Unauthorized' } as const;
  }

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return { agent: null, user, error: 'Agent not found' } as const;
  }

  return { agent, user, error: null } as const;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const reportFiltersSchema = z.object({
  date_range: dateRangeSchema,
  type: z.string().optional(),
  group_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
});

type ReportFilters = z.infer<typeof reportFiltersSchema>;

const exportFormatSchema = z.enum(['csv', 'json']);

// ---------------------------------------------------------------------------
// 1. getTicketReportData
// ---------------------------------------------------------------------------

/**
 * Fetches granular metrics from daily_metrics for the report dashboard.
 * Returns type+status breakdowns (Cerrados Garantia, Nuevos Soporte, etc.)
 */
export async function getTicketReportData(
  filters: ReportFilters,
): Promise<ActionResult> {
  try {
    const validated = reportFiltersSchema.parse(filters);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const dateRange = {
      from: validated.date_range.from.toISOString().split('T')[0]!,
      to: validated.date_range.to.toISOString().split('T')[0]!,
    };

    const { data: metrics, error } = await getGranularMetrics(
      client,
      agent.tenant_id,
      dateRange,
    );

    if (error) {
      return { data: null, error };
    }

    return { data: metrics, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. getSLAReport
// ---------------------------------------------------------------------------

/**
 * Fetches SLA compliance data for the given date range.
 */
export async function getSLAReport(
  filters: ReportFilters,
): Promise<ActionResult> {
  try {
    const validated = reportFiltersSchema.parse(filters);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const dateRange = {
      from: validated.date_range.from.toISOString().split('T')[0]!,
      to: validated.date_range.to.toISOString().split('T')[0]!,
    };

    const { data: slaData, error } = await getSLAComplianceRate(
      client,
      agent.tenant_id,
      dateRange,
    );

    if (error) {
      return { data: null, error };
    }

    return { data: slaData, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. getAgentReport
// ---------------------------------------------------------------------------

/**
 * Fetches agent performance data for the given date range.
 */
export async function getAgentReport(
  filters: ReportFilters,
): Promise<ActionResult> {
  try {
    const validated = reportFiltersSchema.parse(filters);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const dateRange = {
      from: validated.date_range.from.toISOString().split('T')[0]!,
      to: validated.date_range.to.toISOString().split('T')[0]!,
    };

    const { data: agentData, error } = await getAgentPerformance(
      client,
      agent.tenant_id,
      dateRange,
    );

    if (error) {
      return { data: null, error };
    }

    return { data: agentData, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. exportReport
// ---------------------------------------------------------------------------

/**
 * Generates a CSV or JSON export of report data.
 *
 * Returns the exported content as a string along with the MIME type.
 */
export async function exportReport(
  format: 'csv' | 'json',
  filters: ReportFilters,
): Promise<ActionResult<{ content: string; mimeType: string; filename: string }>> {
  try {
    exportFormatSchema.parse(format);
    const validated = reportFiltersSchema.parse(filters);
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const dateRange = {
      from: validated.date_range.from.toISOString().split('T')[0]!,
      to: validated.date_range.to.toISOString().split('T')[0]!,
    };

    // Fetch all report data
    const [metricsResult, slaResult, agentResult] = await Promise.all([
      getGranularMetrics(client, agent.tenant_id, dateRange),
      getSLAComplianceRate(client, agent.tenant_id, dateRange),
      getAgentPerformance(client, agent.tenant_id, dateRange),
    ]);

    const reportData = {
      date_range: dateRange,
      generated_at: new Date().toISOString(),
      ticket_metrics: metricsResult.data ?? [],
      sla_compliance: slaResult.data ?? null,
      agent_performance: agentResult.data ?? [],
    };

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      return {
        data: {
          content: JSON.stringify(reportData, null, 2),
          mimeType: 'application/json',
          filename: `novadesk-report-${timestamp}.json`,
        },
        error: null,
      };
    }

    // CSV export — flatten ticket_metrics
    const csvRows: string[] = [];

    // Header
    csvRows.push(
      'Label,Count,Avg First Response (min),Avg Resolution (min),SLA Met,SLA Breached',
    );

    // Ticket metrics rows
    const metrics = metricsResult.data ?? [];
    for (const metric of metrics) {
      csvRows.push(
        [
          escapeCsvField(metric.label),
          metric.count,
          metric.avg_first_response_minutes ?? '',
          metric.avg_resolution_minutes ?? '',
          metric.sla_met_count,
          metric.sla_breached_count,
        ].join(','),
      );
    }

    // SLA summary row
    if (slaResult.data) {
      csvRows.push('');
      csvRows.push('SLA Compliance Rate,Total,Met,Breached');
      csvRows.push(
        [
          `${slaResult.data.compliance_rate}%`,
          slaResult.data.total,
          slaResult.data.met,
          slaResult.data.breached,
        ].join(','),
      );
    }

    // Agent performance rows
    if (agentResult.data && agentResult.data.length > 0) {
      csvRows.push('');
      csvRows.push(
        'Agent,Assigned,Resolved,Avg First Response (min),Avg Resolution (min),SLA Met,SLA Breached',
      );

      for (const agentPerf of agentResult.data) {
        csvRows.push(
          [
            escapeCsvField(agentPerf.agent_name),
            agentPerf.tickets_assigned,
            agentPerf.tickets_resolved,
            agentPerf.avg_first_response_minutes ?? '',
            agentPerf.avg_resolution_minutes ?? '',
            agentPerf.sla_met_count,
            agentPerf.sla_breached_count,
          ].join(','),
        );
      }
    }

    return {
      data: {
        content: csvRows.join('\n'),
        mimeType: 'text/csv',
        filename: `novadesk-report-${timestamp}.csv`,
      },
      error: null,
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a field for CSV output. Wraps in quotes if it contains commas,
 * quotes, or newlines.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
