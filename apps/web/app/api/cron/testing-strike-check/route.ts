import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { notifyEmail, notifyInApp } from '~/lib/services/notify.service';
import { queueNpsForTicket } from '~/lib/services/nps.service';

/**
 * Vercel Cron Job — Testing Strike Process
 *
 * Schedule: hourly (`0 * * * *`) — matches Freshdesk/Zendesk supervisor-rule cadence.
 *
 * Tickets parked in 'testing' accumulate strikes at 24/48/72 hours:
 *   S1 → reminder email + in-app to requester
 *   S2 → final warning to requester AND agent/manager
 *   S3 → auto-transition to 'resolved' (not 'closed', so CSAT still runs
 *        and the customer can still reopen through the portal)
 *
 * Client replies do NOT reset the counter. Only an explicit status change
 * out of 'testing' resets strikes (DB trigger) — per product decision.
 */

const STRIKE_HOURS = [24, 48, 72] as const;
const AUTO_CLOSE_STRIKE = 3;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Pull only tickets currently in testing with a recorded entry time.
  // Upper bound on rows to keep one run bounded; a stuck tenant still
  // clears on subsequent hourly runs.
  const { data: tickets, error } = await svc
    .from('tickets')
    .select(
      'id, tenant_id, ticket_number, title, status, custom_fields, testing_strikes, requester_email, assigned_agent_id, organization_id',
    )
    .eq('status', 'testing')
    .is('deleted_at', null)
    .limit(500);

  if (error) {
    console.error('[cron/testing-strike-check] fetch error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tickets || tickets.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  const now = Date.now();
  let strike1 = 0;
  let strike2 = 0;
  let autoClosed = 0;

  for (const t of tickets) {
    const enteredAtStr = (t.custom_fields as { testing_entered_at?: string } | null)
      ?.testing_entered_at;
    if (!enteredAtStr) continue;

    const ageHours = (now - new Date(enteredAtStr).getTime()) / 3_600_000;
    const currentStrikes = t.testing_strikes ?? 0;

    // Which strike threshold has been crossed but not yet recorded?
    let nextStrike = 0;
    if (ageHours >= STRIKE_HOURS[0] && currentStrikes < 1) nextStrike = 1;
    if (ageHours >= STRIKE_HOURS[1] && currentStrikes < 2) nextStrike = 2;
    if (ageHours >= STRIKE_HOURS[2] && currentStrikes < 3) nextStrike = 3;
    if (nextStrike === 0) continue;

    const nowIso = new Date().toISOString();

    // Strike 3 = auto-close to 'resolved'.
    if (nextStrike === AUTO_CLOSE_STRIKE) {
      await svc
        .from('tickets')
        .update({
          status: 'resolved',
          resolved_at: nowIso,
          testing_strikes: 3,
          last_testing_strike_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', t.id);

      await svc.from('ticket_followups').insert({
        ticket_id: t.id,
        tenant_id: t.tenant_id,
        content:
          'Ticket cerrado automáticamente: llevaba 72 horas en Testing sin confirmación del solicitante (3 recordatorios agotados).',
        is_private: false,
        author_type: 'system',
      });

      if (t.requester_email) {
        await notifyEmail(
          t.requester_email,
          `Ticket ${t.ticket_number} cerrado por inactividad`,
          autoClosedEmail({
            ticketNumber: t.ticket_number,
            title: t.title ?? '',
            ticketUrl: buildTicketUrl(t.id),
          }),
        ).catch(() => {});

        // Still queue the CSAT survey — auto-close shouldn't bypass feedback.
        await queueNpsForTicket({
          tenantId: t.tenant_id,
          ticketId: t.id,
          recipientEmail: t.requester_email,
          organizationId: t.organization_id ?? null,
          agentId: t.assigned_agent_id ?? null,
        }).catch(() => {});
      }
      autoClosed++;
      continue;
    }

    // Strike 1 or 2 → send reminder + increment counter.
    await svc
      .from('tickets')
      .update({
        testing_strikes: nextStrike,
        last_testing_strike_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', t.id);

    if (t.requester_email) {
      const hoursRemaining = (AUTO_CLOSE_STRIKE - nextStrike) * 24;
      await notifyEmail(
        t.requester_email,
        nextStrike === 1
          ? `Recordatorio: confirma el ticket ${t.ticket_number}`
          : `Último aviso: el ticket ${t.ticket_number} se cerrará en ${hoursRemaining}h`,
        strikeReminderEmail({
          ticketNumber: t.ticket_number,
          title: t.title ?? '',
          strike: nextStrike,
          hoursRemaining,
          ticketUrl: buildTicketUrl(t.id),
        }),
      ).catch(() => {});
    }

    // On strike 2 also ping the assigned agent so they know the customer
    // is about to trigger an auto-close they may want to prevent.
    if (nextStrike === 2 && t.assigned_agent_id) {
      const { data: agent } = await svc
        .from('agents')
        .select('user_id')
        .eq('id', t.assigned_agent_id)
        .maybeSingle();
      if (agent?.user_id) {
        await notifyInApp(
          t.tenant_id,
          agent.user_id,
          `⚠️ Ticket ${t.ticket_number} en testing hace 48h`,
          'Se enviará cierre automático en 24h si no hay respuesta del cliente.',
          'ticket',
          t.id,
          `/home/tickets/${t.id}`,
        ).catch(() => {});
      }
    }

    if (nextStrike === 1) strike1++;
    else strike2++;
  }

  return NextResponse.json({
    ok: true,
    checked: tickets.length,
    strike1,
    strike2,
    autoClosed,
  });
}

function buildTicketUrl(ticketId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://itsm-web.vercel.app';
  return `${base}/home/tickets/${ticketId}`;
}

function strikeReminderEmail(p: {
  ticketNumber: string;
  title: string;
  strike: number;
  hoursRemaining: number;
  ticketUrl: string;
}): string {
  const isFinal = p.strike === 2;
  const heading = isFinal
    ? `Último aviso — ${p.ticketNumber}`
    : `Recordatorio — ${p.ticketNumber}`;
  const intro = isFinal
    ? `Tu ticket lleva 48 horas en <strong>Testing</strong>. Si no confirmas el resultado en las próximas ${p.hoursRemaining} horas, lo cerraremos automáticamente.`
    : `Tu ticket está en <strong>Testing</strong> hace 24 horas esperando tu confirmación. Valida la solución o coméntanos si algo no quedó como esperabas.`;

  return baseTemplate({
    heading,
    preheader: intro,
    body: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">${intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:130px;">Ticket</td><td style="padding:8px 0;color:#1f2937;font-size:13px;font-weight:500;">${p.ticketNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Título</td><td style="padding:8px 0;color:#1f2937;font-size:13px;font-weight:500;">${escapeHtml(p.title)}</td></tr>
      </table>
    `,
    ctaText: 'Revisar ticket',
    ctaUrl: p.ticketUrl,
  });
}

function autoClosedEmail(p: {
  ticketNumber: string;
  title: string;
  ticketUrl: string;
}): string {
  return baseTemplate({
    heading: `Ticket ${p.ticketNumber} cerrado`,
    preheader: 'Cerrado automáticamente por inactividad en Testing',
    body: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
        Cerramos este ticket automáticamente porque llevaba 72 horas en Testing sin
        confirmación. Si el problema no quedó resuelto, puedes reabrirlo desde el
        portal cuando gustes.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:130px;">Ticket</td><td style="padding:8px 0;color:#1f2937;font-size:13px;font-weight:500;">${p.ticketNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Título</td><td style="padding:8px 0;color:#1f2937;font-size:13px;font-weight:500;">${escapeHtml(p.title)}</td></tr>
      </table>
    `,
    ctaText: 'Ver ticket',
    ctaUrl: p.ticketUrl,
  });
}

function baseTemplate({
  heading,
  preheader,
  body,
  ctaText,
  ctaUrl,
}: {
  heading: string;
  preheader: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
}): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="display:none;font-size:1px;color:#f4f4f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px;">
  <span style="color:#ffffff;font-size:16px;font-weight:700;">NovaDesk ITSM</span>
</td></tr>
<tr><td style="padding:28px 32px;">
  <h1 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">${heading}</h1>
  <div style="width:40px;height:3px;background:#4f46e5;border-radius:2px;margin:12px 0 20px;"></div>
  ${body}
  <div style="text-align:center;margin:28px 0 8px;">
    <a href="${ctaUrl}" style="display:inline-block;padding:10px 28px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">${ctaText}</a>
  </div>
</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.5;">
  <strong style="color:#6b7280;">NovaDesk ITSM</strong> — Este es un correo automático.<br>
  © ${new Date().getFullYear()} TDX Core.
</td></tr>
</table></td></tr></table></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
