// ---------------------------------------------------------------------------
// Business Calendars — loader & business-hours checks
// ---------------------------------------------------------------------------
// Loads the calendar TABLES (00006) into a shape the SLA code can walk. The
// presence of a schedule row for a weekday IS the working day — the table has
// no is_working_day column, so days off are simply absent.
//
// The contract's clock (Podenza cl. 4): "lunes a viernes de 8:00 a.m. a
// 5:00 p.m., hora de Colombia, excluyendo festivos".
//
// Pure business logic. No 'use server' — used by Server Actions & cron jobs.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BusinessCalendar {
  id: string;
  timezone: string;
  schedules: Array<{
    day_of_week: number; // 0 = Sunday … 6 = Saturday
    start_time: string; // "HH:mm"
    end_time: string; // "HH:mm"
    is_working_day: boolean;
  }>;
  holidays: Array<{ date: string; name: string }>; // date = "YYYY-MM-DD"
}

/** Colombia observes no DST, so the offset is stable year-round. */
const DEFAULT_TIMEZONE = 'America/Bogota';

function minutesFromMidnight(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "YYYY-MM-DD" for an instant, in the calendar's own timezone. */
export function localDateString(at: Date, timezone: string): string {
  return at.toLocaleDateString('en-CA', { timeZone: timezone });
}

function localDayOfWeek(at: Date, timezone: string): number {
  const short = at.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short] ?? 0;
}

function localMinutes(at: Date, timezone: string): number {
  return minutesFromMidnight(
    at.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
}

/**
 * Loads a calendar with its weekly schedule and holidays.
 *
 * Returns null when the calendar doesn't exist. Callers must decide what
 * that means — for SLA purposes a missing calendar must NOT silently become
 * 24/7, because that would tighten every deadline well past what was agreed.
 */
export async function loadCalendar(
  client: SupabaseClient,
  calendarId: string,
): Promise<BusinessCalendar | null> {
  const { data: calendar, error } = await client
    .from('calendars')
    .select('id, timezone')
    .eq('id', calendarId)
    .maybeSingle();

  if (error || !calendar) return null;

  const [{ data: schedules }, { data: holidays }] = await Promise.all([
    client
      .from('calendar_schedules')
      .select('day_of_week, start_time, end_time')
      .eq('calendar_id', calendarId),
    client
      .from('calendar_holidays')
      .select('date, name')
      .eq('calendar_id', calendarId),
  ]);

  const row = calendar as unknown as { id: string; timezone: string | null };

  return {
    id: row.id,
    timezone: row.timezone ?? DEFAULT_TIMEZONE,
    // A row existing for a weekday IS the working day — the table has no
    // is_working_day column, so days off are simply absent.
    schedules: (
      (schedules ?? []) as Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
      }>
    ).map((s) => ({
      day_of_week: s.day_of_week,
      // Postgres `time` comes back as "HH:MM:SS"; trim to "HH:MM".
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      is_working_day: true,
    })),
    holidays: ((holidays ?? []) as Array<{ date: string; name: string }>).map(
      (h) => ({ date: h.date, name: h.name }),
    ),
  };
}

/**
 * Offset in ms between `timeZone` and UTC at a given instant.
 *
 * Measured rather than assumed: formatting the instant in the target zone and
 * reading it back as if it were UTC yields the offset. Colombia has no DST so
 * this is constant there, but the calendar table allows any timezone.
 */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    // Some engines render midnight as hour 24 under hour12:false.
    get('hour') % 24,
    get('minute'),
    get('second'),
  );

  return asIfUtc - at.getTime();
}

/** The instant of local `HH:mm` on local calendar date `YYYY-MM-DD`. */
function zonedTimeToInstant(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  // One correction pass resolves every fixed-offset zone exactly; re-measuring
  // at the corrected instant handles the DST boundary cases too.
  const first = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - zoneOffsetMs(first, timeZone));
}

export function isHoliday(calendar: BusinessCalendar, at: Date): boolean {
  const day = localDateString(at, calendar.timezone);
  return calendar.holidays.some((h) => h.date === day);
}

/**
 * Is `at` inside the calendar's business hours?
 *
 * Returns false on weekends, holidays, and outside the daily window. A
 * calendar with no schedules returns false rather than true: an empty
 * calendar means "unconfigured", and treating unconfigured as always-open is
 * how automations end up firing at 3 a.m. on a holiday.
 */
export function isWithinBusinessHours(
  calendar: BusinessCalendar,
  at: Date = new Date(),
): boolean {
  if (calendar.schedules.length === 0) return false;
  if (isHoliday(calendar, at)) return false;

  const dow = localDayOfWeek(at, calendar.timezone);
  const schedule = calendar.schedules.find(
    (s) => s.day_of_week === dow && s.is_working_day,
  );
  if (!schedule) return false;

  const now = localMinutes(at, calendar.timezone);
  return (
    now >= minutesFromMidnight(schedule.start_time) &&
    now < minutesFromMidnight(schedule.end_time)
  );
}

/**
 * Closing instant of the business day that `at` falls in — or, when `at` is
 * after hours, on a weekend or on a holiday, the close of the next working
 * day.
 *
 * This is the deadline for the Podenza contract's separate P0 commitment
 * (cl. 4): "TDX entregará una mitigación o solución temporal dentro de la
 * misma jornada hábil".
 *
 * Rolling forward for out-of-hours arrivals is what the contract itself
 * provides for — "solicitudes registradas fuera del horario de atención" are
 * not counted as breach. Note the sharp edge this exposes: a P0 opened at
 * 16:30 gets a 30-minute mitigation deadline, since the close of that same
 * business day is 17:00. That is the contract as signed, not a bug here —
 * the otrosí proposal adds a grace window for late-in-the-day P0s.
 *
 * Returns null if no working day is found within a year (an unconfigured or
 * empty calendar).
 */
export function endOfBusinessDay(
  calendar: BusinessCalendar,
  at: Date,
): Date | null {
  for (const win of workingWindows(calendar, at)) {
    // False on the arrival day when the ticket came in after closing, which
    // rolls the deadline to the next working day.
    if (win.close.getTime() > at.getTime()) return win.close;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Business-minute arithmetic
// ---------------------------------------------------------------------------
// These replace the calculateSLADueDate() that used to live in sla.service.ts
// (deleted — it was never imported anywhere). That version carried two timezone
// bugs worth remembering: it built day cursors with `new Date(dateStr +
// 'T00:00:00')`, which has no zone suffix and so is parsed in the SERVER's local
// time — 5 hours off for America/Bogota on a UTC host — and it padded each day
// with `availableMinutes + 1`, losing a minute per day walked.
//
// Everything here works on instants and converts through zonedTimeToInstant, so
// the calendar's own timezone is the only one that matters. The SQL mirrors in
// migrations 00053/00054 follow the same rule via `AT TIME ZONE`.

/** The [open, close] instants of a working day, or null if it isn't one. */
function windowFor(
  calendar: BusinessCalendar,
  dateStr: string,
  dayOfWeek: number,
): { open: Date; close: Date } | null {
  if (calendar.holidays.some((h) => h.date === dateStr)) return null;

  const schedule = calendar.schedules.find(
    (s) => s.day_of_week === dayOfWeek && s.is_working_day,
  );
  if (!schedule) return null;

  return {
    open: zonedTimeToInstant(dateStr, schedule.start_time, calendar.timezone),
    close: zonedTimeToInstant(dateStr, schedule.end_time, calendar.timezone),
  };
}

/**
 * Walks calendar days starting from `at`'s local date.
 *
 * Dates are stepped as pure date-only UTC values so a DST shift can never push
 * a "+24h" step onto the wrong calendar day; each date only becomes a real
 * instant inside windowFor().
 */
function* workingWindows(
  calendar: BusinessCalendar,
  at: Date,
  maxDays = 400,
): Generator<{ open: Date; close: Date }> {
  const [y, m, d] = localDateString(at, calendar.timezone).split('-').map(Number);
  const start = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);

  for (let i = 0; i < maxDays; i++) {
    const dayValue = new Date(start + i * 86_400_000);
    const win = windowFor(
      calendar,
      dayValue.toISOString().slice(0, 10),
      dayValue.getUTCDay(),
    );
    if (win) yield win;
  }
}

/**
 * `from` plus `minutes` of business time.
 *
 * A ticket opened outside business hours starts consuming its budget at the
 * next open — which is what the contract provides for (cl. 4: requests logged
 * outside the service window are not counted as breach).
 *
 * Returns null for an unconfigured calendar, or if the budget outlives the
 * ~400-day walk. Never returns a "best effort" value: a wrong SLA deadline is
 * worse than a missing one, because a missing one reads as "no duty" while a
 * wrong one silently reports compliance against the wrong target.
 */
export function addBusinessMinutes(
  calendar: BusinessCalendar,
  from: Date,
  minutes: number,
): Date | null {
  if (calendar.schedules.length === 0) return null;
  if (minutes <= 0) return from;

  let remaining = minutes;

  for (const win of workingWindows(calendar, from)) {
    // Before the day opens, the clock starts at open; mid-day it starts now.
    const start = win.open.getTime() > from.getTime() ? win.open : from;
    if (start.getTime() >= win.close.getTime()) continue;

    const available = (win.close.getTime() - start.getTime()) / 60_000;

    if (remaining <= available) {
      return new Date(start.getTime() + remaining * 60_000);
    }
    remaining -= available;
  }

  return null;
}

/**
 * Business minutes elapsed between two instants.
 *
 * Phase 3 uses this to subtract paused intervals from the SLA clock: the
 * contract suspends it while a ticket waits on the client (cl. 4), and
 * ticket_status_history records exactly when those intervals start and end.
 */
export function businessMinutesBetween(
  calendar: BusinessCalendar,
  from: Date,
  to: Date,
): number {
  if (calendar.schedules.length === 0) return 0;
  if (to.getTime() <= from.getTime()) return 0;

  let total = 0;

  for (const win of workingWindows(calendar, from)) {
    // Windows are yielded in order, so the first one past `to` ends the walk.
    if (win.open.getTime() >= to.getTime()) break;

    const start = Math.max(win.open.getTime(), from.getTime());
    const end = Math.min(win.close.getTime(), to.getTime());
    if (end > start) total += (end - start) / 60_000;
  }

  return Math.round(total);
}

// ---------------------------------------------------------------------------
// Calendar resolution for a ticket
// ---------------------------------------------------------------------------

/**
 * The calendar whose hours govern a ticket.
 *
 * Prefers the calendar attached to the client's support contract — those are
 * the hours actually agreed with that client. Falls back to the tenant's
 * default calendar so clients without a contract still get sane working hours
 * for operational automations (which is not the same as having an SLA: that is
 * decided by sla_applies_for_ticket, never by the presence of a calendar).
 *
 * Returns null when neither exists. Callers must treat null as "cannot tell
 * whether we are inside working hours" and skip, never as "always open" — that
 * is how an automation ends up firing at 3 a.m. on a public holiday.
 */
export async function resolveCalendarForTicket(
  client: SupabaseClient,
  tenantId: string,
  organizationId: string | null,
  at: Date = new Date(),
): Promise<BusinessCalendar | null> {
  let calendarId: string | null = null;

  if (organizationId) {
    const day = localDateString(at, DEFAULT_TIMEZONE);

    const { data: contract } = await client
      .from('organization_support_contracts')
      .select('calendar_id')
      .eq('organization_id', organizationId)
      .lte('effective_from', day)
      .or(`effective_to.is.null,effective_to.gte.${day}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    calendarId =
      (contract as { calendar_id: string | null } | null)?.calendar_id ?? null;
  }

  if (!calendarId) {
    const { data: fallback } = await client
      .from('calendars')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    calendarId = (fallback as { id: string } | null)?.id ?? null;
  }

  return calendarId ? await loadCalendar(client, calendarId) : null;
}
