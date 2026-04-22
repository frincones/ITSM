import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  createTicketFromInboundEmail,
  type InboundEmailResult,
} from '~/lib/services/inbound-email.service';

/**
 * Reconciler for inbound emails the primary webhook missed.
 *
 * Resend normally POSTs to /api/webhooks/resend as soon as an inbound
 * email arrives, but in practice we've seen ~15% delivery gap (they
 * capture the email, never fire the webhook, don't retry). This cron
 * is the safety net: it pulls the last N inbound emails from Resend's
 * API and calls the same creator service the webhook uses. Dedup is
 * enforced by `tickets.custom_fields.inbound_email_id`, so running
 * this repeatedly is safe.
 *
 * Trigger options (pick one):
 *   · Vercel cron  (requires Pro — add to vercel.json)
 *   · GitHub Actions cron that curls this endpoint every ~5 min
 *   · External scheduler (cron-job.org, etc.)
 *   · Manual admin button (UI pending)
 *
 * Authentication: `Authorization: Bearer <CRON_SECRET>` header.
 */

export const maxDuration = 60;

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });
  }

  // Pull last 50 inbound emails from Resend (covers ~a day of volume
  // even during busy periods, well within what we process per run).
  let emails: Array<{
    id: string;
    from: string;
    to: string[] | string;
    subject: string;
    created_at: string;
  }> = [];
  try {
    const r = await fetch('https://api.resend.com/emails/receiving?limit=50', {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Resend API ${r.status}: ${await r.text()}` },
        { status: 502 },
      );
    }
    const body = (await r.json()) as { data?: typeof emails };
    emails = body.data ?? [];
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Resend fetch failed' },
      { status: 502 },
    );
  }

  const svc = getSvc();
  const results: InboundEmailResult[] = [];

  for (const e of emails) {
    // Skip anything that's not addressed to our +<slug> alias format
    // to avoid reacting to auth/activation replies etc.
    const toStr = Array.isArray(e.to) ? e.to.join(',') : String(e.to ?? '');
    if (!/soporte\+[a-z0-9._-]+@/i.test(toStr)) continue;

    const result = await createTicketFromInboundEmail(
      svc,
      {
        email_id: e.id,
        from: e.from,
        to: e.to,
        subject: e.subject,
      },
      { resendApiKey: resendKey },
    );
    results.push(result);
  }

  const created = results.filter((r) => 'created' in r && r.created).length;
  const dupes = results.filter((r) => 'duplicate' in r && r.duplicate).length;
  const skipped = results.filter((r) => 'skipped' in r).length;
  const errors = results.filter((r) => r.ok === false).length;

  return NextResponse.json({
    ok: true,
    scanned: emails.length,
    created,
    dupes,
    skipped,
    errors,
    results: results.slice(0, 50), // cap payload size
  });
}
