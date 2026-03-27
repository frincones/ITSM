// ---------------------------------------------------------------------------
// SLA/OLA Engine — Business Logic Service
// ---------------------------------------------------------------------------
// Pure business logic. No 'use server' — used by Server Actions & cron jobs.
// ---------------------------------------------------------------------------

/**
 * Represents a business-hours schedule for a single day of the week.
 */
interface CalendarSchedule {
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  start_time: string; // "HH:mm" e.g. "09:00"
  end_time: string; // "HH:mm" e.g. "18:00"
  is_working_day: boolean;
}

/**
 * Represents a holiday entry in the calendar.
 */
interface CalendarHoliday {
  date: string; // "YYYY-MM-DD"
  name: string;
}

/**
 * Calendar containing business schedules and holidays.
 */
interface Calendar {
  id: string;
  schedules: CalendarSchedule[];
  holidays: CalendarHoliday[];
  timezone: string; // e.g. "America/Bogota"
}

/**
 * SLA target configuration for different priorities.
 */
interface SlaTargets {
  first_response: Record<string, number>; // priority → minutes
  resolution: Record<string, number>; // priority → minutes
}

/**
 * SLA definition.
 */
interface Sla {
  id: string;
  name: string;
  targets: SlaTargets;
  calendar_id: string | null;
}

/**
 * Minimal ticket shape needed for SLA calculations.
 */
interface TicketForSla {
  id: string;
  tenant_id: string;
  status: string;
  urgency: string;
  priority: number;
  sla_due_date: string | null;
  sla_breached: boolean;
  created_at: string;
  first_response_at: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MILLIS_PER_MINUTE = 60_000;

/**
 * Parses a "HH:mm" string into total minutes from midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * Formats a Date to "YYYY-MM-DD" in a specific timezone.
 */
function toDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA = "YYYY-MM-DD"
}

/**
 * Gets the day of week for a Date in a specific timezone (0 = Sunday).
 */
function getDayOfWeek(date: Date, timezone: string): number {
  const dayStr = date.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return dayMap[dayStr] ?? 0;
}

/**
 * Gets the current minutes from midnight for a Date in a specific timezone.
 */
function getMinutesFromMidnight(date: Date, timezone: string): number {
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  return parseTimeToMinutes(timeStr);
}

/**
 * Checks whether a given date is a holiday.
 */
function isHoliday(date: Date, holidays: CalendarHoliday[], timezone: string): boolean {
  const dateStr = toDateString(date, timezone);
  return holidays.some((h) => h.date === dateStr);
}

/**
 * Gets the schedule for a specific day of the week.
 * Returns null if the day is not a working day.
 */
function getScheduleForDay(
  dayOfWeek: number,
  schedules: CalendarSchedule[],
): CalendarSchedule | null {
  const schedule = schedules.find(
    (s) => s.day_of_week === dayOfWeek && s.is_working_day,
  );
  return schedule ?? null;
}

// ---------------------------------------------------------------------------
// 1. calculateSLADueDate
// ---------------------------------------------------------------------------

/**
 * Calculates the SLA due date for a ticket, respecting business hours and holidays.
 *
 * Algorithm:
 * 1. Start from ticket creation time
 * 2. Determine how many business minutes remain in the current day
 * 3. If target fits within the remaining minutes, return the due date
 * 4. Otherwise subtract the remaining minutes from target and move to the next business day
 * 5. Repeat until target minutes are exhausted
 *
 * If no calendar is provided, uses 24/7 schedule (adds target minutes directly).
 */
export function calculateSLADueDate(
  ticket: Pick<TicketForSla, 'created_at' | 'urgency'>,
  sla: Sla,
  calendar: Calendar | null,
  targetType: 'first_response' | 'resolution' = 'resolution',
): Date {
  const targetMinutes = sla.targets[targetType]?.[ticket.urgency];

  if (!targetMinutes || targetMinutes <= 0) {
    // Fallback: add a large default (480 minutes = 8 hours)
    return new Date(new Date(ticket.created_at).getTime() + 480 * MILLIS_PER_MINUTE);
  }

  // If no calendar, treat as 24/7
  if (!calendar || calendar.schedules.length === 0) {
    return new Date(new Date(ticket.created_at).getTime() + targetMinutes * MILLIS_PER_MINUTE);
  }

  const timezone = calendar.timezone || 'UTC';
  let remainingMinutes = targetMinutes;
  let cursor = new Date(ticket.created_at);

  // Safety: max 365 iterations to prevent infinite loops
  const maxIterations = 365;
  let iterations = 0;

  while (remainingMinutes > 0 && iterations < maxIterations) {
    iterations++;

    const dayOfWeek = getDayOfWeek(cursor, timezone);
    const schedule = getScheduleForDay(dayOfWeek, calendar.schedules);

    // Skip non-working days and holidays
    if (!schedule || isHoliday(cursor, calendar.holidays, timezone)) {
      // Move to next day at midnight
      cursor = new Date(cursor.getTime() + 24 * 60 * MILLIS_PER_MINUTE);
      const nextDateStr = toDateString(cursor, timezone);
      cursor = new Date(`${nextDateStr}T00:00:00`);
      continue;
    }

    const dayStartMinutes = parseTimeToMinutes(schedule.start_time);
    const dayEndMinutes = parseTimeToMinutes(schedule.end_time);
    const currentMinutes = getMinutesFromMidnight(cursor, timezone);

    // If before business hours, fast-forward to start
    let effectiveStart = currentMinutes;
    if (effectiveStart < dayStartMinutes) {
      effectiveStart = dayStartMinutes;
      cursor = new Date(
        cursor.getTime() + (dayStartMinutes - currentMinutes) * MILLIS_PER_MINUTE,
      );
    }

    // If after business hours, move to next day
    if (effectiveStart >= dayEndMinutes) {
      cursor = new Date(cursor.getTime() + (24 * 60 - currentMinutes) * MILLIS_PER_MINUTE);
      continue;
    }

    // Calculate available minutes for today
    const availableMinutes = dayEndMinutes - effectiveStart;

    if (remainingMinutes <= availableMinutes) {
      // Due date falls within today
      return new Date(cursor.getTime() + remainingMinutes * MILLIS_PER_MINUTE);
    }

    // Consume today's available minutes and move to next day
    remainingMinutes -= availableMinutes;
    cursor = new Date(
      cursor.getTime() + (availableMinutes + 1) * MILLIS_PER_MINUTE,
    );
    // Move to next day start
    const nextDateStr = toDateString(cursor, timezone);
    cursor = new Date(`${nextDateStr}T00:00:00`);
  }

  // Fallback: return cursor if we exhausted iterations
  return cursor;
}

// ---------------------------------------------------------------------------
// 2. checkSLABreach
// ---------------------------------------------------------------------------

/**
 * Checks the SLA status of a ticket.
 *
 * Returns:
 * - `breached: true` if the current time has passed the SLA due date
 * - `warning: true` if the ticket is within 30 minutes of breaching
 * - `minutesRemaining`: number of business minutes remaining (negative if breached)
 */
export function checkSLABreach(
  ticket: Pick<TicketForSla, 'sla_due_date' | 'sla_breached' | 'status'>,
): {
  breached: boolean;
  warning: boolean;
  minutesRemaining: number;
  status: 'ok' | 'warning' | 'breached';
} {
  // Already closed/cancelled tickets are not evaluated
  if (ticket.status === 'closed' || ticket.status === 'cancelled') {
    return { breached: false, warning: false, minutesRemaining: Infinity, status: 'ok' };
  }

  // Already marked as breached
  if (ticket.sla_breached) {
    const minutesRemaining = ticket.sla_due_date
      ? Math.round((new Date(ticket.sla_due_date).getTime() - Date.now()) / MILLIS_PER_MINUTE)
      : -1;
    return { breached: true, warning: false, minutesRemaining, status: 'breached' };
  }

  if (!ticket.sla_due_date) {
    return { breached: false, warning: false, minutesRemaining: Infinity, status: 'ok' };
  }

  const dueDate = new Date(ticket.sla_due_date);
  const now = Date.now();
  const minutesRemaining = Math.round((dueDate.getTime() - now) / MILLIS_PER_MINUTE);

  if (minutesRemaining <= 0) {
    return { breached: true, warning: false, minutesRemaining, status: 'breached' };
  }

  // Warning threshold: 30 minutes before breach
  const WARNING_THRESHOLD_MINUTES = 30;
  if (minutesRemaining <= WARNING_THRESHOLD_MINUTES) {
    return { breached: false, warning: true, minutesRemaining, status: 'warning' };
  }

  return { breached: false, warning: false, minutesRemaining, status: 'ok' };
}

// ---------------------------------------------------------------------------
// 3. getSLAStatusColor
// ---------------------------------------------------------------------------

/**
 * Returns a traffic-light color for SLA status display.
 *
 * - `green`: on track, no risk
 * - `yellow`: warning level (within 30 minutes of breach)
 * - `red`: breached or past due
 */
export function getSLAStatusColor(
  dueDate: string | Date | null,
  breached: boolean,
): 'green' | 'yellow' | 'red' {
  if (breached) {
    return 'red';
  }

  if (!dueDate) {
    return 'green';
  }

  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const minutesRemaining = Math.round((due.getTime() - Date.now()) / MILLIS_PER_MINUTE);

  if (minutesRemaining <= 0) {
    return 'red';
  }

  const WARNING_THRESHOLD_MINUTES = 30;
  if (minutesRemaining <= WARNING_THRESHOLD_MINUTES) {
    return 'yellow';
  }

  return 'green';
}
