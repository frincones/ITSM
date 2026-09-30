-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00054: SLA COMPLIANCE HELPERS + sla-check SCHEDULE
-- ═══════════════════════════════════════════════════════════════
-- Closes phase 2. Three pieces:
--
--   1. business_minutes_between() — the counterpart to add_business_minutes()
--   2. ticket_sla_status() / sla_tickets_at_risk() — pause-aware compliance
--   3. the pg_cron schedule for /api/cron/sla-check, which until now was an
--      endpoint nobody ever called: it was never scheduled, and its query
--      filtered on `sla_due_date IS NOT NULL` against a column that was NULL
--      on every row.
--
-- WHY PAUSES ARE COUNTED IN BUSINESS MINUTES
-- The contract suspends the clock while a ticket waits on the client (cl. 4),
-- and the clock itself only runs Mon-Fri 08:00-17:00. So the pause credit has
-- to be measured on the same scale. A ticket paused Friday 16:00 → Monday 10:00
-- is 66 hours of wall time but only 3 business hours (Fri 16-17 plus Mon 8-10).
-- Crediting the 66 would hand us 63 hours of deadline we never lost — an
-- inflated compliance figure, which is the dangerous direction: it collapses
-- the moment the client cross-checks their own email trail.
--
-- Depends on: 00051 (stamp columns), 00052 (holidays), 00053 (add_business_minutes).

-- ---------------------------------------------------------------
-- 1. business_minutes_between
-- ---------------------------------------------------------------
-- Mirrors businessMinutesBetween() in calendar.service.ts.
CREATE OR REPLACE FUNCTION business_minutes_between(
  p_calendar_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
RETURNS integer AS $fn$
DECLARE
  v_tz      text;
  v_day     date;
  v_open    timestamptz;
  v_close   timestamptz;
  v_start   timestamptz;
  v_end     timestamptz;
  v_total   numeric := 0;
  v_start_t time;
  v_end_t   time;
  i         integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RETURN 0;
  END IF;

  SELECT timezone INTO v_tz FROM calendars WHERE id = p_calendar_id;
  IF v_tz IS NULL THEN
    RETURN 0;
  END IF;

  v_day := (p_from AT TIME ZONE v_tz)::date;

  FOR i IN 0..400 LOOP
    IF EXISTS (
      SELECT 1 FROM calendar_holidays
      WHERE calendar_id = p_calendar_id AND date = v_day + i
    ) THEN
      CONTINUE;
    END IF;

    SELECT start_time, end_time INTO v_start_t, v_end_t
    FROM calendar_schedules
    WHERE calendar_id = p_calendar_id
      AND day_of_week = EXTRACT(DOW FROM (v_day + i))::integer;

    IF v_start_t IS NULL THEN
      CONTINUE;
    END IF;

    v_open  := ((v_day + i)::text || ' ' || v_start_t::text)::timestamp
                 AT TIME ZONE v_tz;
    v_close := ((v_day + i)::text || ' ' || v_end_t::text)::timestamp
                 AT TIME ZONE v_tz;

    -- Windows are walked in order, so the first one starting past p_to ends it.
    EXIT WHEN v_open >= p_to;

    v_start := greatest(v_open, p_from);
    v_end   := least(v_close, p_to);

    IF v_end > v_start THEN
      v_total := v_total + EXTRACT(EPOCH FROM (v_end - v_start)) / 60;
    END IF;

    v_start_t := NULL;
  END LOOP;

  RETURN round(v_total)::integer;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------
-- 2. ticket_paused_business_minutes
-- ---------------------------------------------------------------
-- Business minutes a ticket spent in a state that suspends the SLA clock,
-- counted only up to `p_until` (the first response, or now for an open ticket)
-- — time paused after we already answered cannot extend a deadline we met.
--
-- Pausing intervals come from ticket_status_history: each row with
-- pauses_sla = true opens one, and the next transition on that ticket closes
-- it. A pause still open is closed at p_until.
CREATE OR REPLACE FUNCTION ticket_paused_business_minutes(
  p_ticket_id uuid,
  p_until     timestamptz
)
RETURNS integer AS $fn$
DECLARE
  v_calendar_id uuid;
  v_total       integer := 0;
  v_row         record;
BEGIN
  SELECT c.calendar_id INTO v_calendar_id
  FROM tickets t
  JOIN organization_support_contracts c ON c.id = t.sla_contract_id
  WHERE t.id = p_ticket_id;

  IF v_calendar_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT h.changed_at AS paused_at,
           lead(h.changed_at) OVER (ORDER BY h.changed_at) AS resumed_at,
           h.pauses_sla
    FROM ticket_status_history h
    WHERE h.ticket_id = p_ticket_id
    ORDER BY h.changed_at
  LOOP
    CONTINUE WHEN NOT v_row.pauses_sla;
    CONTINUE WHEN v_row.paused_at >= p_until;

    v_total := v_total + business_minutes_between(
      v_calendar_id,
      v_row.paused_at,
      least(coalesce(v_row.resumed_at, p_until), p_until)
    );
  END LOOP;

  RETURN v_total;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------
-- 3. ticket_sla_status
-- ---------------------------------------------------------------
-- Single source of truth for "did we answer in time". Reports
-- 'not_applicable' for tickets that never owed an SLA rather than folding them
-- into 'met' — the same rule as sla_applies_for_ticket in 00048.
CREATE OR REPLACE FUNCTION ticket_sla_status(p_ticket_id uuid)
RETURNS TABLE (
  status           text,
  paused_minutes   integer,
  effective_due_at timestamptz,
  responded_at     timestamptz
) AS $fn$
DECLARE
  v_t      record;
  v_paused integer;
  v_due    timestamptz;
  v_until  timestamptz;
BEGIN
  SELECT sla_applies, sla_due_date, first_response_at
    INTO v_t
  FROM tickets WHERE id = p_ticket_id;

  IF v_t IS NULL OR NOT v_t.sla_applies OR v_t.sla_due_date IS NULL THEN
    RETURN QUERY SELECT 'not_applicable'::text, 0, NULL::timestamptz, v_t.first_response_at;
    RETURN;
  END IF;

  v_until  := coalesce(v_t.first_response_at, now());
  v_paused := ticket_paused_business_minutes(p_ticket_id, v_until);
  v_due    := v_t.sla_due_date + make_interval(mins => v_paused);

  RETURN QUERY SELECT
    CASE
      WHEN v_t.first_response_at IS NOT NULL
           AND v_t.first_response_at <= v_due THEN 'met'
      WHEN v_t.first_response_at IS NOT NULL   THEN 'breached'
      WHEN now() <= v_due                      THEN 'pending'
      ELSE 'breached'
    END,
    v_paused,
    v_due,
    v_t.first_response_at;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION ticket_sla_status(uuid) IS
  'Response-SLA outcome for one ticket, crediting paused BUSINESS minutes per contract cl. 4. Returns met / breached / pending / not_applicable.';

-- ---------------------------------------------------------------
-- 4. sla_tickets_at_risk
-- ---------------------------------------------------------------
-- What the cron scans, in one round trip. Only tickets that still owe a first
-- response can be at risk: the response SLA stops at first_response_at, so a
-- ticket that was answered is settled regardless of its current status.
--
-- The warning threshold is a FRACTION of the target rather than a fixed number
-- of minutes. The old checkSLABreach() warned 30 minutes out, which is most of
-- the runway on a 4h P0 target and meaningless on a 48h P2 one.
CREATE OR REPLACE FUNCTION sla_tickets_at_risk(
  p_warn_fraction numeric DEFAULT 0.75
)
RETURNS TABLE (
  ticket_id         uuid,
  tenant_id         uuid,
  organization_id   uuid,
  ticket_number     text,
  title             text,
  urgency           severity_level,
  status            ticket_status,
  assigned_agent_id uuid,
  requester_email   text,
  already_breached  boolean,
  target_minutes    integer,
  paused_minutes    integer,
  effective_due_at  timestamptz,
  risk              text
) AS $fn$
  WITH candidate AS (
    SELECT t.id, t.tenant_id, t.organization_id, t.ticket_number, t.title,
           t.urgency, t.status, t.assigned_agent_id, t.requester_email,
           t.sla_breached, t.sla_target_minutes, t.sla_due_date,
           ticket_paused_business_minutes(t.id, now()) AS paused
    FROM tickets t
    WHERE t.sla_applies = true
      AND t.first_response_at IS NULL
      AND t.sla_due_date IS NOT NULL
      AND t.deleted_at IS NULL
      AND t.status NOT IN ('closed', 'cancelled', 'resolved')
  ),
  scored AS (
    SELECT c.*,
           c.sla_due_date + make_interval(mins => c.paused) AS due_at
    FROM candidate c
  )
  SELECT
    s.id, s.tenant_id, s.organization_id, s.ticket_number, s.title,
    s.urgency, s.status, s.assigned_agent_id, s.requester_email,
    coalesce(s.sla_breached, false),
    s.sla_target_minutes,
    s.paused,
    s.due_at,
    CASE WHEN now() > s.due_at THEN 'breached' ELSE 'warning' END
  FROM scored s
  WHERE now() > s.due_at
     OR now() >= s.due_at - make_interval(
          mins => (s.sla_target_minutes * (1 - p_warn_fraction))::integer)
  ORDER BY s.due_at;
$fn$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION sla_tickets_at_risk(numeric) IS
  'Tickets breaching or approaching their response deadline, pause-aware. Only tickets still owing a first response appear.';

-- ---------------------------------------------------------------
-- 5. pg_cron: sla-check
-- ---------------------------------------------------------------
-- Every 15 minutes inside the contract window (13:00-21:59 UTC =
-- 08:00-16:59 America/Bogota, Mon-Fri). Outside those hours the clock is not
-- running, so there is nothing a run could discover.
--
-- 4 runs/hour x 9 hours x 5 days = 180/week. That is more than the other jobs,
-- and justified: the tightest target on the Professional plan is 4 hours (P0),
-- and an escalation that arrives an hour late is an escalation that did not
-- happen. Still well under the cadence that drained the Disk IO budget before
-- 00046 (every 5 and 10 minutes, around the clock).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sla-check')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sla-check');

    PERFORM cron.schedule(
      'sla-check',
      '*/15 13-21 * * 1-5',
      $job$SELECT public.call_cron_endpoint('/api/cron/sla-check')$job$
    );
    RAISE NOTICE '[00054] sla-check scheduled: */15 13-21 * * 1-5 (08:00-16:59 Bogota).';
  ELSE
    RAISE NOTICE '[00054] pg_cron not installed — schedule sla-check manually.';
  END IF;
END $cron$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   SELECT cron.unschedule('sla-check');
--   DROP FUNCTION IF EXISTS sla_tickets_at_risk(numeric);
--   DROP FUNCTION IF EXISTS ticket_sla_status(uuid);
--   DROP FUNCTION IF EXISTS ticket_paused_business_minutes(uuid, timestamptz);
--   DROP FUNCTION IF EXISTS business_minutes_between(uuid, timestamptz, timestamptz);
-- ═══════════════════════════════════════════════════════════════
