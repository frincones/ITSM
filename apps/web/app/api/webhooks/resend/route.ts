import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------- */
/*  POST /api/webhooks/resend — Handle inbound email replies from Resend       */
/* -------------------------------------------------------------------------- */

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Simple in-memory lock to prevent concurrent processing of same email_id */
const processing = new Set<string>();

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();

    if (event.type !== 'email.received') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { email_id, from, to, subject } = event.data ?? {};

    console.log('[Resend Inbound]', { email_id, from, subject });

    if (!email_id || !subject) {
      return NextResponse.json({ ok: true, skipped: 'no email_id or subject' });
    }

    // ── In-memory lock to prevent race condition duplicates ───────────
    if (processing.has(email_id)) {
      console.log('[Resend Inbound] Already processing email_id:', email_id);
      return NextResponse.json({ ok: true, skipped: 'already processing' });
    }
    processing.add(email_id);
    // Auto-cleanup after 60s
    setTimeout(() => processing.delete(email_id), 60_000);

    // ── Extract ticket number from subject ────────────────────────────
    const ticketMatch = subject.match(/(TKT-\d{4}-\d{5}|PDZ-\d{4}-\d{5})/i);

    // If there's no ticket number, try to treat this as a NEW ticket for an
    // organization identified by a +slug in the To address.
    if (!ticketMatch) {
      const slug = extractOrgSlug(to);
      if (!slug) {
        processing.delete(email_id);
        console.log('[Resend Inbound] No ticket number and no org slug:', { subject, to });
        return NextResponse.json({ ok: true, skipped: 'no ticket number and no org slug' });
      }

      const result = await handleNewTicketFromEmail({
        email_id,
        from: from ?? '',
        to: Array.isArray(to) ? to.join(', ') : String(to ?? ''),
        subject,
        slug,
      });
      processing.delete(email_id);
      return NextResponse.json(result);
    }

    const ticketNumber = ticketMatch[1]!.toUpperCase();
    console.log('[Resend Inbound] Ticket:', ticketNumber);

    // ── Fetch full email body from Resend API ─────────────────────────
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      processing.delete(email_id);
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    let emailBody = '';
    try {
      const emailRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
        headers: { 'Authorization': `Bearer ${resendKey}` },
      });

      if (emailRes.ok) {
        const emailData = await emailRes.json();
        emailBody = emailData.text ?? emailData.html ?? '';
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
      processing.delete(email_id);
      console.log('[Resend Inbound] Ticket not found:', ticketNumber);
      return NextResponse.json({ ok: true, skipped: 'ticket not found' });
    }

    const senderEmail = extractEmail(from ?? '');

    // ── DB-level deduplication via source_ref (if column exists) ──────
    const sourceRef = `resend:${email_id}`;
    let hasSourceRef = true;

    // Try source_ref based dedup first
    try {
      const { data: existing } = await svc
        .from('ticket_followups')
        .select('id')
        .eq('ticket_id', ticket.id)
        .eq('source_ref', sourceRef)
        .limit(1)
        .maybeSingle();

      if (existing) {
        processing.delete(email_id);
        console.log('[Resend Inbound] Already processed (source_ref):', email_id);
        return NextResponse.json({ ok: true, skipped: 'already processed' });
      }
    } catch {
      // source_ref column doesn't exist yet — fall back to content search
      hasSourceRef = false;
      const { data: existing } = await svc
        .from('ticket_followups')
        .select('id')
        .eq('ticket_id', ticket.id)
        .like('content', `%${sourceRef}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        processing.delete(email_id);
        console.log('[Resend Inbound] Already processed (content):', email_id);
        return NextResponse.json({ ok: true, skipped: 'already processed' });
      }
    }

    // ── Get admin agent for author_id (required NOT NULL) ─────────────
    const { data: adminAgent } = await svc
      .from('agents')
      .select('user_id')
      .eq('tenant_id', ticket.tenant_id)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (!adminAgent?.user_id) {
      processing.delete(email_id);
      return NextResponse.json({ error: 'No admin agent found' }, { status: 500 });
    }

    // ── Insert as followup ────────────────────────────────────────────
    const insertData: Record<string, unknown> = {
      tenant_id: ticket.tenant_id,
      ticket_id: ticket.id,
      content: emailBody,
      is_private: false,
      author_id: adminAgent.user_id,
      author_type: 'contact',
    };

    // Use source_ref for DB-level uniqueness if column exists
    if (hasSourceRef) {
      insertData.source_ref = sourceRef;
    }

    const { error: followupError } = await svc
      .from('ticket_followups')
      .insert(insertData);

    if (followupError) {
      processing.delete(email_id);
      // If it's a unique constraint violation, it's a duplicate — that's fine
      if (followupError.message.includes('unique') || followupError.message.includes('duplicate')) {
        console.log('[Resend Inbound] Duplicate prevented by DB constraint:', email_id);
        return NextResponse.json({ ok: true, skipped: 'duplicate prevented' });
      }
      console.error('[Resend Inbound] Followup insert error:', followupError.message);
      return NextResponse.json({ error: followupError.message }, { status: 500 });
    }

    // ── Update ticket status if it was resolved/closed ────────────────
    const { data: currentTicket } = await svc
      .from('tickets')
      .select('status')
      .eq('id', ticket.id)
      .single();

    if (currentTicket && ['resolved', 'closed'].includes(currentTicket.status)) {
      const nowIso = new Date().toISOString();
      const { data: prev } = await svc
        .from('tickets')
        .select('reopened_count')
        .eq('id', ticket.id)
        .single();
      await svc.from('tickets').update({
        status: 'reopened',
        last_reopened_at: nowIso,
        reopened_count: ((prev as { reopened_count?: number | null } | null)?.reopened_count ?? 0) + 1,
        resolved_at: null,
        closed_at: null,
        updated_at: nowIso,
      }).eq('id', ticket.id);
      console.log('[Resend Inbound] Ticket reopened:', ticketNumber);
    } else {
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

    processing.delete(email_id);
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

/**
 * Extract the +slug from a Resend "To" header.
 * Example: "soporte+podenza@itsm.tdxcore.com" → "podenza"
 * Works against a string or an array of recipients.
 */
function extractOrgSlug(to: unknown): string | null {
  const candidates: string[] = Array.isArray(to)
    ? (to as unknown[]).map((x) => String(x))
    : to
      ? [String(to)]
      : [];

  for (const entry of candidates) {
    // strip any display name wrapper: "Foo <soporte+podenza@...>" → email
    const addr = extractEmail(entry);
    const m = addr.match(/^[^+@\s]+\+([a-z0-9._-]+)@/i);
    if (m) return m[1]!.toLowerCase();
  }
  return null;
}

/**
 * Create a new ticket from an inbound email addressed to soporte+<slug>@...
 * Looks up the organization by slug (and falls back to inbound_email_slug
 * when that column exists) and creates a ticket owned by that org.
 */
async function handleNewTicketFromEmail(args: {
  email_id: string;
  from: string;
  to: string;
  subject: string;
  slug: string;
}) {
  const { email_id, from, subject, slug } = args;
  const svc = getSvc();

  // Look up org by slug — matches either the canonical `slug` column or
  // the optional `inbound_email_slug` alias. The handler used to also
  // pull default_group_id/default_agent_id/default_category_id for
  // pre-routing, but those columns were never migrated to the live DB;
  // including them in the SELECT made PostgREST return a silent 42703
  // error and the org lookup always failed (bug found 2026-04-22).
  type OrgRow = {
    id: string;
    tenant_id: string;
    name: string;
  };
  const orgLookup = await svc
    .from('organizations')
    .select('id, tenant_id, name')
    .or(`slug.eq.${slug},inbound_email_slug.eq.${slug}`)
    .limit(1)
    .maybeSingle();
  if (orgLookup.error) {
    console.error('[Resend Inbound] org lookup error:', orgLookup.error.message);
  }
  const org: OrgRow | null = (orgLookup.data as OrgRow | null) ?? null;

  if (!org) {
    console.log('[Resend Inbound] Slug not mapped to any org:', slug);
    return { ok: true, skipped: 'unknown org slug', slug };
  }

  const senderEmail = extractEmail(from);
  const sourceRef = `resend:${email_id}`;

  // Fetch email body
  let emailBody = '';
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const r = await fetch(
        `https://api.resend.com/emails/receiving/${email_id}`,
        { headers: { Authorization: `Bearer ${resendKey}` } },
      );
      if (r.ok) {
        const d = await r.json();
        emailBody = cleanEmailReply(d.text ?? d.html ?? '');
      }
    } catch {
      // swallow — will use fallback below
    }
  }
  if (!emailBody.trim()) {
    emailBody = `[Solicitud recibida por email de ${senderEmail}]`;
  }

  const title =
    (subject ?? '').trim().slice(0, 200) ||
    `Solicitud por email de ${senderEmail}`;

  // ── DB-level dedup ─────────────────────────────────────────────────
  // Resend occasionally retries a delivered inbound email (or the same
  // handler invocation hits two Vercel serverless instances in parallel)
  // which used to create duplicate tickets. The in-memory `processing`
  // Set only catches the concurrent case on the same instance, so we
  // also check the DB for any existing ticket tagged with the same
  // `custom_fields.inbound_email_id`.
  const { data: existingTicket } = await svc
    .from('tickets')
    .select('id, ticket_number')
    .eq('tenant_id', org.tenant_id)
    .eq('custom_fields->>inbound_email_id', email_id)
    .limit(1)
    .maybeSingle();
  if (existingTicket) {
    console.log(
      '[Resend Inbound] Email already processed into ticket:',
      (existingTicket as { ticket_number: string }).ticket_number,
    );
    return {
      ok: true,
      duplicate: true,
      ticket: (existingTicket as { ticket_number: string }).ticket_number,
    };
  }

  const ticketPayload: Record<string, unknown> = {
    tenant_id: org.tenant_id,
    organization_id: org.id,
    title,
    description: emailBody,
    type: 'support',
    status: 'new',
    urgency: 'medium',
    impact: 'medium',
    channel: 'email',
    requester_email: senderEmail,
    custom_fields: { inbound_email_id: email_id, source_ref: sourceRef },
  };
  const { data: ticket, error } = await svc
    .from('tickets')
    .insert(ticketPayload)
    .select('id, ticket_number')
    .single();

  if (error) {
    console.error('[Resend Inbound] Failed to create ticket from email:', error.message);
    return { ok: false, error: error.message };
  }

  // ── Round-robin assignment (same logic portal tickets use) ─────────
  // Rotates through eligible TDX agents via the per-tenant cursor in
  // tenants.settings.round_robin_last_agent_id. Fire-and-forget so a
  // failure doesn't block the ticket creation response.
  assignViaRoundRobin(svc, ticket.id, org.tenant_id).catch((err) =>
    console.error('[Resend Inbound] round-robin failed:', err),
  );

  console.log(
    '[Resend Inbound] Created ticket',
    ticket?.ticket_number,
    'for org',
    org.name,
    'from',
    senderEmail,
  );
  return {
    ok: true,
    created: true,
    ticket: ticket?.ticket_number,
    organization: org.name,
    from: senderEmail,
  };
}

function cleanEmailReply(body: string): string {
  let cleaned = body;

  // Remove "On Date, Name wrote:" block (Gmail — may wrap across lines)
  cleaned = cleaned.replace(/\r?\n*On [\s\S]*?wrote:\r?\n?[\s\S]*/i, '');

  // Remove "El día Date, Name escribió:" (Spanish Gmail)
  cleaned = cleaned.replace(/\r?\n*El [\s\S]*?escribi[oó]:\r?\n?[\s\S]*/i, '');

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

  // Remove trailing whitespace
  cleaned = cleaned.replace(/\s+$/, '').trim();

  return cleaned || body.trim();
}


// ════════════════════════════════════════════════════════════════════════════
//  Round-robin assignment for new inbound-email tickets
// ════════════════════════════════════════════════════════════════════════════
//
// Mirror of autoAssignRoundRobin() in lib/actions/tickets.ts. We replicate
// the logic here instead of importing to avoid the server-action runtime
// overhead and to keep the webhook handler dependency-free from the
// Supabase SSR client type.
// svc is typed as `any` because the service-role client returns Supabase
// Database typing that conflicts with the locally-generated Database type;
// we only write well-known columns, so skipping the strictness is safe.
async function assignViaRoundRobin(
  svc: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ticketId: string,
  tenantId: string,
): Promise<void> {
  const EXCLUDED_EMAILS = ['admin@novadesk.com'];

  const { data: allAgents } = await svc
    .from('agents')
    .select('id, user_id, email, name, role')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('role', ['admin', 'supervisor', 'agent'])
    .order('name', { ascending: true });

  const agents = ((allAgents ?? []) as Array<{ id: string; email: string; user_id: string | null; name: string }>).filter(
    (a) => !EXCLUDED_EMAILS.includes(a.email.toLowerCase()),
  );
  if (agents.length === 0) return;

  const { data: tenant } = await svc
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  const settings =
    ((tenant as { settings: Record<string, unknown> } | null)?.settings as
      | Record<string, unknown>
      | null) ?? {};
  const lastAgentId =
    typeof settings.round_robin_last_agent_id === 'string'
      ? settings.round_robin_last_agent_id
      : null;

  const lastIdx = agents.findIndex((a) => a.id === lastAgentId);
  const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % agents.length;
  const best = agents[nextIdx];
  if (!best) return;

  await svc
    .from('tenants')
    .update({
      settings: { ...settings, round_robin_last_agent_id: best.id },
    })
    .eq('id', tenantId);

  await svc
    .from('tickets')
    .update({
      assigned_agent_id: best.id,
      status: 'assigned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId);

  // Add assignee as follower so they stay subscribed to the ticket.
  await svc
    .from('ticket_followers')
    .upsert(
      {
        tenant_id: tenantId,
        ticket_id: ticketId,
        agent_id: best.id,
        added_reason: 'assignment',
        is_auto: true,
      },
      { onConflict: 'ticket_id,agent_id', ignoreDuplicates: true },
    );
}
