-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00053: SLA STAMP TRIGGER + BUSINESS-HOUR ARITHMETIC IN SQL
-- ═══════════════════════════════════════════════════════════════
-- Tickets are created from TEN different code paths: createTicket, the portal
-- (two), the inbox, the inbound-email service, the AI assistant tools, the MCP
-- tools, the AI chat route, the channel webhook and the public v1 API. Stamping
-- the SLA in each of them would be ten copies of the same logic to keep in
-- sync — exactly the failure the round-robin cleanup in 00049 just removed.
--
-- So the stamp lives in a BEFORE INSERT trigger. Every path is covered,
-- including bulk imports, direct SQL and the MCP, and the values land inside
-- the insert transaction — there is no window in which a ticket exists without
-- its deadline while the clock is already running.
--
-- This is the same robustness argument 00041, 00045 and 00049 make:
-- instrumentation that must not be bypassable does not live in app code.
--
-- Depends on: 00048 (contracts + resolution helpers), 00050 (mitigation_due_at),
-- 00051 (sla_applies / sla_contract_id / sla_target_minutes) and 00052
-- (holidays). 00052 MUST run first: the backfill at the end of this file
-- computes deadlines, and a deadline computed before the holidays exist would
-- skip them.

-- ---------------------------------------------------------------
-- 1. add_business_minutes
-- ---------------------------------------------------------------
-- Mirrors addBusinessMinutes() in calendar.service.ts. A ticket opened outside
-- business hours starts consuming its budget at the next open, which is what
-- the contract provides for (cl. 4: requests logged outside the service window
-- are not counted as breach).
--
-- Returns NULL for an unconfigured calendar or a budget that outlives the walk.
-- Never a best-effort value: a missing deadline reads as "no duty", while a
-- wrong one would silently report compliance against the wrong target.
CREATE OR REPLACE FUNCTION add_business_minutes(
  p_calendar_id uuid,
  p_from        timestamptz,
  p_minutes     integer
)
RETURNS timestamptz AS $fn$
DECLARE
  v_tz        text;
  v_day       date;
  v_remaining numeric := p_minutes;
  v_open      timestamptz;
  v_close     timestamptz;
  v_start     timestamptz;
  v_available numeric;
  v_start_t   time;
  v_end_t     time;
  i           integer;
BEGIN
  IF p_minutes IS NULL OR p_minutes <= 0 THEN
    RETURN p_from;
  END IF;

  SELECT timezone INTO v_tz FROM calendars WHERE id = p_calendar_id;
  IF v_tz IS NULL THEN
    RETURN NULL;
  END IF;

  v_day := (p_from AT TIME ZONE v_tz)::date;

  FOR i IN 0..400 LOOP
    -- A holiday is simply not a working day.
    IF EXISTS (
      SELECT 1 FROM calendar_holidays
      WHERE calendar_id = p_calendar_id AND date = v_day + i
    ) THEN
      CONTINUE;
    END IF;

    -- A row existing for the weekday IS the working day; days off are absent.
    SELECT start_time, end_time INTO v_start_t, v_end_t
    FROM calendar_schedules
    WHERE calendar_id = p_calendar_id
      AND day_of_week = EXTRACT(DOW FROM (v_day + i))::integer;

    IF v_start_t IS NULL THEN
      CONTINUE;
    END IF;

    -- Naive local timestamp -> instant, interpreted in the calendar's zone.
    v_open  := ((v_day + i)::text || ' ' || v_start_t::text)::timestamp
                 AT TIME ZONE v_tz;
    v_close := ((v_day + i)::text || ' ' || v_end_t::text)::timestamp
                 AT TIME ZONE v_tz;

    v_start := greatest(v_open, p_from);

    IF v_start >= v_close THEN
      v_start_t := NULL;
      CONTINUE;
    END IF;

    v_available := EXTRACT(EPOCH FROM (v_close - v_start)) / 60;

    IF v_remaining <= v_available THEN
      RETURN v_start + make_interval(secs => v_remaining * 60);
    END IF;

    v_remaining := v_remaining - v_available;
    v_start_t := NULL;
  END LOOP;

  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION add_business_minutes(uuid, timestamptz, integer) IS
  'Adds business minutes over a calendar weekly schedule and holidays. NULL when the calendar is unconfigured - callers must treat NULL as "no deadline", never as "now".';

-- ---------------------------------------------------------------
-- 2. end_of_business_day
-- ---------------------------------------------------------------
-- Deadline for the contract's separate P0 commitment (cl. 4): "una mitigacion o
-- solucion temporal dentro de la misma jornada habil". Rolls forward when the
-- ticket arrives after closing, on a weekend, or on a holiday.
--
-- Note the sharp edge this exposes, which is the contract as signed and not a
-- bug here: a P0 opened at 16:30 gets a 30-minute mitigation deadline, because
-- the close of that same business day is 17:00.
CREATE OR REPLACE FUNCTION end_of_business_day(
  p_calendar_id uuid,
  p_at          timestamptz
)
RETURNS timestamptz AS $fn$
DECLARE
  v_tz    text;
  v_day   date;
  v_close timestamptz;
  v_end_t time;
  i       integer;
BEGIN
  SELECT timezone INTO v_tz FROM calendars WHERE id = p_calendar_id;
  IF v_tz IS NULL THEN
    RETURN NULL;
  END IF;

  v_day := (p_at AT TIME ZONE v_tz)::date;

  FOR i IN 0..400 LOOP
    IF EXISTS (
      SELECT 1 FROM calendar_holidays
      WHERE calendar_id = p_calendar_id AND date = v_day + i
    ) THEN
      CONTINUE;
    END IF;

    SELECT end_time INTO v_end_t
    FROM calendar_schedules
    WHERE calendar_id = p_calendar_id
      AND day_of_week = EXTRACT(DOW FROM (v_day + i))::integer;

    IF v_end_t IS NULL THEN
      CONTINUE;
    END IF;

    v_close := ((v_day + i)::text || ' ' || v_end_t::text)::timestamp
                 AT TIME ZONE v_tz;

    -- False on the arrival day when the ticket came in after closing.
    IF v_close > p_at THEN
      RETURN v_close;
    END IF;

    v_end_t := NULL;
  END LOOP;

  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------
-- 3. TRIGGER FUNCTION
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION stamp_ticket_sla()
RETURNS trigger AS $fn$
DECLARE
  v_contract organization_support_contracts;
  v_minutes  integer;
  v_same_day boolean;
  v_opened   timestamptz := coalesce(NEW.created_at, now());
  v_due      timestamptz;
BEGIN
  -- Default to "no SLA owed". Everything below only ever upgrades this, so any
  -- path that reaches an unexpected state leaves the ticket OUT of the client's
  -- compliance denominator rather than counting it as a success.
  NEW.sla_applies        := false;
  NEW.sla_contract_id    := NULL;
  NEW.sla_target_minutes := NULL;
  NEW.mitigation_due_at  := NULL;

  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT ticket_type_counts_for_sla(NEW.type) THEN
    RETURN NEW;
  END IF;

  v_contract := support_contract_at(
    NEW.organization_id,
    (v_opened AT TIME ZONE 'America/Bogota')::date
  );

  IF v_contract.id IS NULL
     OR NOT v_contract.sla_enabled
     OR v_contract.calendar_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT first_response_minutes, mitigation_same_day
    INTO v_minutes, v_same_day
  FROM support_contract_targets
  WHERE contract_id = v_contract.id AND severity = NEW.urgency;

  -- A contract in force with no target for this severity is a
  -- misconfiguration, not an exemption: we never claim compliance against a
  -- target that was never agreed.
  IF v_minutes IS NULL THEN
    RETURN NEW;
  END IF;

  v_due := add_business_minutes(v_contract.calendar_id, v_opened, v_minutes);
  IF v_due IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.sla_applies        := true;
  NEW.sla_contract_id    := v_contract.id;
  NEW.sla_target_minutes := v_minutes;
  NEW.sla_due_date       := v_due;

  IF v_same_day THEN
    NEW.mitigation_due_at :=
      end_of_business_day(v_contract.calendar_id, v_opened);
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_stamp_ticket_sla ON tickets;
CREATE TRIGGER trg_stamp_ticket_sla
  BEFORE INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION stamp_ticket_sla();

-- ---------------------------------------------------------------
-- 4. BACKFILL — the cycle already in progress
-- ---------------------------------------------------------------
-- The service started 2026-09-22 and this migration lands after it, so tickets
-- already opened in cycle 1 would otherwise carry no SLA at all — and cycle 1
-- is the one the first monthly report has to cover.
--
-- Scoped to tickets created on or after the contract's effective_from. Anything
-- older stays unstamped on purpose: ~80% of historical rows are Excel imports
-- whose created_at is the spreadsheet date, so a deadline computed from it
-- would be fiction.
UPDATE tickets t
SET sla_applies        = true,
    sla_contract_id    = c.id,
    sla_target_minutes = tg.first_response_minutes,
    sla_due_date       = add_business_minutes(
                           c.calendar_id, t.created_at, tg.first_response_minutes),
    mitigation_due_at  = CASE
                           WHEN tg.mitigation_same_day
                           THEN end_of_business_day(c.calendar_id, t.created_at)
                           ELSE NULL
                         END
FROM organization_support_contracts c
JOIN support_contract_targets tg ON tg.contract_id = c.id
WHERE t.organization_id = c.organization_id
  AND tg.severity = t.urgency
  AND c.sla_enabled
  AND c.calendar_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND t.sla_applies = false
  AND ticket_type_counts_for_sla(t.type)
  AND (t.created_at AT TIME ZONE 'America/Bogota')::date >= c.effective_from
  AND (c.effective_to IS NULL
       OR (t.created_at AT TIME ZONE 'America/Bogota')::date <= c.effective_to)
  AND add_business_minutes(
        c.calendar_id, t.created_at, tg.first_response_minutes) IS NOT NULL;

DO $seed$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM tickets WHERE sla_applies = true;
  RAISE NOTICE '[00053] % tickets now carry an SLA.', v_n;
END $seed$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP TRIGGER IF EXISTS trg_stamp_ticket_sla ON tickets;
--   DROP FUNCTION IF EXISTS stamp_ticket_sla();
--   DROP FUNCTION IF EXISTS end_of_business_day(uuid, timestamptz);
--   DROP FUNCTION IF EXISTS add_business_minutes(uuid, timestamptz, integer);
--   UPDATE tickets SET sla_applies = false, sla_contract_id = NULL,
--          sla_target_minutes = NULL, sla_due_date = NULL, mitigation_due_at = NULL
--    WHERE sla_contract_id IS NOT NULL;
-- ═══════════════════════════════════════════════════════════════
