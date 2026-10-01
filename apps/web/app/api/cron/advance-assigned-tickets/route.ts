import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  isWithinBusinessHours,
  resolveCalendarForTicket,
  type BusinessCalendar,
} from '~/lib/services/calendar.service';

/**
 * Cron Job — Advance 'assigned' → 'in_progress' during business hours
 *
 * Tickets sitting in 'assigned' read as untouched even once the working day
 * has started. This moves them to 'in_progress' so the queue reflects that
 * the day is underway, and only inside the hours the contract defines
 * (Podenza cl. 4: Mon-Fri 08:00-17:00 America/Bogota, excluding holidays).
 *
 * Scheduled three times per weekday — 08:00, 12:00 and 16:00 Bogota (see
 * migration 00049). The schedule is the coarse filter; this endpoint is the
 * precise one, re-checking the calendar per ticket so a run landing on a
 * public holiday advances nothing.
 *
 * Tickets already in 'in_progress' — moved by hand — are never touched: the
 * status filter excludes them, so a manual advance always wins.
 *
 * ── Two things this deliberately does NOT do ────────────────────────────
 *
 * 1. It never writes first_response_at. An automated status flip is not a
 *    response to the client; the contract defines the response SLA as
 *    acknowledgement, classification, diagnosis and communication of the
 *    plan (cl. 4) — all of which need a human. If this cron ever stamped
 *    first_response_at it would manufacture SLA compliance for every open
 *    ticket at 08:00, and that number would collapse the moment the client
 *    cross-checked their own email trail.
 *
 * 2. It tags every transition it makes with reason = 'auto-advance' in
 *    ticket_status_history, so automated movement stays distinguishable from
 *    human action forever. Lifecycle and time-in-status metrics read that
 *    table; without the tag, "work started at 08:00" would look like a real
 *    signal for tickets nobody had opened yet.
 */
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

  const { data: tickets, error } = await svc
    .from('tickets')
    .select('id, tenant_id, organization_id, ticket_number, status')
    .eq('status', 'assigned')
    .not('assigned_agent_id', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tickets || tickets.length === 0) {
    return NextResponse.json({
      ok: true,
      advanced: 0,
      message: 'No assigned tickets pending',
    });
  }

  const now = new Date();

  // Resolve the governing calendar once per (tenant, organization).
  const calendarCache = new Map<string, BusinessCalendar | null>();

  async function calendarFor(
    tenantId: string,
    organizationId: string | null,
  ): Promise<BusinessCalendar | null> {
    const key = `${tenantId}:${organizationId ?? '-'}`;
    if (!calendarCache.has(key)) {
      calendarCache.set(
        key,
        await resolveCalendarForTicket(svc, tenantId, organizationId, now),
      );
    }
    return calendarCache.get(key) ?? null;
  }

  let advanced = 0;
  const skipped: Array<{ ticket: string; reason: string }> = [];

  for (const t of tickets) {
    const calendar = await calendarFor(t.tenant_id, t.organization_id);

    // No calendar means we cannot tell whether we are inside working hours.
    // Skipping is the safe read — advancing would risk firing at 3 a.m. or
    // on a public holiday.
    if (!calendar) {
      skipped.push({ ticket: t.ticket_number, reason: 'no_calendar' });
      continue;
    }

    if (!isWithinBusinessHours(calendar, now)) {
      skipped.push({ ticket: t.ticket_number, reason: 'outside_business_hours' });
      continue;
    }

    // Tag the transition so ticket_status_history records that this was the
    // automation, not a person. Transaction-local, read by the
    // log_ticket_status_change trigger.
    const { error: tagError } = await svc.rpc('set_status_change_reason', {
      p_reason: 'auto-advance',
    });
    if (tagError) {
      console.error(
        '[advance-assigned] could not tag transition, skipping',
        t.ticket_number,
        tagError.message,
      );
      skipped.push({ ticket: t.ticket_number, reason: 'tag_failed' });
      continue;
    }

    // The status filter is repeated here on purpose: if someone moved the
    // ticket by hand between the SELECT and now, this update matches nothing
    // and the manual change stands.
    const { error: updateError, count } = await svc
      .from('tickets')
      .update({ status: 'in_progress', updated_at: now.toISOString() }, { count: 'exact' })
      .eq('id', t.id)
      .eq('status', 'assigned');

    if (updateError) {
      console.error(
        '[advance-assigned] failed',
        t.ticket_number,
        updateError.message,
      );
      continue;
    }

    if ((count ?? 0) > 0) advanced++;
  }

  return NextResponse.json({
    ok: true,
    advanced,
    considered: tickets.length,
    skipped,
  });
}
