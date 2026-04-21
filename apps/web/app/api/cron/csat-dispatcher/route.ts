import { NextRequest, NextResponse } from 'next/server';

import { dispatchPendingNps } from '~/lib/services/nps.service';

/**
 * Vercel Cron — Dispatch NPS/CSAT surveys that were queued 5+ min ago.
 * Schedule: every 5 minutes. Idempotent: rows flip sent_at on success.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchPendingNps();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/csat-dispatcher] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
