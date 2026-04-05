import { createClient } from '@supabase/supabase-js';

/**
 * Simple notification service — sends in-app + email notifications
 * without depending on the complex template/queue system.
 */

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ---------------------------------------------------------------------------
// In-App Notification
// ---------------------------------------------------------------------------

export async function notifyInApp(
  tenantId: string,
  userId: string,
  title: string,
  body: string,
  resourceType: string = 'ticket',
  resourceId?: string,
  link?: string,
) {
  const svc = getSvc();
  try {
    await svc.from('notifications').insert({
      tenant_id: tenantId,
      user_id: userId,
      title,
      body,
      is_read: false,
      resource_type: resourceType,
      resource_id: resourceId ?? null,
      link: link ?? null,
    });
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// Email Notification via Resend
// ---------------------------------------------------------------------------

export async function notifyEmail(
  to: string,
  subject: string,
  body: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Notify] RESEND_API_KEY not set, skipping email');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'NovaDesk ITSM <notifications@itsm.tdxcore.com>',
        to: [to],
        subject,
        text: body,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Notify] Email failed:', res.status, err);
    }
  } catch (err) {
    console.error('[Notify] Email error:', err);
  }
}

// ---------------------------------------------------------------------------
// Ticket Event Notifications — High-level triggers
// ---------------------------------------------------------------------------

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

export async function notifyTicketCreated(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

  // In-app to all agents (notify assigned or first available)
  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Nuevo ticket ${evt.ticketNumber}`,
      `${evt.title} — ${evt.type} / ${evt.urgency}`,
      'ticket', evt.ticketId, link);
  }

  // Email to agent
  if (evt.agentEmail) {
    await notifyEmail(evt.agentEmail,
      `Nuevo ticket: ${evt.ticketNumber} — ${evt.title}`,
      `Se ha creado un nuevo ticket.\n\nTicket: ${evt.ticketNumber}\nTítulo: ${evt.title}\nTipo: ${evt.type}\nUrgencia: ${evt.urgency}\nCliente: ${evt.organization ?? 'N/A'}\n\nVer ticket: ${link}\n\n— NovaDesk ITSM`);
  }

  // Email to requester
  if (evt.requesterEmail) {
    await notifyEmail(evt.requesterEmail,
      `Ticket creado: ${evt.ticketNumber} — ${evt.title}`,
      `Hola,\n\nTu ticket ${evt.ticketNumber} ha sido creado exitosamente.\n\nTítulo: ${evt.title}\nEstado: ${evt.status}\n\nTe notificaremos cuando haya actualizaciones.\n\n— NovaDesk ITSM`);
  }
}

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
      `Ticket asignado: ${evt.ticketNumber}`,
      `El ticket ${evt.ticketNumber} "${evt.title}" te ha sido asignado.\n\nTipo: ${evt.type}\nUrgencia: ${evt.urgency}\nCliente: ${evt.organization ?? 'N/A'}\n\nVer: ${link}\n\n— NovaDesk ITSM`);
  }
}

export async function notifyTicketStatusChanged(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

  // Email to requester
  if (evt.requesterEmail) {
    await notifyEmail(evt.requesterEmail,
      `Actualización ticket ${evt.ticketNumber}`,
      `Hola,\n\nTu ticket ${evt.ticketNumber} "${evt.title}" ha cambiado de estado.\n\nNuevo estado: ${evt.status}\n\n— NovaDesk ITSM`);
  }

  // In-app to assigned agent
  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Estado cambiado ${evt.ticketNumber}`,
      `${evt.title} → ${evt.status}`,
      'ticket', evt.ticketId, link);
  }
}

export async function notifyTicketCommented(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

  if (evt.requesterEmail && evt.comment) {
    await notifyEmail(evt.requesterEmail,
      `Nuevo comentario en ${evt.ticketNumber}`,
      `Hola,\n\nSe agregó un comentario a tu ticket ${evt.ticketNumber} "${evt.title}".\n\nComentario:\n${evt.comment}\n\n— NovaDesk ITSM`);
  }

  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Comentario en ${evt.ticketNumber}`,
      `${evt.agentName ?? 'Agente'}: ${(evt.comment ?? '').slice(0, 100)}`,
      'ticket', evt.ticketId, link);
  }
}

export async function notifyTicketResolved(evt: TicketEvent) {
  const link = `/home/tickets/${evt.ticketId}`;

  if (evt.requesterEmail) {
    await notifyEmail(evt.requesterEmail,
      `Ticket resuelto: ${evt.ticketNumber}`,
      `Hola,\n\nTu ticket ${evt.ticketNumber} "${evt.title}" ha sido resuelto.\n\nSolución: ${evt.solution ?? 'Ver detalles en el portal'}\n\nSi el problema persiste, puedes reabrir el ticket.\n\n— NovaDesk ITSM`);
  }

  if (evt.agentUserId) {
    await notifyInApp(evt.tenantId, evt.agentUserId,
      `Resuelto ${evt.ticketNumber}`,
      `${evt.title} ha sido resuelto`,
      'ticket', evt.ticketId, link);
  }
}
