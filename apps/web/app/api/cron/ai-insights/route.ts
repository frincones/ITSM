import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  generateAIInsights,
  calculateAIPerformance,
  persistAIPerformance,
} from '~/lib/services/ai-insights.service';

/* -------------------------------------------------------------------------- */
/*  GET /api/cron/ai-insights — Daily AI insights + performance generation     */
/*  Schedule: 0 1 * * * (daily at 1 AM UTC)                                   */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  try {
    // Get all active tenants
    const { data: tenants } = await client
      .from('tenants')
      .select('id');

    const results: Array<{ tenant: string; insights: number; perf: boolean }> = [];

    for (const tenant of tenants ?? []) {
      try {
        // Generate AI insights
        const insights = await generateAIInsights(client, tenant.id);

        // Calculate and persist AI performance
        const perf = await calculateAIPerformance(client, tenant.id);
        await persistAIPerformance(client, tenant.id, perf);

        results.push({
          tenant: tenant.id,
          insights: insights.length,
          perf: true,
        });
      } catch (err) {
        console.error(`[AI Insights Cron] Error for tenant ${tenant.id}:`, err);
        results.push({ tenant: tenant.id, insights: 0, perf: false });
      }
    }

    return NextResponse.json({
      ok: true,
      tenants_processed: results.length,
      results,
    });
  } catch (err) {
    console.error('[AI Insights Cron] Fatal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
