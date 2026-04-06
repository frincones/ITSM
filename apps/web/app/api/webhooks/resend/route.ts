import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------- */
/*  POST /api/webhooks/resend — Handle inbound email replies from Resend       */
/*                                                                             */
/*  Flow:                                                                      */
/*  1. Resend sends webhook when email arrives at *@itsm.tdxcore.com           */
/*  2. We extract ticket number from subject (RE: TKT-xxxx or PDZ-xxxx)        */
/*  3. Fetch full email body from Resend API                                   */
/*  4. Insert as followup (public reply from requester) in the ticket          */
/*  5. Send in-app notification to assigned agent                              */
/* -------------------------------------------------------------------------- */

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();

    // Only handle email.received events
    if (event.type !== 'email.received') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { email_id, from, to, subject } = event.data ?? {};

    console.log('[Resend Inbound]', { email_id, from, subject });

    if (!email_id || !subject) {
      return NextResponse.json({ ok: true, skipped: 'no email_id or subject' });
    }

    // ── Extract ticket number from subject ────────────────────────────
    // Matches: RE: TKT-2604-00289, Re: PDZ-2601-00005, Fwd: TKT-xxx, etc.
    const ticketMatch = subject.match(/(TKT-\d{4}-\d{5}|PDZ-\d{4}-\d{5})/i);

    if (!ticketMatch) {
      console.log('[Resend Inbound] No ticket number found in subject:', subject);
      return NextResponse.json({ ok: true, skipped: 'no ticket number in subject' });
    }

    const ticketNumber = ticketMatch[1]!.toUpperCase();
    console.log('[Resend Inbound] Ticket:', ticketNumber);

    // ── Fetch full email body from Resend API ─────────────────────────
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    let emailBody = '';
    try {
      // Use the Received Emails API (not the Sent Emails API)
      const emailRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
        headers: { 'Authorization': `Bearer ${resendKey}` },
      });

      if (emailRes.ok) {
        const emailData = await emailRes.json();
        // Resend returns text and/or html body
        emailBody = emailData.text ?? emailData.html ?? '';

        // Clean up common reply artifacts
        emailBody = cleanEmailReply(emailBody);
      } else {
        const errText = await emailRes.text().catch(() => '');
        console.error('[Resend Inbound] Failed to fetch email body:', emailRes.status, errText);
        emailBody = `[Email recibido de ${from} — no se pudo obtener el contenido]`;
      }
    } catch (err) {
      console.error('[Resend Inbound] Error fetching email:', err);
      emailBody = `[Email recibido de ${from}]`;
    }

    if (!emailBody.trim()) {
      emailBody = `[Respuesta recibida por email de ${from}]`;
    }

    // ── Find ticket in database ───────────────────────────────────────
    const svc = getSvc();

    const { data: ticket } = await svc
      .from('tickets')
      .select('id, tenant_id, assigned_agent_id, requester_email')
      .eq('ticket_number', ticketNumber)
      .is('deleted_at', null)
      .maybeSingle();

    if (!ticket) {
      console.log('[Resend Inbound] Ticket not found:', ticketNumber);
      return NextResponse.json({ ok: true, skipped: 'ticket not found' });
    }

    // ── Extract sender email ──────────────────────────────────────────
    // "from" can be "Name <email@domain.com>" or just "email@domain.com"
    const senderEmail = extractEmail(from ?? '');

    // ── Idempotency: check if this email_id was already processed ─────
    const idempotencyTag = `resend:${email_id}`;
    const { data: existing } = await svc
      .from('ticket_followups')
      .select('id')
      .eq('ticket_id', ticket.id)
      .like('content', `%${idempotencyTag}%`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log('[Resend Inbound] Already processed email_id:', email_id);
      return NextResponse.json({ ok: true, skipped: 'already processed' });
    }

    // ── Insert as followup ────────────────────────────────────────────
    // Include hidden idempotency marker to prevent duplicate processing
    const followupContent = `📧 Respuesta por email de ${senderEmail}:\n\n${emailBody}\n\n<!-- ${idempotencyTag} -->`;

    const { error: followupError } = await svc
      .from('ticket_followups')
      .insert({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        content: followupContent,
        is_private: false,
        author_id: null,
        author_type: 'contact',
      });

    if (followupError) {
      console.error('[Resend Inbound] Followup insert error:', followupError.message);

      // author_id might be NOT NULL — try with a system user
      const { data: adminAgent } = await svc
        .from('agents')
        .select('user_id')
        .eq('tenant_id', ticket.tenant_id)
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();

      if (adminAgent?.user_id) {
        await svc.from('ticket_followups').insert({
          tenant_id: ticket.tenant_id,
          ticket_id: ticket.id,
          content: followupContent,
          is_private: false,
          author_id: adminAgent.user_id,
          author_type: 'contact',
        });
      }
    }

    // ── Update ticket status if it was resolved/closed ────────────────
    const reopenStatuses = ['resolved', 'closed'];
    const { data: currentTicket } = await svc
      .from('tickets')
      .select('status')
      .eq('id', ticket.id)
      .single();

    if (currentTicket && reopenStatuses.includes(currentTicket.status)) {
      await svc.from('tickets').update({
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      }).eq('id', ticket.id);

      console.log('[Resend Inbound] Ticket reopened:', ticketNumber);
    } else {
      // Just update the timestamp
      await svc.from('tickets').update({
        updated_at: new Date().toISOString(),
      }).eq('id', ticket.id);
    }

    // ── Notify assigned agent (in-app) ────────────────────────────────
    if (ticket.assigned_agent_id) {
      const { data: agent } = await svc.from('agents')
        .select('user_id').eq('id', ticket.assigned_agent_id).single();

      if (agent?.user_id) {
        await svc.from('notifications').insert({
          tenant_id: ticket.tenant_id,
          user_id: agent.user_id,
          title: `📧 Respuesta por email en ${ticketNumber}`,
          body: `${senderEmail} respondió al ticket "${ticketNumber}" por email`,
          is_read: false,
          resource_type: 'ticket',
          resource_id: ticket.id,
          link: `/home/tickets/${ticket.id}`,
        });
      }
    }

    console.log('[Resend Inbound] Successfully processed reply for', ticketNumber);

    return NextResponse.json({
      ok: true,
      ticket: ticketNumber,
      from: senderEmail,
      bodyLength: emailBody.length,
    });
  } catch (err) {
    console.error('[Resend Inbound] Fatal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1]!;
  if (from.includes('@')) return from.trim();
  return from;
}

function cleanEmailReply(body: string): string {
  let cleaned = body;

  // Remove "On Date, Name wrote:" block (Gmail format — may have line break before "wrote:")
  cleaned = cleaned.replace(/\r?\n*On .+wrote:\r?\n?[\s\S]*/i, '');

  // Remove "El día Date, Name escribió:" (Spanish Gmail)
  cleaned = cleaned.replace(/\r?\n*El .+escribi[oó]:\r?\n?[\s\S]*/i, '');

  // Remove "---Original Message---" / "---Mensaje Original---" block
  cleaned = cleaned.replace(/\r?\n*-{2,}.*(?:Original|Mensaje).*-{2,}[\s\S]*/i, '');

  // Remove "De: ... Enviado: ... Para: ..." Outlook block
  cleaned = cleaned.replace(/\r?\n*(?:De|From)\s*:.*\r?\n(?:Enviado|Sent)\s*:.*[\s\S]*/i, '');

  // Remove "> " quoted lines at the end
  const lines = cleaned.split(/\r?\n/);
  const nonQuotedLines: string[] = [];
  let foundQuote = false;
  for (const line of lines) {
    if (line.startsWith('>') || line.startsWith('&gt;')) {
      foundQuote = true;
    } else if (!foundQuote) {
      nonQuotedLines.push(line);
    }
  }

  cleaned = nonQuotedLines.join('\n').trim();

  // Remove NovaDesk footer
  cleaned = cleaned.replace(/— NovaDesk ITSM[\s\S]*/i, '').trim();
  cleaned = cleaned.replace(/NovaDesk ITSM — AI-First[\s\S]*/i, '').trim();

  // Remove trailing whitespace lines
  cleaned = cleaned.replace(/\s+$/, '').trim();

  return cleaned || body.trim();
}
