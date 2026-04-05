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

export async function notifyEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[Notify] RESEND_API_KEY not set'); return; }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'NovaDesk ITSM <notifications@itsm.tdxcore.com>',
        to: [to], subject, html,
      }),
    });
    if (!res.ok) console.error('[Notify] Email failed:', res.status, await res.text());
  } catch (err) { console.error('[Notify] Email error:', err); }
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
  agentUserId?: string;
  agentEmail?: string;
  agentName?: string;
  comment?: string;
  solution?: string;
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
}

// ── Status Changed ────────────────────────────────────────────────────────

export async function notifyTicketStatusChanged(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

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
        footerNote: 'Te mantendremos informado sobre cualquier cambio adicional en tu solicitud.',
      }));
  }

  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Estado cambiado ${evt.ticketNumber}`,
      `${evt.title} → ${evt.status}`,
      'ticket', evt.ticketId, link);
  }
}

// ── Comment Added ─────────────────────────────────────────────────────────

export async function notifyTicketCommented(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;
  const portalUrl = `https://itsm-web.vercel.app${link}`;

  // 1. Email to requester (Public Reply only — internal notes don't reach here)
  if (evt.requesterEmail && evt.comment) {
    await notifyEmail(evt.requesterEmail,
      `💬 RE: ${evt.ticketNumber} — ${evt.title}`,
      emailTemplate({
        preheader: `${evt.agentName ?? 'Soporte'} respondió a tu ticket ${evt.ticketNumber}`,
        heading: 'Nueva Respuesta en Tu Ticket',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Respondido por', value: `<strong>${evt.agentName ?? 'Equipo de Soporte'}</strong>` },
          { label: 'Respuesta', value: `<div style="padding:12px;background:#f0f4ff;border-radius:6px;border-left:3px solid #4f46e5;font-style:italic;line-height:1.5;">${evt.comment}</div>` },
        ],
        ctaText: 'Ver Ticket en Portal',
        ctaUrl: portalUrl,
        footerNote: 'Si necesitas responder, puedes hacerlo directamente desde el portal de soporte haciendo click en el botón de arriba.',
      }));
  }

  // 2. Confirmation email to agent (copy of their own reply)
  if (evt.agentEmail && evt.comment) {
    await notifyEmail(evt.agentEmail,
      `✅ Respuesta registrada: ${evt.ticketNumber}`,
      emailTemplate({
        preheader: `Tu respuesta en ${evt.ticketNumber} fue enviada al requester`,
        heading: 'Respuesta Registrada',
        bodyRows: [
          { label: 'Ticket', value: `<strong>${evt.ticketNumber}</strong>` },
          { label: 'Título', value: evt.title },
          { label: 'Enviado a', value: evt.requesterEmail ?? 'Requester' },
          { label: 'Tu respuesta', value: `<div style="padding:12px;background:#f0fdf4;border-radius:6px;border-left:3px solid #10b981;line-height:1.5;">${evt.comment}</div>` },
        ],
        ctaText: 'Ver Ticket',
        ctaUrl: portalUrl,
      }));
  }

  // 3. In-app notification to agent
  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Comentario en ${evt.ticketNumber}`,
      `${evt.agentName ?? 'Agente'}: ${(evt.comment ?? '').slice(0, 100)}`,
      'ticket', evt.ticketId, link);
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
}
