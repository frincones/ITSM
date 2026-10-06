-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00062: EXCLUDE TICKETS WITH IMPOSSIBLE DATES
-- ═══════════════════════════════════════════════════════════════
-- Cycle 1 reported 26 tickets and 18 against quota. Only 13 are real.
--
-- A bulk import re-dated April and May tickets to 2 and 3 October 2026. The
-- give-aways, confirmed against production:
--
--   · six warranty tickets share created_at 2026-10-03 00:00:16 to the second,
--     with created_by NULL — the signature of one batch write, not six people
--     filing tickets
--   · their updated_at is 2026-04-21, six months BEFORE they were "created"
--   · TKT-2604-00477 still says "entrega lunes 9 de marzo" in its own title
--   · PDZ-2606-00221 and PDZ-2610-00221 carry the identical title
--     "Re-balanceo de ejecutivos de Finanzauto" — the same ticket imported
--     twice, counted twice against quota
--
-- The operator's recollection is what caught this: no warranty tickets were
-- raised in the cycle, and every one of the seven the system showed is
-- corrupted. Zero are real.
--
-- TWO GUARDS, NOT ONE
-- `updated_at >= created_at` alone is not enough: touching a corrupted ticket
-- today repairs its updated_at and it would slip back into the count. So a
-- ticket is countable only when BOTH hold:
--
--   created_at <= now()              a ticket cannot be created in the future
--   updated_at >= created_at         a ticket cannot be updated before it exists
--
-- Neither requires judgement, and together they also protect the NEXT import:
-- a future-dated row will never be stamped or counted in the first place.
--
-- Nothing is deleted. The rows stay, visible and queryable; they are only
-- excluded from quota, SLA and compliance.
--
-- Depends on: 00053 (stamp), 00055 (cycles), 00057 (compliance), 00061.

-- ---------------------------------------------------------------
-- 1. The predicate, defined once
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION ticket_dates_plausible(
  p_created timestamptz,
  p_updated timestamptz
)
RETURNS boolean AS $fn$
  SELECT p_created IS NOT NULL
     AND p_created <= now()
     AND (p_updated IS NULL OR p_updated >= p_created);
$fn$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION ticket_dates_plausible(timestamptz, timestamptz) IS
  'FALSE for a ticket whose dates are logically impossible — created in the future, or updated before it existed. Such rows are excluded from quota, SLA and compliance without being deleted.';

GRANT EXECUTE ON FUNCTION ticket_dates_plausible(timestamptz, timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. The stamp refuses an implausible ticket
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
  NEW.sla_applies        := false;
  NEW.sla_contract_id    := NULL;
  NEW.sla_target_minutes := NULL;
  NEW.sla_due_date       := NULL;
  NEW.mitigation_due_at  := NULL;

  -- An impossible creation date cannot produce a defensible deadline. This is
  -- what stops the next bad import from arriving with an SLA attached.
  IF NOT ticket_dates_plausible(NEW.created_at, NEW.updated_at) THEN
    RETURN NEW;
  END IF;

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

-- ---------------------------------------------------------------
-- 3. Quota count excludes them
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS support_cycle_usage(uuid, date);

CREATE OR REPLACE FUNCTION support_cycle_usage(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  cycle_start   date,
  cycle_end     date,
  cycle_label   text,
  quota         integer,
  consumed      integer,
  quota_carried integer,
  consumed_net  integer,
  remaining     integer,
  overage       integer,
  pct_used      numeric,
  overage_cop   numeric,
  is_closed     boolean,
  excluded_bad_dates integer
) AS $fn$
DECLARE
  v_cycle    record;
  v_contract organization_support_contracts;
  v_closure  support_cycle_closures;
  v_count    integer;
  v_bad      integer;
  v_carried  integer;
  v_net      integer;
BEGIN
  SELECT * INTO v_contract
  FROM organization_support_contracts WHERE id = p_contract_id;
  IF v_contract.id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_cycle FROM support_cycle_for(p_contract_id, p_at);
  IF v_cycle.cycle_start IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_closure
  FROM support_cycle_closures c
  WHERE c.contract_id = p_contract_id AND c.cycle_start = v_cycle.cycle_start;

  IF v_closure.id IS NOT NULL THEN
    RETURN QUERY SELECT
      v_closure.cycle_start, v_closure.cycle_end, v_cycle.cycle_label,
      v_closure.quota, v_closure.consumed, v_closure.quota_carried,
      v_closure.consumed_net,
      greatest(v_closure.quota - v_closure.consumed_net, 0),
      v_closure.overage,
      round((v_closure.consumed_net::numeric / v_closure.quota) * 100, 1),
      v_closure.overage_cop,
      true,
      0;
    RETURN;
  END IF;

  SELECT count(*) filter (where ticket_dates_plausible(t.created_at, t.updated_at)),
         count(*) filter (where not ticket_dates_plausible(t.created_at, t.updated_at))
    INTO v_count, v_bad
  FROM tickets t
  WHERE t.organization_id = v_contract.organization_id
    AND t.deleted_at IS NULL
    AND ticket_type_consumes_quota(t.type)
    AND (t.created_at AT TIME ZONE 'America/Bogota')::date
        BETWEEN v_cycle.cycle_start AND v_cycle.cycle_end;

  v_carried := support_cycle_quota_carryforward(p_contract_id, p_at);
  v_net     := greatest(v_count - v_carried, 0);

  RETURN QUERY SELECT
    v_cycle.cycle_start, v_cycle.cycle_end, v_cycle.cycle_label,
    v_contract.monthly_ticket_quota,
    v_count, v_carried, v_net,
    greatest(v_contract.monthly_ticket_quota - v_net, 0),
    greatest(v_net - v_contract.monthly_ticket_quota, 0),
    round((v_net::numeric / v_contract.monthly_ticket_quota) * 100, 1),
    greatest(v_net - v_contract.monthly_ticket_quota, 0)
      * v_contract.ticket_unit_price_cop,
    false,
    v_bad;
END;
$fn$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION support_cycle_usage(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION support_cycle_usage(uuid, date) IS
  'Quota usage for a cycle, excluding tickets with impossible dates (reported separately as excluded_bad_dates). Reads the frozen snapshot once the cycle is closed.';

-- ---------------------------------------------------------------
-- 4. Compliance excludes them from the denominator entirely
-- ---------------------------------------------------------------
-- They are not "sin SLA" either: a row that should not exist must not appear
-- in any bucket, or the report would invite questions about tickets nobody
-- raised.
CREATE OR REPLACE FUNCTION support_cycle_compliance(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  cycle_start        date,
  cycle_end          date,
  cycle_label        text,
  is_closed          boolean,
  measurable         integer,
  met                integer,
  breached           integer,
  pending            integer,
  excluded_count     integer,
  compliance_pct     numeric,
  credit_tickets     integer,
  credit_cop         numeric,
  credit_suppressed  boolean,
  credit_basis       text
) AS $fn$
DECLARE
  v_cycle    record;
  v_contract organization_support_contracts;
  v_met      integer := 0;
  v_breach   integer := 0;
  v_pend     integer := 0;
  v_excl     integer := 0;
  v_total    integer;
  v_pct      numeric;
  v_credit   integer := 0;
  v_supp     boolean := false;
  v_basis    text;
  v_row      record;
BEGIN
  SELECT * INTO v_contract
  FROM organization_support_contracts WHERE id = p_contract_id;
  IF v_contract.id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_cycle FROM support_cycle_for(p_contract_id, p_at);
  IF v_cycle.cycle_start IS NULL THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT t.id, t.sla_applies
    FROM tickets t
    WHERE t.organization_id = v_contract.organization_id
      AND t.deleted_at IS NULL
      AND ticket_dates_plausible(t.created_at, t.updated_at)
      AND (t.created_at AT TIME ZONE 'America/Bogota')::date
          BETWEEN v_cycle.cycle_start AND v_cycle.cycle_end
  LOOP
    IF NOT v_row.sla_applies THEN
      v_excl := v_excl + 1;
      CONTINUE;
    END IF;

    CASE (SELECT status FROM ticket_sla_status(v_row.id))
      WHEN 'met'      THEN v_met    := v_met + 1;
      WHEN 'breached' THEN v_breach := v_breach + 1;
      WHEN 'pending'  THEN v_pend   := v_pend + 1;
      ELSE                 v_excl   := v_excl + 1;
    END CASE;
  END LOOP;

  v_total := v_met + v_breach;

  IF v_total = 0 THEN
    v_pct   := NULL;
    v_basis := 'sin tickets medibles en el ciclo';
  ELSE
    v_pct := round((v_met::numeric / v_total) * 100, 2);

    v_credit := CASE
      WHEN v_pct >= 95 THEN 0
      WHEN v_pct >= 90 THEN 1
      WHEN v_pct >= 80 THEN 2
      WHEN v_pct >= 70 THEN 3
      ELSE 5
    END;

    IF v_credit > 0 AND v_total < v_contract.credit_min_tickets THEN
      v_supp   := true;
      v_credit := 0;
      v_basis  := format('%s de %s dentro de SLA — crédito suprimido: el ciclo no alcanza el piso de %s tickets',
                         v_met, v_total, v_contract.credit_min_tickets);
    ELSE
      v_basis := format('%s de %s tickets medibles dentro de SLA', v_met, v_total);
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_cycle.cycle_start, v_cycle.cycle_end, v_cycle.cycle_label,
    (v_cycle.cycle_end < (now() AT TIME ZONE 'America/Bogota')::date),
    v_total, v_met, v_breach, v_pend, v_excl, v_pct,
    v_credit, (v_credit * v_contract.ticket_unit_price_cop)::numeric,
    v_supp, v_basis;
END;
$fn$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION support_cycle_compliance(uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. The sla-check cron stops chasing them
-- ---------------------------------------------------------------
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
      AND ticket_dates_plausible(t.created_at, t.updated_at)
      AND t.status NOT IN ('closed', 'cancelled', 'resolved')
  ),
  scored AS (
    SELECT c.*, c.sla_due_date + make_interval(mins => c.paused) AS due_at
    FROM candidate c
  )
  SELECT
    s.id, s.tenant_id, s.organization_id, s.ticket_number, s.title,
    s.urgency, s.status, s.assigned_agent_id, s.requester_email,
    coalesce(s.sla_breached, false), s.sla_target_minutes, s.paused,
    s.due_at,
    CASE WHEN now() > s.due_at THEN 'breached' ELSE 'warning' END
  FROM scored s
  WHERE now() > s.due_at
     OR now() >= s.due_at - make_interval(
          mins => (s.sla_target_minutes * (1 - p_warn_fraction))::integer)
  ORDER BY s.due_at;
$fn$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION sla_tickets_at_risk(numeric) TO service_role;

-- ---------------------------------------------------------------
-- 6. Un-stamp the ones the 00053 backfill already touched
-- ---------------------------------------------------------------
-- The backfill ran before this guard existed, so it attached deadlines to
-- seven corrupted tickets — the sla-check cron would have chased April tickets
-- as if they had live deadlines. Clearing the stamp, not the rows.
UPDATE tickets
SET sla_applies        = false,
    sla_contract_id    = NULL,
    sla_target_minutes = NULL,
    sla_due_date       = NULL,
    mitigation_due_at  = NULL
WHERE sla_applies = true
  AND NOT ticket_dates_plausible(created_at, updated_at);

DO $report$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM tickets WHERE NOT ticket_dates_plausible(created_at, updated_at)
    AND deleted_at IS NULL;
  RAISE NOTICE '[00062] % tickets con fechas imposibles quedan excluidos del cupo y del SLA.', v_n;
END $report$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- Restore the 00061 body of stamp_ticket_sla, the 00058 body of
-- support_cycle_usage, the 00057 body of support_cycle_compliance and the
-- 00054 body of sla_tickets_at_risk, then:
--   DROP FUNCTION IF EXISTS ticket_dates_plausible(timestamptz, timestamptz);
-- The un-stamping in section 6 is reversed by re-running the 00053 backfill.
-- ═══════════════════════════════════════════════════════════════
