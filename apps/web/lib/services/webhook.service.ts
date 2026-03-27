// ---------------------------------------------------------------------------
// Webhook Service — Business Logic Service
// ---------------------------------------------------------------------------
// Pure business logic. No 'use server' — used by Server Actions, cron jobs,
// and workflow engine.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

interface OutboundWebhook {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  headers: Record<string, string> | null;
  created_at: string;
}

interface WebhookLog {
  id: string;
  webhook_id: string;
  tenant_id: string;
  event: string;
  url: string;
  status_code: number | null;
  request_body: string;
  response_body: string | null;
  success: boolean;
  attempts: number;
  error: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 1. dispatchWebhook
// ---------------------------------------------------------------------------

/**
 * Finds all active outbound webhooks matching the given event for a tenant,
 * sends an HTTP POST to each with an HMAC-SHA256 signature, and logs the result.
 *
 * The payload is signed using the webhook's secret key. The signature is sent
 * in the `X-NovaDesk-Signature` header.
 */
export async function dispatchWebhook(
  client: SupabaseClient,
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<ServiceResult<{ dispatched: number; results: Array<{ webhook_id: string; success: boolean; error?: string }> }>> {
  // Find active webhooks subscribed to this event
  const { data: webhooks, error: fetchError } = await client
    .from('outbound_webhooks')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .contains('events', [event]);

  if (fetchError) {
    return { data: null, error: fetchError.message };
  }

  if (!webhooks || webhooks.length === 0) {
    return { data: { dispatched: 0, results: [] }, error: null };
  }

  const results: Array<{ webhook_id: string; success: boolean; error?: string }> = [];

  for (const webhook of webhooks as unknown as OutboundWebhook[]) {
    const body = JSON.stringify({
      event,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const signature = await generateSignature(body, webhook.secret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-NovaDesk-Signature': signature,
      'X-NovaDesk-Event': event,
      ...(webhook.headers ?? {}),
    };

    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let success = false;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
      });

      statusCode = response.status;
      responseBody = await response.text().catch(() => null);
      success = response.ok;

      if (!success) {
        errorMessage = `HTTP ${response.status}: ${responseBody?.substring(0, 500) ?? 'No response body'}`;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Request failed';
    }

    // Log the webhook delivery attempt
    await client.from('webhook_logs').insert({
      webhook_id: webhook.id,
      tenant_id: tenantId,
      event,
      url: webhook.url,
      status_code: statusCode,
      request_body: body,
      response_body: responseBody?.substring(0, 5000) ?? null,
      success,
      attempts: 1,
      error: errorMessage,
    });

    results.push({
      webhook_id: webhook.id,
      success,
      error: errorMessage ?? undefined,
    });
  }

  const dispatched = results.filter((r) => r.success).length;

  return { data: { dispatched, results }, error: null };
}

// ---------------------------------------------------------------------------
// 2. generateSignature
// ---------------------------------------------------------------------------

/**
 * Generates an HMAC-SHA256 signature for the given payload using the webhook
 * secret. Returns a hex-encoded string prefixed with `sha256=`.
 *
 * Uses the Web Crypto API (available in Node.js 18+ and edge runtimes).
 */
export async function generateSignature(
  payload: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadData);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `sha256=${hex}`;
}

// ---------------------------------------------------------------------------
// 3. retryFailedWebhooks
// ---------------------------------------------------------------------------

/**
 * Finds failed webhook deliveries with `attempts < 3` and retries them
 * using exponential backoff.
 *
 * Retry schedule:
 *   - 1st retry: after 1 minute
 *   - 2nd retry: after 5 minutes
 *   - 3rd attempt failure: marks as permanently failed
 *
 * Designed to be called from a Vercel cron job.
 */
export async function retryFailedWebhooks(
  client: SupabaseClient,
): Promise<ServiceResult<{ retried: number; succeeded: number; errors: string[] }>> {
  const maxAttempts = 3;

  // Fetch failed webhook logs that are eligible for retry
  const { data: failedLogs, error: fetchError } = await client
    .from('webhook_logs')
    .select('*, outbound_webhooks(url, secret, headers, is_active)')
    .eq('success', false)
    .lt('attempts', maxAttempts)
    .order('created_at', { ascending: true })
    .limit(50);

  if (fetchError) {
    return { data: null, error: fetchError.message };
  }

  if (!failedLogs || failedLogs.length === 0) {
    return { data: { retried: 0, succeeded: 0, errors: [] }, error: null };
  }

  let retried = 0;
  let succeeded = 0;
  const errors: string[] = [];

  for (const log of failedLogs as unknown as (WebhookLog & {
    outbound_webhooks: OutboundWebhook | null;
  })[]) {
    const webhook = log.outbound_webhooks;

    // Skip if the webhook has been deactivated
    if (!webhook || !webhook.is_active) {
      continue;
    }

    // Check exponential backoff timing
    const retryDelayMinutes = log.attempts === 1 ? 1 : 5;
    const retryAfter = new Date(
      new Date(log.created_at).getTime() + retryDelayMinutes * 60_000,
    );

    if (new Date() < retryAfter) {
      continue; // Not yet time to retry
    }

    retried++;

    const signature = await generateSignature(log.request_body, webhook.secret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-NovaDesk-Signature': signature,
      'X-NovaDesk-Event': log.event,
      ...(webhook.headers ?? {}),
    };

    let success = false;
    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: log.request_body,
        signal: AbortSignal.timeout(15_000),
      });

      statusCode = response.status;
      responseBody = await response.text().catch(() => null);
      success = response.ok;

      if (!success) {
        errorMessage = `HTTP ${response.status}: ${responseBody?.substring(0, 500) ?? 'No response body'}`;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Retry request failed';
    }

    // Update the log entry
    await client
      .from('webhook_logs')
      .update({
        attempts: log.attempts + 1,
        status_code: statusCode ?? log.status_code,
        response_body: responseBody?.substring(0, 5000) ?? log.response_body,
        success,
        error: success ? null : errorMessage,
      })
      .eq('id', log.id);

    if (success) {
      succeeded++;
    } else {
      errors.push(`Webhook log ${log.id}: ${errorMessage}`);
    }
  }

  return { data: { retried, succeeded, errors }, error: null };
}
