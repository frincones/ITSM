// ---------------------------------------------------------------------------
// Notification Engine — Business Logic Service
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

interface NotificationTemplate {
  id: string;
  tenant_id: string;
  event_type: string;
  channel: 'email' | 'in_app' | 'webhook' | 'whatsapp';
  recipient_type: 'requester' | 'assigned_agent' | 'group_members' | 'watchers' | 'all_agents';
  subject_template: string;
  body_template: string;
  is_active: boolean;
}

interface QueuedNotification {
  id: string;
  tenant_id: string;
  template_id: string | null;
  channel: string;
  recipient_type: string;
  recipient_id: string | null;
  address: string | null;
  subject: string | null;
  body: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  scheduled_for: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

interface NotificationContext {
  ticket?: Record<string, unknown>;
  agent?: Record<string, unknown>;
  requester?: Record<string, unknown>;
  comment?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. resolveRecipients
// ---------------------------------------------------------------------------

/**
 * Determines who should receive a notification based on the event type and
 * template recipient_type configuration.
 *
 * Returns an array of { user_id, email, name } objects.
 */
export async function resolveRecipients(
  client: SupabaseClient,
  tenantId: string,
  recipientType: string,
  context: NotificationContext,
): Promise<Array<{ user_id: string; email: string; name: string | null }>> {
  const recipients: Array<{ user_id: string; email: string; name: string | null }> = [];

  switch (recipientType) {
    case 'requester': {
      const email = context.ticket?.requester_email as string | undefined;
      const createdBy = context.ticket?.created_by as string | undefined;

      if (email) {
        // Look up the user by email
        const { data: agent } = await client
          .from('agents')
          .select('id, user_id, name, email')
          .eq('tenant_id', tenantId)
          .eq('email', email)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (agent) {
          recipients.push({
            user_id: agent.user_id,
            email: agent.email,
            name: agent.name,
          });
        } else {
          // External requester — use email directly
          recipients.push({
            user_id: '',
            email,
            name: null,
          });
        }
      } else if (createdBy) {
        const { data: agent } = await client
          .from('agents')
          .select('id, user_id, name, email')
          .eq('tenant_id', tenantId)
          .eq('user_id', createdBy)
          .eq('is_active', true)
          .maybeSingle();

        if (agent) {
          recipients.push({
            user_id: agent.user_id,
            email: agent.email,
            name: agent.name,
          });
        }
      }
      break;
    }

    case 'assigned_agent': {
      const agentId = context.ticket?.assigned_agent_id as string | undefined;

      if (agentId) {
        const { data: agent } = await client
          .from('agents')
          .select('id, user_id, name, email')
          .eq('tenant_id', tenantId)
          .eq('id', agentId)
          .eq('is_active', true)
          .maybeSingle();

        if (agent) {
          recipients.push({
            user_id: agent.user_id,
            email: agent.email,
            name: agent.name,
          });
        }
      }
      break;
    }

    case 'group_members': {
      const groupId = context.ticket?.assigned_group_id as string | undefined;

      if (groupId) {
        const { data: members } = await client
          .from('group_members')
          .select('agent:agents(id, user_id, name, email)')
          .eq('group_id', groupId);

        if (members) {
          for (const member of members) {
            const agent = member.agent as unknown as {
              id: string;
              user_id: string;
              name: string;
              email: string;
            } | null;

            if (agent) {
              recipients.push({
                user_id: agent.user_id,
                email: agent.email,
                name: agent.name,
              });
            }
          }
        }
      }
      break;
    }

    case 'watchers': {
      const ticketId = context.ticket?.id as string | undefined;

      if (ticketId) {
        const { data: watchers } = await client
          .from('ticket_watchers')
          .select('agent:agents(id, user_id, name, email)')
          .eq('ticket_id', ticketId)
          .eq('tenant_id', tenantId);

        if (watchers) {
          for (const watcher of watchers) {
            const agent = watcher.agent as unknown as {
              id: string;
              user_id: string;
              name: string;
              email: string;
            } | null;

            if (agent) {
              recipients.push({
                user_id: agent.user_id,
                email: agent.email,
                name: agent.name,
              });
            }
          }
        }
      }
      break;
    }

    case 'all_agents': {
      const { data: agents } = await client
        .from('agents')
        .select('id, user_id, name, email')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (agents) {
        for (const agent of agents) {
          recipients.push({
            user_id: agent.user_id,
            email: agent.email,
            name: agent.name,
          });
        }
      }
      break;
    }

    default:
      break;
  }

  // Deduplicate by user_id (or email for external recipients)
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.user_id || r.email;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// 2. renderTemplate
// ---------------------------------------------------------------------------

/**
 * Replaces `{{variable.path}}` placeholders in a template string with actual
 * values from the provided variables map.
 *
 * Supports nested dot notation: `{{ticket.title}}`, `{{agent.name}}`, etc.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_match, path: string) => {
    const trimmedPath = path.trim();
    const value = getNestedValue(variables, trimmedPath);

    if (value === null || value === undefined) {
      return '';
    }

    return String(value);
  });
}

// ---------------------------------------------------------------------------
// 3. queueNotification
// ---------------------------------------------------------------------------

/**
 * Inserts a notification into the `notification_queue` table for async
 * processing by the notification cron job.
 */
export async function queueNotification(
  client: SupabaseClient,
  tenantId: string,
  templateId: string | null,
  channel: string,
  recipientType: string,
  recipientId: string | null,
  address: string | null,
  subject: string | null,
  body: string,
  scheduledFor?: string | null,
): Promise<ServiceResult<QueuedNotification>> {
  const { data, error } = await client
    .from('notification_queue')
    .insert({
      tenant_id: tenantId,
      template_id: templateId,
      channel,
      recipient_type: recipientType,
      recipient_id: recipientId,
      address,
      subject,
      body,
      status: 'pending',
      attempts: 0,
      scheduled_for: scheduledFor ?? null,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as unknown as QueuedNotification, error: null };
}

// ---------------------------------------------------------------------------
// 4. processQueue
// ---------------------------------------------------------------------------

/**
 * Finds pending notifications whose `scheduled_for` has passed (or is null)
 * and processes them by dispatching via the appropriate channel.
 *
 * Updates each notification's status to 'sent' or 'failed' accordingly.
 *
 * Designed to be called from a Vercel cron job every minute.
 */
export async function processQueue(
  client: SupabaseClient,
): Promise<{ processed: number; failed: number; errors: string[] }> {
  const now = new Date().toISOString();

  // Fetch up to 100 pending notifications per run
  const { data: queue, error: fetchError } = await client
    .from('notification_queue')
    .select('*')
    .eq('status', 'pending')
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(100);

  if (fetchError || !queue) {
    return {
      processed: 0,
      failed: 0,
      errors: [fetchError?.message ?? 'Failed to fetch notification queue'],
    };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const notification of queue as unknown as QueuedNotification[]) {
    // Mark as processing to prevent concurrent processing
    await client
      .from('notification_queue')
      .update({ status: 'processing', attempts: notification.attempts + 1 })
      .eq('id', notification.id);

    try {
      switch (notification.channel) {
        case 'email': {
          if (!notification.address) {
            throw new Error('Missing email address');
          }
          await sendEmail(
            notification.address,
            notification.subject ?? 'NovaDesk Notification',
            notification.body,
          );
          break;
        }

        case 'in_app': {
          if (!notification.recipient_id) {
            throw new Error('Missing recipient_id for in_app notification');
          }
          await sendInApp(
            client,
            notification.tenant_id,
            notification.recipient_id,
            notification.subject ?? 'Notification',
            notification.body,
            null,
          );
          break;
        }

        case 'webhook': {
          if (!notification.address) {
            throw new Error('Missing webhook URL');
          }
          const response = await fetch(notification.address, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenant_id: notification.tenant_id,
              channel: notification.channel,
              subject: notification.subject,
              body: notification.body,
              sent_at: now,
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            throw new Error(`Webhook returned ${response.status}`);
          }
          break;
        }

        case 'whatsapp': {
          // WhatsApp notifications require the phone number in `address`
          // and a configured WhatsApp Business API. For now, log and skip.
          if (!notification.address) {
            throw new Error('Missing WhatsApp phone number');
          }
          console.warn(
            `[notification] WhatsApp delivery not yet implemented for: ${notification.address}`,
          );
          break;
        }

        default:
          throw new Error(`Unsupported channel: ${notification.channel}`);
      }

      // Mark as sent
      await client
        .from('notification_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', notification.id);

      processed++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // If attempts exhausted, mark as failed permanently
      const maxAttempts = 3;
      const newStatus = notification.attempts + 1 >= maxAttempts ? 'failed' : 'pending';

      await client
        .from('notification_queue')
        .update({ status: newStatus, error: errorMessage })
        .eq('id', notification.id);

      failed++;
      errors.push(`Notification ${notification.id}: ${errorMessage}`);
    }
  }

  return { processed, failed, errors };
}

// ---------------------------------------------------------------------------
// 5. sendEmail
// ---------------------------------------------------------------------------

/**
 * Sends an email via the Resend API.
 *
 * Requires `RESEND_API_KEY` and optionally `RESEND_FROM_EMAIL` env vars.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'NovaDesk <noreply@novadesk.com>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html: body,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }
}

// ---------------------------------------------------------------------------
// 6. sendInApp
// ---------------------------------------------------------------------------

/**
 * Inserts an in-app notification into the `notifications` table.
 */
export async function sendInApp(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  title: string,
  body: string,
  link: string | null,
): Promise<ServiceResult<{ id: string }>> {
  const { data, error } = await client
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      title,
      body,
      type: 'notification',
      resource_type: link ? 'ticket' : null,
      resource_id: null,
      link,
      is_read: false,
    })
    .select('id')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as { id: string }, error: null };
}

// ---------------------------------------------------------------------------
// 7. triggerNotification
// ---------------------------------------------------------------------------

/**
 * Main entry point for the notification engine.
 *
 * Given an event type and context:
 *   1. Finds all active notification templates for the event.
 *   2. For each template, resolves the recipients.
 *   3. Renders the subject and body templates.
 *   4. Queues all notifications for async processing.
 */
export async function triggerNotification(
  client: SupabaseClient,
  tenantId: string,
  eventType: string,
  context: NotificationContext,
): Promise<ServiceResult<{ queued: number }>> {
  // 1. Find active templates for this event
  const { data: templates, error: tplError } = await client
    .from('notification_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('event_type', eventType)
    .eq('is_active', true);

  if (tplError) {
    return { data: null, error: tplError.message };
  }

  if (!templates || templates.length === 0) {
    return { data: { queued: 0 }, error: null };
  }

  // Build template variables from context
  const variables: Record<string, unknown> = {
    ticket: context.ticket ?? {},
    agent: context.agent ?? {},
    requester: context.requester ?? {},
    comment: context.comment ?? {},
    ...context.metadata,
  };

  let queued = 0;

  for (const tpl of templates as unknown as NotificationTemplate[]) {
    // 2. Resolve recipients for this template
    const recipients = await resolveRecipients(
      client,
      tenantId,
      tpl.recipient_type,
      context,
    );

    if (recipients.length === 0) {
      continue;
    }

    // 3. Render subject and body
    const renderedSubject = renderTemplate(tpl.subject_template, variables);
    const renderedBody = renderTemplate(tpl.body_template, variables);

    // 4. Queue a notification for each recipient
    for (const recipient of recipients) {
      const address =
        tpl.channel === 'email'
          ? recipient.email
          : tpl.channel === 'in_app'
            ? null
            : null;

      const { error: queueError } = await queueNotification(
        client,
        tenantId,
        tpl.id,
        tpl.channel,
        tpl.recipient_type,
        recipient.user_id || null,
        address,
        renderedSubject,
        renderedBody,
      );

      if (!queueError) {
        queued++;
      }
    }
  }

  return { data: { queued }, error: null };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves a nested value from an object using dot notation.
 * Example: getNestedValue({ ticket: { title: 'Test' } }, 'ticket.title') => 'Test'
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}
