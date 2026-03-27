import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { processQueue } from '~/lib/services/notification.service';
import { retryFailedWebhooks } from '~/lib/services/webhook.service';

// ---------------------------------------------------------------------------
// GET /api/cron/notification-processor
// ---------------------------------------------------------------------------

/**
 * Vercel Cron Job — Notification Queue Processor
 *
 * Schedule: every minute (`* * * * *`)
 *
 * Flow:
 *   1. Process pending notifications from `notification_queue`.
 *   2. Retry failed outbound webhooks with exponential backoff.
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

    // Process notification queue
    const queueResult = await processQueue(client);

    // Retry failed webhooks
    const webhookResult = await retryFailedWebhooks(client);

    const allErrors = [
      ...queueResult.errors,
      ...(webhookResult.data?.errors ?? []),
    ];

    if (allErrors.length > 0) {
      console.warn(
        '[cron/notification-processor] Errors:',
        allErrors.join('; '),
      );
    }

    return NextResponse.json({
      ok: true,
      notifications: {
        processed: queueResult.processed,
        failed: queueResult.failed,
      },
      webhooks: {
        retried: webhookResult.data?.retried ?? 0,
        succeeded: webhookResult.data?.succeeded ?? 0,
      },
      errors: allErrors,
    });
  } catch (err) {
    console.error('[cron/notification-processor] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
