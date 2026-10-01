-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00057: CYCLE COMPLIANCE + SERVICE CREDITS
-- ═══════════════════════════════════════════════════════════════
-- The part of the contract with money attached. Cl. 5:
--
--   Cumplimiento ≥ 95%      → sin crédito
--   90% a 94.99%            → 1 ticket
--   80% a 89.99%            → 2 tickets
--   70% a 79.99%            → 3 tickets
--   < 70%                   → 5 tickets (tope máximo mensual)
--
-- valued at "la tarifa real del ticket del plan vigente", plus IVA.
--
-- THE DENOMINATOR IS THE WHOLE RISK
-- Compliance is met / (met + breached) over tickets that actually carried an
-- SLA. Two rules protect that figure:
--
--   · Tickets with sla_applies = false are EXCLUDED, not counted as met. A
--     client with no support contract has no compliance figure at all — the old
--     getSLAComplianceRate() returned a hardcoded 100% for an empty set, which
--     invented a commitment that was never signed.
--
--   · The count is returned alongside the percentage, always. The contract as
--     signed has NO minimum volume for credits, so in a 3-ticket cycle a single
--     miss lands at 66.7% and triggers the maximum 5-ticket credit — roughly
--     16.7% of the monthly fee for one late reply. Reporting "93%" hides that;
--     reporting "93% (14 de 15)" is the defence. credit_min_tickets on the
--     contract (default 0, matching the signed text) suppresses credits below a
--     volume floor if the otrosí introducing one is ever executed.
--
-- A cycle still in progress reports compliance over what has been answered so
-- far and flags itself as partial. Credits are only meaningful once closed, so
-- an open cycle returns them as a projection.
--
-- Depends on: 00054 (ticket_sla_status), 00055 (support_cycle_for).

-- ---------------------------------------------------------------
-- 1. support_cycle_compliance
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION support_cycle_compliance(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  cycle_start        date,
  cycle_end          date,
  cycle_label        text,
  is_closed          boolean,
  measurable         integer,   -- tickets that carried an SLA
  met                integer,
  breached           integer,
  pending            integer,   -- still inside their deadline
  excluded_count     integer,   -- no SLA owed: no contract, or classification
  compliance_pct     numeric,   -- NULL when there is nothing to measure
  credit_tickets     integer,
  credit_cop         numeric,
  credit_suppressed  boolean,   -- below credit_min_tickets
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
      AND (t.created_at AT TIME ZONE 'America/Bogota')::date
          BETWEEN v_cycle.cycle_start AND v_cycle.cycle_end
  LOOP
    IF NOT v_row.sla_applies THEN
      v_excl := v_excl + 1;
      CONTINUE;
    END IF;

    -- ticket_sla_status already credits paused business time (cl. 4).
    CASE (SELECT status FROM ticket_sla_status(v_row.id))
      WHEN 'met'      THEN v_met    := v_met + 1;
      WHEN 'breached' THEN v_breach := v_breach + 1;
      WHEN 'pending'  THEN v_pend   := v_pend + 1;
      ELSE                 v_excl   := v_excl + 1;
    END CASE;
  END LOOP;

  -- Only settled tickets can be scored. A ticket still inside its deadline is
  -- neither met nor breached, so counting it either way would be a guess.
  v_total := v_met + v_breach;

  IF v_total = 0 THEN
    -- No measurable tickets: no compliance figure exists. NULL, never 100.
    v_pct   := NULL;
    v_basis := 'sin tickets medibles en el ciclo';
  ELSE
    v_pct := round((v_met::numeric / v_total) * 100, 2);

    v_credit := CASE
      WHEN v_pct >= 95 THEN 0
      WHEN v_pct >= 90 THEN 1
      WHEN v_pct >= 80 THEN 2
      WHEN v_pct >= 70 THEN 3
      ELSE 5                     -- tope máximo mensual (cl. 5)
    END;

    -- Volume floor, if one was ever agreed. Default 0 = the contract as signed,
    -- where a 3-ticket cycle can trigger the maximum credit.
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
    v_cycle.cycle_start,
    v_cycle.cycle_end,
    v_cycle.cycle_label,
    (v_cycle.cycle_end < (now() AT TIME ZONE 'America/Bogota')::date),
    v_total,
    v_met,
    v_breach,
    v_pend,
    v_excl,
    v_pct,
    v_credit,
    (v_credit * v_contract.ticket_unit_price_cop)::numeric,
    v_supp,
    v_basis;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION support_cycle_compliance(uuid, date) IS
  'Response-SLA compliance and the resulting service credit for one cycle (contract cl. 5). compliance_pct is NULL when nothing was measurable — never 100. Always read it together with `measurable`.';

-- ---------------------------------------------------------------
-- 2. support_termination_risk
-- ---------------------------------------------------------------
-- Cl. 10 makes sustained failure a termination cause: monthly compliance below
-- 70% for two consecutive months, or three within one semester.
--
-- This exists so the answer arrives BEFORE the condition is met. Learning that
-- two months have already gone by is learning that the client may already walk.
CREATE OR REPLACE FUNCTION support_termination_risk(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  cycles_evaluated    integer,
  below_70_total      integer,
  below_70_consecutive integer,
  at_risk             boolean,
  detail              text
) AS $fn$
DECLARE
  v_probe       date := p_at;
  v_pct         numeric;
  v_below       integer := 0;
  v_consec      integer := 0;
  v_max_consec  integer := 0;
  v_evaluated   integer := 0;
  v_parts       text[] := '{}';
  v_cycle       record;
  i             integer;
BEGIN
  -- Six cycles back: the semester window the clause uses.
  FOR i IN 0..5 LOOP
    SELECT * INTO v_cycle FROM support_cycle_for(p_contract_id, v_probe);
    EXIT WHEN v_cycle.cycle_start IS NULL;

    SELECT compliance_pct INTO v_pct
    FROM support_cycle_compliance(p_contract_id, v_cycle.cycle_start);

    -- A cycle with nothing measurable is not a failing cycle. Treating NULL as
    -- a breach would manufacture a termination cause out of a quiet month.
    IF v_pct IS NOT NULL THEN
      v_evaluated := v_evaluated + 1;

      IF v_pct < 70 THEN
        v_below  := v_below + 1;
        v_consec := v_consec + 1;
        v_max_consec := greatest(v_max_consec, v_consec);
        v_parts := v_parts || format('%s: %s%%', v_cycle.cycle_label, v_pct);
      ELSE
        v_consec := 0;
      END IF;
    END IF;

    v_probe := (v_cycle.cycle_start - INTERVAL '1 day')::date;
  END LOOP;

  RETURN QUERY SELECT
    v_evaluated,
    v_below,
    v_max_consec,
    (v_max_consec >= 2 OR v_below >= 3),
    CASE
      WHEN v_below = 0 THEN 'Sin ciclos por debajo del 70%'
      ELSE array_to_string(v_parts, ' | ')
    END;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION support_termination_risk(uuid, date) IS
  'Whether sustained SLA failure has reached the termination cause of contract cl. 10 (below 70% twice consecutively, or three times in a semester). Cycles with nothing measurable are skipped, not counted as failures.';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS support_termination_risk(uuid, date);
--   DROP FUNCTION IF EXISTS support_cycle_compliance(uuid, date);
-- ═══════════════════════════════════════════════════════════════
