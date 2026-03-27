import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { snapshotDailyMetrics } from '~/lib/services/metrics.service';

// ---------------------------------------------------------------------------
// GET /api/cron/metrics-snapshot
// ---------------------------------------------------------------------------

/**
 * Vercel Cron Job — Daily Metrics Snapshot
 *
 * Schedule: daily at midnight UTC (`0 0 * * *`)
 *
 * Flow:
 *   1. Fetch all active tenants.
 *   2. For each tenant, snapshot daily_metrics for yesterday's date.
 *   3. Return a summary of results.
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

    // Calculate yesterday's date in UTC
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0]!; // "YYYY-MM-DD"

    // Fetch all active tenants
    const { data: tenants, error: tenantError } = await client
      .from('tenants')
      .select('id, name')
      .eq('subscription_status', 'active');

    if (tenantError) {
      console.error('[cron/metrics-snapshot] Tenant fetch error:', tenantError.message);
      return NextResponse.json(
        { error: tenantError.message },
        { status: 500 },
      );
    }

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        ok: true,
        date: dateStr,
        tenants_processed: 0,
        total_inserted: 0,
        errors: [],
      });
    }

    let totalInserted = 0;
    const errors: string[] = [];

    for (const tenant of tenants) {
      try {
        const { data, error } = await snapshotDailyMetrics(
          client,
          tenant.id,
          dateStr,
        );

        if (error) {
          errors.push(`Tenant ${tenant.name} (${tenant.id}): ${error}`);
        } else if (data) {
          totalInserted += data.inserted;
        }
      } catch (err) {
        errors.push(
          `Tenant ${tenant.name} (${tenant.id}): ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      date: dateStr,
      tenants_processed: tenants.length,
      total_inserted: totalInserted,
      errors,
    });
  } catch (err) {
    console.error('[cron/metrics-snapshot] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
