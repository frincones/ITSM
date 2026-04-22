/**
 * inbound-email.service.ts
 *
 * Shared helper that turns a single Resend inbound email into an ITSM
 * ticket. Used by:
 *   · /api/webhooks/resend          → called when Resend delivers the email
 *   · /api/cron/reconcile-inbound   → sweeps Resend for anything the webhook
 *                                     didn't catch and back-fills the DB
 *
 * The helper is idempotent: two calls with the same email_id produce
 * exactly one ticket (DB-level dedup on custom_fields.inbound_email_id).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Raw "inbound email" as returned by Resend's API / webhook. */
export interface InboundEmail {
  email_id: string;
  from: string;
  to: string | string[];
  subject: string;
}

/** Outcome for a single email. Used by the cron to report its sweep. */
export type InboundEmailResult =
  | { ok: true; created: true; ticket: string; organization: string; email_id: string }
  | { ok: true; duplicate: true; ticket: string; email_id: string }
  | { ok: true; skipped: string; email_id: string; slug?: string }
  | { ok: false; error: string; email_id: string };

// ── Helpers ──────────────────────────────────────────────────────────────

/** "Foo <foo@bar.com>" → "foo@bar.com" */
export function extractEmail(entry: string | string[]): string {
  const raw = Array.isArray(entry) ? (entry[0] ?? '') : entry;
  const m = raw.match(/<([^>]+)>/);
  const out = m?.[1] ?? raw ?? '';
  return out.trim().toLowerCase();
}

/** Extract `<slug>` from any `soporte+<slug>@...` address in the candidate list. */
export function extractOrgSlug(to: string | string[]): string | null {
  const candidates: string[] = Array.isArray(to)
    ? to
    : (to ?? '').split(',').map((s) => s.trim());
  for (const entry of candidates) {
    const addr = extractEmail(entry);
    const m = addr.match(/^[^+@\s]+\+([a-z0-9._-]+)@/i);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}

/** Strip typical "On ... wrote:" quote blocks + NovaDesk footers from a reply. */
export function cleanEmailReply(body: string): string {
  if (!body) return '';
  let cleaned = body;

  // Remove HTML blockquotes first
  cleaned = cleaned.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');

  const lines = cleaned.split('\n');
  const nonQuoted: string[] = [];
  let foundQuote = false;
  for (const line of lines) {
    if (
      /^(On\s|El\s)/.test(line) && /\bwrote:|\bescribi[oó]:/.test(line)
    ) {
      foundQuote = true;
      break;
    }
    if (/^>+\s/.test(line) || /^\s*-{5,}\s*Original Message\s*-{5,}/.test(line)) {
      foundQuote = true;
      continue;
    }
    if (!foundQuote) nonQuoted.push(line);
  }
  cleaned = nonQuoted.join('\n').trim();
  cleaned = cleaned.replace(/— NovaDesk ITSM[\s\S]*/i, '').trim();
  cleaned = cleaned.replace(/NovaDesk ITSM — AI-First[\s\S]*/i, '').trim();
  cleaned = cleaned.replace(/\s+$/, '').trim();
  return cleaned || body.trim();
}

// ── Round-robin (cursor-based rotation, identical to webhook helper) ────

async function assignViaRoundRobin(
  svc: SupabaseClient,
  ticketId: string,
  tenantId: string,
): Promise<void> {
  const EXCLUDED = ['admin@novadesk.com'];
  const { data: all } = await svc
    .from('agents')
    .select('id, user_id, email, name, role')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('role', ['admin', 'supervisor', 'agent'])
    .order('name', { ascending: true });
  const agents = ((all ?? []) as Array<{ id: string; email: string; user_id: string | null; name: string }>).filter(
    (a) => !EXCLUDED.includes(a.email.toLowerCase()),
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

// ── Main entry point ────────────────────────────────────────────────────

/**
 * Create (or find an existing) ticket for a single inbound email.
 * Idempotent: the DB-level dedup on `custom_fields.inbound_email_id`
 * guarantees that the Nth call for the same email_id returns the same
 * ticket that was created on the 1st call.
 */
export async function createTicketFromInboundEmail(
  svc: SupabaseClient,
  email: InboundEmail,
  opts?: { resendApiKey?: string },
): Promise<InboundEmailResult> {
  const { email_id, from, to, subject } = email;

  // 1. Route by +<slug> suffix in the To address
  const slug = extractOrgSlug(to);
  if (!slug) {
    return { ok: true, skipped: 'no org slug in To', email_id };
  }

  const orgLookup = await svc
    .from('organizations')
    .select('id, tenant_id, name')
    .or(`slug.eq.${slug},inbound_email_slug.eq.${slug}`)
    .limit(1)
    .maybeSingle();
  const org = orgLookup.data as { id: string; tenant_id: string; name: string } | null;
  if (!org) {
    return { ok: true, skipped: 'unknown org slug', slug, email_id };
  }

  // 2. Dedup by inbound_email_id (survives multi-instance + retries)
  const { data: existing } = await svc
    .from('tickets')
    .select('ticket_number')
    .eq('tenant_id', org.tenant_id)
    .eq('custom_fields->>inbound_email_id', email_id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      ticket: (existing as { ticket_number: string }).ticket_number,
      email_id,
    };
  }

  // 3. Fetch full body from Resend when a key is available — otherwise
  //    fall back to a stub so we always have *some* description.
  const senderEmail = extractEmail(from);
  let body = '';
  if (opts?.resendApiKey) {
    try {
      const r = await fetch(
        `https://api.resend.com/emails/receiving/${email_id}`,
        { headers: { Authorization: `Bearer ${opts.resendApiKey}` } },
      );
      if (r.ok) {
        const d = (await r.json()) as { text?: string; html?: string };
        body = cleanEmailReply(d.text ?? d.html ?? '');
      }
    } catch {
      // swallow — fall back below
    }
  }
  if (!body.trim()) {
    body = `[Solicitud recibida por email de ${senderEmail}]`;
  }

  const title =
    (subject ?? '').trim().slice(0, 200) ||
    `Solicitud por email de ${senderEmail}`;

  // 4. Insert ticket
  const { data: ticket, error } = await svc
    .from('tickets')
    .insert({
      tenant_id: org.tenant_id,
      organization_id: org.id,
      title,
      description: body,
      type: 'support',
      status: 'new',
      urgency: 'medium',
      impact: 'medium',
      channel: 'email',
      requester_email: senderEmail,
      custom_fields: {
        inbound_email_id: email_id,
        source_ref: `resend:${email_id}`,
      },
    })
    .select('id, ticket_number')
    .single();
  if (error || !ticket) {
    return { ok: false, error: error?.message ?? 'insert failed', email_id };
  }

  // 5. Round-robin assign (awaited — Vercel serverless kills
  // unawaited background work).
  try {
    await assignViaRoundRobin(svc, (ticket as { id: string }).id, org.tenant_id);
  } catch (e) {
    console.error('[InboundEmail] round-robin failed:', e);
  }

  return {
    ok: true,
    created: true,
    ticket: (ticket as { ticket_number: string }).ticket_number,
    organization: org.name,
    email_id,
  };
}
