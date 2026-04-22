import { createClient } from '@supabase/supabase-js';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTML Email Template — Corporate, Minimal, Modern
// ═══════════════════════════════════════════════════════════════════════════

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
};

const STATUS_COLORS: Record<string, string> = {
  new: '#3b82f6', assigned: '#8b5cf6', in_progress: '#f59e0b',
  pending: '#6b7280', testing: '#6366f1', resolved: '#10b981',
  closed: '#22c55e', cancelled: '#ef4444',
};

function emailTemplate({
  preheader,
  heading,
  badgeText,
  badgeColor,
  bodyRows,
  ctaText,
  ctaUrl,
  footerNote,
}: {
  preheader: string;
  heading: string;
  badgeText?: string;
  badgeColor?: string;
  bodyRows: Array<{ label: string; value: string }>;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const badge = badgeText
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:${badgeColor ?? '#6366f1'};margin-left:8px;">${badgeText}</span>`
    : '';

  const rows = bodyRows
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:130px;vertical-align:top;">${r.label}</td><td style="padding:8px 0;color:#1f2937;font-size:13px;font-weight:500;">${r.value}</td></tr>`,
    )
    .join('');

  const cta = ctaText && ctaUrl
    ? `<div style="text-align:center;margin:28px 0 8px;">
        <a href="${ctaUrl}" style="display:inline-block;padding:10px 28px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.3px;">
          ${ctaText}
        </a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${heading}</title>
<style>body{margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;}</style>
</head>
<body>
<div style="display:none;font-size:1px;color:#f4f4f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px;">
  <table width="100%"><tr>
    <td><img src="https://itsm-web.vercel.app/images/novadesk-logo.png" alt="NovaDesk" width="28" height="28" style="vertical-align:middle;border-radius:6px;background:#fff;padding:2px;"><span style="color:#ffffff;font-size:16px;font-weight:700;margin-left:10px;vertical-align:middle;">NovaDesk ITSM</span></td>
  </tr></table>
</td></tr>

<!-- Body -->
<tr><td style="padding:28px 32px;">
  <h1 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">${heading}${badge}</h1>
  <div style="width:40px;height:3px;background:#4f46e5;border-radius:2px;margin:12px 0 20px;"></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    ${rows}
  </table>
  ${cta}
  ${footerNote ? `<p style="margin:20px 0 0;padding:14px;background:#f9fafb;border-radius:8px;font-size:12px;color:#6b7280;line-height:1.5;">${footerNote}</p>` : ''}
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
  <table width="100%"><tr>
    <td style="font-size:11px;color:#9ca3af;line-height:1.5;">
      <strong style="color:#6b7280;">NovaDesk ITSM</strong> — AI-First IT Service Management<br>
      Este es un correo automático. No responda directamente a este mensaje.<br>
      © ${new Date().getFullYear()} TDX Core. Todos los derechos reservados.
    </td>
  </tr></table>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  In-App Notification
// ═══════════════════════════════════════════════════════════════════════════

export async function notifyInApp(
  tenantId: string, userId: string, title: string, body: string,
  resourceType: string = 'ticket', resourceId?: string, link?: string,
) {
  const svc = getSvc();
  try {
    await svc.from('notifications').insert({
      tenant_id: tenantId, user_id: userId, title, body,
      is_read: false, resource_type: resourceType,
      resource_id: resourceId ?? null, link: link ?? null,
    });
  } catch { /* non-critical */ }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Email via Resend (HTML)
// ═══════════════════════════════════════════════════════════════════════════

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded payload. */
  content: string;
  /** Optional MIME type; Resend infers from the filename otherwise. */
  contentType?: string;
  /**
   * Content-ID for inline embedding. Reference it from the HTML as
   * `<img src="cid:your-id">`. Without this the file shows as a
   * regular attachment at the bottom of the email.
   */
  contentId?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  cc?: string[];
  /**
   * Custom RFC 5322 headers — we use these to implement thread-aware
   * notifications (Message-ID / In-Reply-To / References) so that Gmail,
   * Outlook and Apple Mail collapse every email about a given ticket into
   * a single conversation.
   */
  headers?: Record<string, string>;
  /** Inline (CID) or regular attachments. */
  attachments?: EmailAttachment[];
}

export async function notifyEmail(
  toOrOptions: string | EmailOptions,
  subject?: string,
  html?: string,
  replyTo?: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Notify] RESEND_API_KEY not set');
    return;
  }

  const opts: EmailOptions = typeof toOrOptions === 'string'
    ? { to: toOrOptions, subject: subject ?? '', html: html ?? '', replyTo }
    : toOrOptions;

  try {
    const payload: Record<string, unknown> = {
      from: 'NovaDesk ITSM <notifications@itsm.tdxcore.com>',
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    payload.reply_to = [opts.replyTo ?? 'support@itsm.tdxcore.com'];
    if (opts.cc && opts.cc.length) payload.cc = opts.cc;
    if (opts.headers && Object.keys(opts.headers).length) payload.headers = opts.headers;
    if (opts.attachments && opts.attachments.length) {
      // Resend attachment schema: { filename, content (base64), content_type?, content_id? }
      payload.attachments = opts.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType,
        content_id: a.contentId,
      }));
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error('[Notify] Email failed:', res.status, await res.text());
  } catch (err) {
    console.error('[Notify] Email error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Ticket Event Notifications
// ═══════════════════════════════════════════════════════════════════════════

interface TicketEvent {
  tenantId: string;
  ticketNumber: string;
  ticketId: string;
  title: string;
  type: string;
  urgency: string;
  status: string;
  organization?: string;
  requesterEmail?: string;
  // The agentX fields describe the "actor" of the event (whoever caused
  // the status change / reassignment / comment). They get the confirmation
  // email + in-app notification. Followers also get notified, except the
  // actor themselves (to avoid notifying someone of their own action).
  agentUserId?: string;
  agentEmail?: string;
  agentName?: string;
  // Passed through so the fan-out can include the current assignee even
  // when there's no follower row for them yet.
  assignedAgentId?: string;
  comment?: string;
  /** HTML version of the comment (from Tiptap). When present we prefer it over the plain-text comment. */
  commentHtml?: string | null;
  solution?: string;
  /** RFC 5322 Message-ID for this event — enables email threading. */
  emailMessageId?: string;
  /** Contact IDs to CC on public replies (visible to requester). */
  ccContactIds?: string[];
  /** Agent IDs that were mentioned — notify.service derives which of
   *  them are readonly (portal users) and CCs their emails too. */
  mentionedAgentIds?: string[];
  /** DB id of the ticket_followups row, used to pull threading history. */
  followupId?: string;
  /** True for internal notes (no requester/contact traffic). */
  isInternal?: boolean;
}

// ── Follower fan-out helper ───────────────────────────────────────────────
//
// Every ticket event should also reach everyone "following" the ticket
// (Zendesk/Freshdesk-style watchers). This helper computes the unique
// list of followers + current assignee, skipping the actor so you never
// get notified of your own action.

interface FanOutRecipient {
  userId: string | null;
  email: string;
  name: string | null;
}

async function getFanOutRecipients(evt: TicketEvent): Promise<FanOutRecipient[]> {
  const svc = getSvc();
  try {
    const { data: rows } = await svc
      .from('ticket_followers')
      .select(`agent:agents(id, name, email, user_id, is_active)`)
      .eq('ticket_id', evt.ticketId);

    const recipients = new Map<string, FanOutRecipient>();
    for (const r of (rows ?? []) as Array<{
      agent: { id: string; name: string | null; email: string | null; user_id: string | null; is_active: boolean } | null;
    }>) {
      const a = r.agent;
      if (!a || !a.email || a.is_active === false) continue;
      if (evt.agentUserId && a.user_id === evt.agentUserId) continue;
      recipients.set(a.email.toLowerCase(), {
        userId: a.user_id,
        email: a.email,
        name: a.name,
      });
    }

    // Ensure the current assignee is in the list even before the first
    // auto-follow has run for this ticket.
    if (evt.assignedAgentId) {
      const { data: a } = await svc
        .from('agents')
        .select('id, name, email, user_id, is_active')
        .eq('id', evt.assignedAgentId)
        .maybeSingle();
      const agent = a as { name: string | null; email: string | null; user_id: string | null; is_active: boolean } | null;
      if (agent?.email && agent.is_active !== false) {
        const key = agent.email.toLowerCase();
        if (!recipients.has(key) && agent.user_id !== (evt.agentUserId ?? null)) {
          recipients.set(key, { userId: agent.user_id, email: agent.email, name: agent.name });
        }
      }
    }

    // The actor already gets their own confirmation email from the
    // existing per-event code below — skip them here too.
    if (evt.agentEmail) recipients.delete(evt.agentEmail.toLowerCase());

    return [...recipients.values()];
  } catch (err) {
    console.error('[Notify] fan-out lookup failed:', err);
    return [];
  }
}

async function fanOutToFollowers(
  evt: TicketEvent,
  emailSubject: string,
  emailHtml: string,
  inAppTitle: string,
  inAppBody: string,
  emailHeaders?: Record<string, string>,
  emailAttachments?: EmailAttachment[],
) {
  const recipients = await getFanOutRecipients(evt);
  const link = `/home/tickets/${evt.ticketId}`;
  await Promise.all(
    recipients.map(async (r) => {
      const jobs: Promise<unknown>[] = [
        notifyEmail({
          to: r.email,
          subject: emailSubject,
          html: emailHtml,
          headers: emailHeaders,
          attachments: emailAttachments,
        }),
      ];
      if (r.userId) {
        jobs.push(
          notifyInApp(evt.tenantId, r.userId, inAppTitle, inAppBody, 'ticket', evt.ticketId, link),
        );
      }
      await Promise.all(jobs).catch(() => {});
    }),
  );
}

// ── Ticket Created ────────────────────────────────────────────────────────

export async function notifyTicketCreated(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Nuevo ticket ${evt.ticketNumber}`,
      `${evt.title} — ${evt.type} / ${evt.urgency}`,
      'ticket', evt.ticketId, link);
  }

  // Broadcast to the TDX staff team (admin / agent / supervisor roles). Portal
  // users ('readonly') are excluded — they should never see other clients'
  // tickets. The actor is also skipped because they already got the line above.
  try {
    const svc = getSvc();
    const { data: staff } = await svc
      .from('agents')
      .select('user_id')
      .eq('tenant_id', evt.tenantId)
      .eq('is_active', true)
      .in('role', ['admin', 'agent', 'supervisor'])
      .not('user_id', 'is', null);
    const broadcastBody = `${evt.title} — ${evt.type} / ${evt.urgency}`;
    await Promise.all(
      (staff ?? [])
        .map((a) => a.user_id as string)
        .filter((uid) => uid && uid !== evt.agentUserId)
        .map((uid) =>
          notifyInApp(
            evt.tenantId,
            uid,
            `Nuevo ticket ${evt.ticketNumber}`,
            broadcastBody,
            'ticket',
            evt.ticketId,
            link,
          ),
        ),
    );
  } catch (err) {
    console.error('[Notify] staff broadcast on create failed:', err);
  }

  if (evt.agentEmail) {
    await notifyEmail(evt.agentEmail,
      `🔔 Nuevo ticket: ${evt.ticketNumber}`,
      emailTemplate({
        preheader: `Nuevo ticket de soporte: ${evt.title}`,
        heading: 'Nuevo Ticket Creado',
        badgeText: evt.urgency.toUpperCase(),
        badgeColor: URGENCY_COLORS[evt.urgency] ?? '#6366f1',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Tipo', value: evt.type },
          { label: 'Urgencia', value: evt.urgency },
          { label: 'Cliente', value: evt.organization ?? 'N/A' },
        ],
        ctaText: 'Ver Ticket',
        ctaUrl: `https://itsm-web.vercel.app${link}`,
        footerNote: 'Por favor revisa este ticket y toma acción lo antes posible.',
      }));
  }

  if (evt.requesterEmail) {
    await notifyEmail(evt.requesterEmail,
      `✅ Ticket creado: ${evt.ticketNumber}`,
      emailTemplate({
        preheader: `Tu ticket ${evt.ticketNumber} ha sido creado`,
        heading: 'Tu Ticket Ha Sido Creado',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Estado', value: 'Nuevo — En espera de asignación' },
        ],
        footerNote: 'Nuestro equipo revisará tu solicitud y te notificaremos cuando haya actualizaciones. Gracias por tu paciencia.',
      }));
  }
}

// ── Ticket Assigned ───────────────────────────────────────────────────────

export async function notifyTicketAssigned(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Ticket asignado ${evt.ticketNumber}`,
      `Te asignaron "${evt.title}"`,
      'ticket', evt.ticketId, link);
  }

  if (evt.agentEmail) {
    await notifyEmail(evt.agentEmail,
      `📋 Ticket asignado: ${evt.ticketNumber}`,
      emailTemplate({
        preheader: `Se te ha asignado el ticket ${evt.ticketNumber}`,
        heading: 'Ticket Asignado a Ti',
        badgeText: evt.urgency.toUpperCase(),
        badgeColor: URGENCY_COLORS[evt.urgency] ?? '#6366f1',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Tipo', value: evt.type },
          { label: 'Urgencia', value: evt.urgency },
          { label: 'Cliente', value: evt.organization ?? 'N/A' },
        ],
        ctaText: 'Gestionar Ticket',
        ctaUrl: `https://itsm-web.vercel.app${link}`,
        footerNote: 'Este ticket requiere tu atención. Por favor revísalo y toma acción.',
      }));
  }

  // Followers — the previous assignee and anyone else watching the ticket
  // gets a "reassigned" heads-up.
  await fanOutToFollowers(
    evt,
    `🔄 Reasignado: ${evt.ticketNumber} → ${evt.agentName ?? 'nuevo agente'}`,
    emailTemplate({
      preheader: `${evt.ticketNumber} cambió de asignado`,
      heading: 'Ticket Reasignado',
      bodyRows: [
        { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
        { label: 'Título', value: evt.title },
        { label: 'Nuevo asignado', value: `<strong>${evt.agentName ?? '—'}</strong>` },
      ],
      ctaText: 'Ver Ticket',
      ctaUrl: `https://itsm-web.vercel.app${link}`,
      footerNote: 'Recibes este email porque sigues este ticket. Puedes dejar de seguirlo desde la vista del ticket.',
    }),
    `Reasignado ${evt.ticketNumber}`,
    `Ahora asignado a ${evt.agentName ?? 'otro agente'}`,
  );
}

// ── Status Changed ────────────────────────────────────────────────────────

export async function notifyTicketStatusChanged(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;
  const portalUrl = `https://itsm-web.vercel.app${link}`;

  // Requester — email
  if (evt.requesterEmail) {
    await notifyEmail(evt.requesterEmail,
      `📌 Actualización: ${evt.ticketNumber} — ${evt.status}`,
      emailTemplate({
        preheader: `Tu ticket ${evt.ticketNumber} cambió a estado: ${evt.status}`,
        heading: 'Actualización de Tu Ticket',
        badgeText: evt.status.toUpperCase().replace('_', ' '),
        badgeColor: STATUS_COLORS[evt.status] ?? '#6366f1',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Nuevo Estado', value: `<strong>${evt.status}</strong>` },
        ],
        ctaText: 'Ver Ticket',
        ctaUrl: portalUrl,
        footerNote: 'Te mantendremos informado sobre cualquier cambio adicional en tu solicitud.',
      }));
  }

  // Assignee — email + in-app
  if (evt.agentEmail) {
    await notifyEmail(evt.agentEmail,
      `📌 ${evt.ticketNumber} cambió a ${evt.status}`,
      emailTemplate({
        preheader: `El ticket ${evt.ticketNumber} cambió de estado`,
        heading: 'Cambio de Estado en Ticket Asignado',
        badgeText: evt.status.toUpperCase().replace('_', ' '),
        badgeColor: STATUS_COLORS[evt.status] ?? '#6366f1',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Nuevo Estado', value: `<strong>${evt.status}</strong>` },
          { label: 'Urgencia', value: evt.urgency },
        ],
        ctaText: 'Abrir Ticket',
        ctaUrl: portalUrl,
      }));
  }

  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Estado cambiado ${evt.ticketNumber}`,
      `${evt.title} → ${evt.status}`,
      'ticket', evt.ticketId, link);
  }

  // Followers (everyone else watching this ticket)
  await fanOutToFollowers(
    evt,
    `📌 ${evt.ticketNumber} cambió a ${evt.status}`,
    emailTemplate({
      preheader: `El ticket ${evt.ticketNumber} cambió de estado`,
      heading: 'Cambio de Estado en Ticket que Sigues',
      badgeText: evt.status.toUpperCase().replace('_', ' '),
      badgeColor: STATUS_COLORS[evt.status] ?? '#6366f1',
      bodyRows: [
        { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
        { label: 'Título', value: evt.title },
        { label: 'Nuevo Estado', value: `<strong>${evt.status}</strong>` },
        { label: 'Urgencia', value: evt.urgency },
      ],
      ctaText: 'Abrir Ticket',
      ctaUrl: portalUrl,
      footerNote: 'Recibes este email porque estás siguiendo este ticket. Puedes dejar de seguirlo desde la vista del ticket.',
    }),
    `Estado cambiado ${evt.ticketNumber}`,
    `${evt.title} → ${evt.status}`,
  );
}

// ── Comment Added ─────────────────────────────────────────────────────────

/**
 * Builds the RFC 5322 threading headers for a ticket email.
 *
 * Strategy:
 *   - Every followup gets its own Message-ID (passed in as emailMessageId).
 *   - In-Reply-To points to the previous followup's Message-ID, or to a
 *     synthetic ticket-root Message-ID if this is the first followup.
 *   - References walks the full chain so that even clients that only
 *     honor References (Apple Mail) still collapse the thread.
 *
 * The synthetic ticket root Message-ID is deterministic per ticket so
 * inbound replies from the requester (who never saw the first outbound
 * email's Message-ID because the ticket was created via portal/UI) still
 * land on the correct ticket.
 */
async function buildThreadingHeaders(
  ticketId: string,
  currentMessageId: string | undefined,
): Promise<Record<string, string>> {
  const rootId = `<ticket-${ticketId}-root@itsm.tdxcore.com>`;
  const headers: Record<string, string> = {};

  if (currentMessageId) {
    headers['Message-ID'] = `<${currentMessageId}>`;
  }

  try {
    const svc = getSvc();
    const { data: prior } = await svc
      .from('ticket_followups')
      .select('email_message_id, created_at')
      .eq('ticket_id', ticketId)
      .not('email_message_id', 'is', null)
      .order('created_at', { ascending: true });

    const priorIds = (prior ?? [])
      .map((r) => (r.email_message_id as string | null))
      .filter((v): v is string => Boolean(v))
      .filter((v) => v !== currentMessageId)
      .map((v) => `<${v}>`);

    const chain = [rootId, ...priorIds];
    if (chain.length > 0) {
      headers['References'] = chain.join(' ');
      headers['In-Reply-To'] = chain[chain.length - 1]!;
    } else {
      headers['In-Reply-To'] = rootId;
      headers['References'] = rootId;
    }
  } catch {
    // If the lookup fails, still provide a minimal thread root so replies
    // can attach to *some* parent. Worse case, the first email in the thread
    // starts a new Gmail conversation — harmless.
    headers['In-Reply-To'] = rootId;
    headers['References'] = rootId;
  }

  return headers;
}

/**
 * Pulls the last N followups for the ticket (public only) and renders a
 * Gmail-style quote block. We limit to the immediately previous followup
 * because the threading headers already let clients collapse the full
 * history — duplicating more than one quote in every outbound email
 * balloons message size without helping the reader.
 */
/**
 * Builds the "conversation history" block appended to every outbound email.
 *
 * Strategy:
 *   - Fetch up to the last N public followups for the ticket (excluding
 *     the current one we're about to send).
 *   - Resolve author names in bulk so we don't do N+1 queries.
 *   - Render each as a styled block (Gmail-quote style) in chronological
 *     order, oldest at the top.
 *
 * Why include history when RFC threading already groups messages? Because
 * Outlook (unlike Gmail) doesn't collapse thread participants inline —
 * each reply is a separate scroll. Having the history embedded means a
 * recipient can understand the state of the ticket from a single email
 * without hunting through prior ones.
 */
async function buildConversationHistoryHtml(
  ticketId: string,
  currentFollowupId: string | undefined,
): Promise<string> {
  try {
    const svc = getSvc();
    const { data } = await svc
      .from('ticket_followups')
      .select('id, content, content_html, is_private, created_at, author_id, author_type')
      .eq('ticket_id', ticketId)
      .eq('is_private', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const rows = ((data ?? []) as Array<{
      id: string;
      content: string;
      content_html: string | null;
      created_at: string;
      author_id: string;
      author_type: string | null;
    }>).filter((r) => r.id !== currentFollowupId);

    if (rows.length === 0) return '';

    // Bulk lookup of author names (agents table keyed by user_id; contacts
    // when author_type='contact').
    const agentUserIds = Array.from(
      new Set(
        rows.filter((r) => r.author_type !== 'contact').map((r) => r.author_id),
      ),
    );
    const contactIds = Array.from(
      new Set(
        rows.filter((r) => r.author_type === 'contact').map((r) => r.author_id),
      ),
    );

    const agentMap = new Map<string, string>();
    if (agentUserIds.length) {
      const { data: agents } = await svc
        .from('agents')
        .select('user_id, name')
        .in('user_id', agentUserIds);
      for (const a of (agents ?? []) as Array<{ user_id: string | null; name: string | null }>) {
        if (a.user_id) agentMap.set(a.user_id, a.name ?? 'Agente');
      }
    }
    const contactMap = new Map<string, string>();
    if (contactIds.length) {
      const { data: contacts } = await svc
        .from('contacts')
        .select('id, name')
        .in('id', contactIds);
      for (const c of (contacts ?? []) as Array<{ id: string; name: string | null }>) {
        contactMap.set(c.id, c.name ?? 'Cliente');
      }
    }

    const chronological = rows.slice().reverse();
    const items = chronological
      .map((r) => {
        const when = new Date(r.created_at).toLocaleString('es-ES', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        const name =
          r.author_type === 'contact'
            ? contactMap.get(r.author_id) ?? 'Cliente'
            : agentMap.get(r.author_id) ?? 'Agente';
        const body =
          r.content_html ?? escapeHtml(r.content).replace(/\n/g, '<br>');
        return `
          <div style="margin:10px 0;padding:10px 12px;border-left:3px solid #d1d5db;background:#f9fafb;border-radius:0 6px 6px 0;">
            <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">
              <strong style="color:#374151;">${escapeHtml(name)}</strong>
              <span style="margin:0 6px;">·</span>
              ${when}
            </div>
            <div style="font-size:13px;color:#374151;line-height:1.55;">
              ${body}
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;">
        <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:10px;">
          Historial de la conversación (${chronological.length})
        </div>
        ${items}
      </div>
    `;
  } catch {
    return '';
  }
}

/**
 * Pull images referenced by the email HTML out of Supabase Storage and
 * embed them as CID attachments. Returns a rewritten HTML that points at
 * `cid:<id>` URLs instead of external signed URLs, plus the attachment
 * list for Resend.
 *
 * Why: Outlook (and most corporate mail filters) block external images by
 * default — "Some content in this message has been blocked because the
 * sender isn't in your Safe senders list." CID attachments ship the image
 * inside the MIME part, so nothing is ever fetched from a third party and
 * the image renders immediately.
 *
 * Only URLs that look like our Supabase Storage (hostname match) are
 * embedded; other images stay untouched so an image that points at, say,
 * an external avatar doesn't get bundled.
 */
async function prepareEmailAssets(
  html: string,
): Promise<{ html: string; attachments: EmailAttachment[] }> {
  const supaBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supaHost = supaBaseUrl ? new URL(supaBaseUrl).host : '';
  if (!supaHost) return { html, attachments: [] };

  // Collect every img src in the HTML that points at our Supabase host.
  const imgRe = /<img\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>/gi;
  const seen = new Map<string, { cid: string; filename: string }>();
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const src = m[1]!;
    if (!src.includes(supaHost)) continue;
    if (seen.has(src)) continue;
    matches.push(src);
    const parsed = (() => {
      try {
        return new URL(src);
      } catch {
        return null;
      }
    })();
    const rawName = parsed ? parsed.pathname.split('/').pop() ?? 'image' : 'image';
    const filename = rawName.split('?')[0]?.replace(/[^a-zA-Z0-9._-]/g, '_') ?? 'image.png';
    const cid = `img-${crypto.randomUUID()}`;
    seen.set(src, { cid, filename });
  }

  if (matches.length === 0) return { html, attachments: [] };

  // Download each image via service-role from Storage and encode as base64.
  // Signed URLs work for this too — we just fetch and buffer the bytes.
  const attachments: EmailAttachment[] = [];
  for (const src of matches) {
    try {
      const res = await fetch(src);
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') ?? 'image/png';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) continue;
      const { cid, filename } = seen.get(src)!;
      attachments.push({
        filename,
        content: buf.toString('base64'),
        contentType,
        contentId: cid,
      });
    } catch {
      /* skip failed fetches — the original URL stays as fallback */
    }
  }

  // Rewrite src="url" → src="cid:xxx" for successfully downloaded images.
  let rewritten = html;
  for (const [src, { cid }] of seen.entries()) {
    if (!attachments.find((a) => a.contentId === cid)) continue;
    // Use a regex that matches both single and escaped quote variants.
    rewritten = rewritten.split(`"${src}"`).join(`"cid:${cid}"`);
    rewritten = rewritten.split(`'${src}'`).join(`'cid:${cid}'`);
  }

  return { html: rewritten, attachments };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Resolves emails for the principals we want to CC on a public reply.
 *
 * Two sources:
 *   - contact IDs  → `contacts.email`
 *   - agent IDs    → `agents.email` BUT only when role='readonly' (portal
 *                    users of the client). Staff agents are never CC'd on
 *                    the customer-visible email; they're silent followers.
 */
async function resolveCcEmails(
  tenantId: string,
  contactIds: string[],
  agentIds: string[],
  /** Emails already present in the To: header — typically the requester.
   *  We drop any match (case-insensitive) so the same address never
   *  appears twice, and so Gmail's "to me + 1 more" label doesn't lie. */
  excludeEmails: Array<string | null | undefined> = [],
): Promise<string[]> {
  const emails = new Set<string>();
  const exclude = new Set(
    excludeEmails
      .filter((e): e is string => Boolean(e))
      .map((e) => e.toLowerCase()),
  );
  try {
    const svc = getSvc();

    if (contactIds.length) {
      const { data } = await svc
        .from('contacts')
        .select('email')
        .eq('tenant_id', tenantId)
        .in('id', contactIds);
      for (const r of (data ?? []) as Array<{ email: string | null }>) {
        if (!r.email) continue;
        const e = r.email.toLowerCase();
        if (exclude.has(e)) continue;
        emails.add(e);
      }
    }

    if (agentIds.length) {
      const { data } = await svc
        .from('agents')
        .select('email, role')
        .eq('tenant_id', tenantId)
        .eq('role', 'readonly')
        .in('id', agentIds);
      for (const r of (data ?? []) as Array<{ email: string | null; role: string | null }>) {
        if (!r.email || r.role !== 'readonly') continue;
        const e = r.email.toLowerCase();
        if (exclude.has(e)) continue;
        emails.add(e);
      }
    }
  } catch {
    /* non-fatal */
  }
  return Array.from(emails);
}

export async function notifyTicketCommented(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;
  const portalUrl = `https://itsm-web.vercel.app${link}`;

  const subject = `[#${evt.ticketNumber}] ${evt.title}`;
  const headers = await buildThreadingHeaders(evt.ticketId, evt.emailMessageId);
  const history = await buildConversationHistoryHtml(evt.ticketId, evt.followupId);
  const ccEmails = evt.isInternal
    ? []
    : await resolveCcEmails(
        evt.tenantId,
        evt.ccContactIds ?? [],
        evt.mentionedAgentIds ?? [],
        [evt.requesterEmail, evt.agentEmail],
      );

  // Render the comment body: prefer the sanitized HTML from Tiptap,
  // fall back to plain text with newline → <br>.
  const commentBody = evt.commentHtml
    ? evt.commentHtml
    : `<div style="white-space:pre-wrap;line-height:1.5;">${escapeHtml(evt.comment ?? '')}</div>`;

  // Build the email body once — same layout for requester and followers,
  // only the header/footer note change. The last step runs the HTML
  // through prepareEmailAssets which rewrites image URLs to CID refs and
  // returns the matching attachment list.
  async function assemble(params: {
    heading: string;
    preheader: string;
    footerNote: string;
    badgeText?: string;
    badgeColor?: string;
    messageLabel: string;
  }): Promise<{ html: string; attachments: EmailAttachment[] }> {
    const rawHtml = emailTemplate({
      preheader: params.preheader,
      heading: params.heading,
      badgeText: params.badgeText,
      badgeColor: params.badgeColor,
      bodyRows: [
        { label: 'Ticket', value: `<strong>#${evt.ticketNumber}</strong>` },
        { label: 'Por', value: `<strong>${evt.agentName ?? 'Equipo de Soporte'}</strong>` },
        {
          label: params.messageLabel,
          value: `<div style="padding:12px;background:#f0f4ff;border-radius:6px;border-left:3px solid #4f46e5;line-height:1.55;">${commentBody}</div>${history}`,
        },
      ],
      ctaText: 'Abrir ticket',
      ctaUrl: portalUrl,
      footerNote: params.footerNote,
    });
    return prepareEmailAssets(rawHtml);
  }

  // 1. Email to requester (public reply only). CCs visible contacts + portal users.
  if (!evt.isInternal && evt.requesterEmail && evt.comment) {
    const { html, attachments } = await assemble({
      heading: 'Nueva respuesta en tu ticket',
      preheader: `${evt.agentName ?? 'Soporte'} respondió a tu ticket ${evt.ticketNumber}`,
      messageLabel: 'Mensaje',
      footerNote:
        'Puedes responder a este email — tu respuesta quedará registrada automáticamente en el ticket.',
    });
    await notifyEmail({
      to: evt.requesterEmail,
      cc: ccEmails,
      subject,
      headers,
      html,
      attachments,
    });
  }

  // 2. In-app notification to the actor. We intentionally DO NOT send a
  //    confirmation email to the actor — the reply is already visible in
  //    their UI and an in-app toast fires. Historically this dropped a
  //    "Respuesta registrada" email into the author's inbox for every
  //    single reply, which turned into noise (multiple copies per ticket
  //    thanks to RFC threading). The in-app notification carries the same
  //    information.
  if (evt.agentUserId) {
    await notifyInApp(
      evt.tenantId,
      evt.agentUserId,
      `Comentario en ${evt.ticketNumber}`,
      `${evt.agentName ?? 'Agente'}: ${(evt.comment ?? '').slice(0, 100)}`,
      'ticket',
      evt.ticketId,
      link,
    );
  }

  // 3. Follower fan-out — stays internal. Same subject/headers so everyone
  //    sees the same thread; contacts are never CC'd on follower copies.
  if (evt.comment) {
    const { html, attachments } = await assemble({
      heading: evt.isInternal ? 'Nota interna nueva' : 'Nueva respuesta pública',
      preheader: `${evt.agentName ?? 'Un agente'} comentó en ${evt.ticketNumber}`,
      badgeText: evt.isInternal ? 'INTERNA' : undefined,
      badgeColor: evt.isInternal ? '#f59e0b' : undefined,
      messageLabel: evt.isInternal ? 'Nota' : 'Respuesta',
      footerNote: 'Recibes este email porque estás siguiendo este ticket.',
    });
    await fanOutToFollowers(
      evt,
      subject,
      html,
      `Comentario en ${evt.ticketNumber}`,
      `${evt.agentName ?? 'Agente'}: ${evt.comment.slice(0, 100)}`,
      headers,
      attachments,
    );
  }
}

// ── Ticket Resolved ───────────────────────────────────────────────────────

export async function notifyTicketResolved(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

  if (evt.requesterEmail) {
    await notifyEmail(evt.requesterEmail,
      `✅ Ticket resuelto: ${evt.ticketNumber}`,
      emailTemplate({
        preheader: `Tu ticket ${evt.ticketNumber} ha sido resuelto`,
        heading: 'Tu Ticket Ha Sido Resuelto',
        badgeText: 'RESUELTO',
        badgeColor: '#10b981',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Solución', value: `<div style="padding:10px;background:#f0fdf4;border-radius:6px;border-left:3px solid #10b981;">${evt.solution ?? 'Ver detalles en el portal'}</div>` },
        ],
        footerNote: '¿El problema persiste? Puedes reabrir este ticket respondiendo a este correo o desde el portal de soporte. Tu satisfacción es nuestra prioridad.',
      }));
  }

  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Resuelto ${evt.ticketNumber}`,
      `${evt.title} ha sido resuelto`,
      'ticket', evt.ticketId, link);
  }

  await fanOutToFollowers(
    evt,
    `✅ Resuelto: ${evt.ticketNumber}`,
    emailTemplate({
      preheader: `${evt.ticketNumber} marcado como resuelto`,
      heading: 'Ticket Resuelto',
      badgeText: 'RESUELTO',
      badgeColor: '#10b981',
      bodyRows: [
        { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
        { label: 'Título', value: evt.title },
        { label: 'Solución', value: evt.solution ?? 'Ver detalles en el portal' },
      ],
      ctaText: 'Ver Detalle',
      ctaUrl: `https://itsm-web.vercel.app${link}`,
      footerNote: 'Recibes este email porque estás siguiendo este ticket.',
    }),
    `Resuelto ${evt.ticketNumber}`,
    `${evt.title} ha sido resuelto`,
  );
}
