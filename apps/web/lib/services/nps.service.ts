import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

import { notifyEmail } from './notify.service';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Queue an NPS survey for a ticket that just reached a terminal status
 * (resolved / closed). The actual email goes out via the csat-dispatcher
 * cron ~5 minutes later — that delay gives the customer a moment to
 * register the resolution without losing context. Research cited by
 * Zendesk shows 5-10 min post-close outperforms 24h.
 *
 * Safe to call multiple times: the unique index on nps_surveys guarantees
 * one pending survey per ticket.
 */
export async function queueNpsForTicket(params: {
  tenantId: string;
  ticketId: string;
  recipientEmail: string;
  organizationId?: string | null;
  agentId?: string | null;
}): Promise<void> {
  if (!params.recipientEmail) return;

  const svc = getSvc();
  const token = randomBytes(24).toString('base64url');

  const { error } = await svc.from('nps_surveys').insert({
    tenant_id: params.tenantId,
    ticket_id: params.ticketId,
    organization_id: params.organizationId ?? null,
    agent_id: params.agentId ?? null,
    recipient_email: params.recipientEmail,
    token,
  });

  // Unique-index violation is expected when a ticket is re-closed — swallow it.
  if (error && !error.message.includes('uniq_nps_per_ticket')) {
    console.error('[nps.queue] insert failed:', error.message);
  }
}

export interface PendingNpsRow {
  id: string;
  tenant_id: string;
  ticket_id: string;
  recipient_email: string;
  token: string;
}

/**
 * Fetch pending surveys older than the grace window (5 min by default) and
 * send them. Used by the csat-dispatcher cron.
 */
export async function dispatchPendingNps(graceMinutes = 5): Promise<{
  picked: number;
  sent: number;
  failed: number;
}> {
  const svc = getSvc();

  const cutoffIso = new Date(Date.now() - graceMinutes * 60_000).toISOString();

  const { data: pending } = await svc
    .from('nps_surveys')
    .select('id, tenant_id, ticket_id, recipient_email, token, ticket:tickets(ticket_number, title)')
    .is('sent_at', null)
    .lt('created_at', cutoffIso)
    .limit(200);

  if (!pending || pending.length === 0) {
    return { picked: 0, sent: 0, failed: 0 };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://itsm-web.vercel.app';

  let sent = 0;
  let failed = 0;
  // Supabase's typed client returns joined rows as arrays; we only expect
  // one ticket per survey, so we normalize to the first element (or null).
  type PendingRowRaw = PendingNpsRow & {
    ticket:
      | { ticket_number: string; title: string | null }
      | Array<{ ticket_number: string; title: string | null }>
      | null;
  };
  for (const raw of pending as unknown as PendingRowRaw[]) {
    const ticketMeta = Array.isArray(raw.ticket) ? raw.ticket[0] ?? null : raw.ticket;
    const ticketNumber = ticketMeta?.ticket_number ?? raw.ticket_id.slice(0, 8);
    const ticketTitle = ticketMeta?.title ?? '';
    const surveyUrl = `${base}/nps/${raw.token}`;

    try {
      await notifyEmail(
        raw.recipient_email,
        `¿Cómo estuvo tu atención en ${ticketNumber}?`,
        npsEmail({
          ticketNumber,
          ticketTitle,
          surveyUrl,
        }),
      );
      await svc
        .from('nps_surveys')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', raw.id);
      sent++;
    } catch (err) {
      failed++;
      console.error('[nps.dispatch] send failed:', raw.id, err);
    }
  }

  return { picked: pending.length, sent, failed };
}

function npsEmail(p: {
  ticketNumber: string;
  ticketTitle: string;
  surveyUrl: string;
}): string {
  const scale = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((n) => {
      const color = n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#10b981';
      return `<a href="${p.surveyUrl}?score=${n}" style="display:inline-block;width:32px;height:32px;line-height:32px;margin:2px;border-radius:6px;background:${color};color:#fff;text-decoration:none;font-size:13px;font-weight:700;text-align:center;">${n}</a>`;
    })
    .join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Tu opinión</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px;">
  <span style="color:#ffffff;font-size:16px;font-weight:700;">NovaDesk ITSM</span>
</td></tr>
<tr><td style="padding:28px 32px;">
  <h1 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">¿Cómo estuvo tu atención?</h1>
  <div style="width:40px;height:3px;background:#4f46e5;border-radius:2px;margin:12px 0 20px;"></div>
  <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">
    El ticket <strong>${p.ticketNumber}</strong> fue cerrado. Queremos saber tu experiencia.
  </p>
  <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
    <strong>En una escala del 0 al 10, ¿qué tan probable es que recomiendes nuestro servicio a un colega?</strong>
  </p>
  <div style="text-align:center;margin:20px 0;">
    ${scale}
  </div>
  <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
    0 = nada probable · 10 = totalmente probable
  </p>
  <div style="text-align:center;margin:28px 0 8px;">
    <a href="${p.surveyUrl}" style="display:inline-block;padding:10px 28px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Responder encuesta</a>
  </div>
</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.5;">
  Tu feedback nos ayuda a mejorar. El enlace expira en 30 días.<br>
  © ${new Date().getFullYear()} TDX Core.
</td></tr>
</table></td></tr></table></body></html>`;
}
