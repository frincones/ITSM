'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';

/**
 * Reopen a ticket from the public portal. The portal is token-authed (no
 * Supabase session) so we validate: portal token → organization → ticket
 * belongs to that org, and if the ticket carries a requester_email we
 * require the caller to supply the same email.
 */
export async function reopenTicketFromPortal(params: {
  token: string;
  ticketId: string;
  email?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const org = await resolveOrgByPortalToken(params.token);
  if (!org) return { ok: false, error: 'Portal no válido' };

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: ticket } = await svc
    .from('tickets')
    .select('id, tenant_id, organization_id, status, requester_email, reopened_count')
    .eq('id', params.ticketId)
    .eq('tenant_id', org.tenant_id)
    .maybeSingle();

  if (!ticket) return { ok: false, error: 'Ticket no encontrado' };
  if (ticket.organization_id && ticket.organization_id !== org.id) {
    return { ok: false, error: 'Ticket no pertenece a esta organización' };
  }
  if (ticket.requester_email && ticket.requester_email !== params.email) {
    return { ok: false, error: 'El correo no coincide con el solicitante' };
  }
  if (!['resolved', 'closed'].includes(ticket.status)) {
    return { ok: false, error: 'Este ticket no puede reabrirse en su estado actual' };
  }

  const nowIso = new Date().toISOString();
  const { error } = await svc
    .from('tickets')
    .update({
      status: 'reopened',
      last_reopened_at: nowIso,
      reopened_count: (ticket.reopened_count ?? 0) + 1,
      resolved_at: null,
      closed_at: null,
      updated_at: nowIso,
    })
    .eq('id', ticket.id);

  if (error) return { ok: false, error: error.message };

  await svc.from('ticket_followups').insert({
    ticket_id: ticket.id,
    tenant_id: ticket.tenant_id,
    content: `Ticket reabierto desde el portal por ${params.email ?? 'el solicitante'}.`,
    is_private: false,
    author_type: 'system',
  });

  revalidatePath(`/portal/${params.token}/tickets/${params.ticketId}`);
  return { ok: true };
}
