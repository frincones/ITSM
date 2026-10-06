-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00055: BILLING CYCLES, QUOTA USAGE, RECLASSIFICATION LOG
-- ═══════════════════════════════════════════════════════════════
-- 00048 established WHICH classifications consume quota
-- (ticket_type_consumes_quota). Nothing ever counted them. This adds the
-- counting, on the cycle the contract actually bills on.
--
-- THE CYCLE IS NOT A CALENDAR MONTH
-- Contract cl. 8: "El ciclo mensual inicia en la fecha de arranque del servicio
-- acordada por LAS PARTES, y no por calendario de fin de mes [...] si el
-- servicio inicia el 21, cada ciclo cierra el día 21 del mes siguiente."
-- For Podenza that means the 22nd to the 21st. Counting by calendar month would
-- put roughly a third of every cycle's tickets in the wrong bucket, which is
-- the difference between billing overage and not.
--
-- RESTITUTION FALLS OUT OF COUNTING BY CURRENT TYPE
-- Cl. 2: "Si un ticket cobrado como soporte se reclasifica como desarrollo
-- evolutivo o como incidente de terceros, el cupo se restituye en el conteo del
-- mes o, si este ya cerró, en el siguiente." Because usage counts each ticket by
-- its CURRENT type, a reclassification restores the quota automatically. What
-- the contract additionally requires is that the report SHOW those
-- reclassifications (cl. 7), which is what ticket_type_history is for.
--
-- Reopens are already handled: cl. 3 says a reopen consumes no additional
-- quota, and since usage counts distinct tickets by creation date rather than
-- events, a reopened ticket is never counted twice.
--
-- Depends on: 00048 (contracts, ticket_type_consumes_quota).

-- ---------------------------------------------------------------
-- 1. support_cycle_for — the billing window containing a date
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION support_cycle_for(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  cycle_start date,
  cycle_end   date,
  cycle_label text
) AS $fn$
DECLARE
  v_day   smallint;
  v_from  date;
  v_start date;
  v_end   date;
BEGIN
  SELECT cycle_start_day, effective_from
    INTO v_day, v_from
  FROM organization_support_contracts
  WHERE id = p_contract_id;

  IF v_day IS NULL THEN
    RETURN;
  END IF;

  -- On or after the cycle day, the cycle opened this month; before it, last.
  IF EXTRACT(DAY FROM p_at)::smallint >= v_day THEN
    v_start := make_date(
      EXTRACT(YEAR FROM p_at)::int, EXTRACT(MONTH FROM p_at)::int, v_day);
  ELSE
    v_start := make_date(
      EXTRACT(YEAR FROM p_at)::int, EXTRACT(MONTH FROM p_at)::int, v_day)
      - INTERVAL '1 month';
  END IF;

  -- A cycle can never reach back before the contract existed.
  v_start := greatest(v_start, v_from);
  v_end   := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  RETURN QUERY SELECT
    v_start,
    v_end,
    to_char(v_start, 'DD-Mon-YYYY') || ' → ' || to_char(v_end, 'DD-Mon-YYYY');
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION support_cycle_for(uuid, date) IS
  'Billing cycle containing a date, running cycle_start_day to the day before the next one (contract cl. 8) — NOT a calendar month.';

-- ---------------------------------------------------------------
-- 2. ticket_type_history — reclassification log
-- ---------------------------------------------------------------
-- Mirrors ticket_status_history (00045). Append-only, written only by triggers,
-- so a reclassification done by direct SQL or the MCP is recorded just like one
-- done in the UI.
--
-- consumed_quota_before/after are stored rather than derived because
-- ticket_type_consumes_quota() may change if the otrosí adds a "corrección de
-- defectos" category — and a closed cycle's report must keep showing the rule
-- that was applied at the time, not today's rule.
CREATE TABLE IF NOT EXISTS ticket_type_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id       uuid REFERENCES organizations(id) ON DELETE SET NULL,
  from_type             ticket_type,
  to_type               ticket_type NOT NULL,
  consumed_quota_before boolean,
  consumed_quota_after  boolean NOT NULL,
  changed_at            timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id    uuid,
  changed_by_agent_id   uuid,
  reason                text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ticket_type_history IS
  'Append-only log of ticket classification changes. Populated by triggers only. Backs the quota restitution of contract cl. 2 and the reclassification section of the monthly report (cl. 7).';

CREATE INDEX IF NOT EXISTS idx_type_history_ticket
  ON ticket_type_history (ticket_id, changed_at);

CREATE INDEX IF NOT EXISTS idx_type_history_org_changed
  ON ticket_type_history (tenant_id, organization_id, changed_at DESC)
  WHERE organization_id IS NOT NULL;

-- Only real reclassifications matter for the report; the creation row does not.
CREATE INDEX IF NOT EXISTS idx_type_history_reclassifications
  ON ticket_type_history (tenant_id, changed_at DESC)
  WHERE from_type IS NOT NULL;

ALTER TABLE ticket_type_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_type_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS type_history_select ON ticket_type_history;
CREATE POLICY type_history_select ON ticket_type_history
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM agents a
        WHERE a.user_id = auth.uid()
          AND a.is_active = true
          AND a.role IN ('admin', 'supervisor', 'agent')
      )
      OR organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = true
      )
    )
  );

-- No write policies: the triggers run SECURITY DEFINER and bypass RLS, and
-- FORCE ROW LEVEL SECURITY blocks everything else.

CREATE OR REPLACE FUNCTION log_ticket_type_change()
RETURNS trigger AS $fn$
DECLARE
  v_user_id  uuid := auth.uid();
  v_agent_id uuid;
  v_from     ticket_type;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents WHERE user_id = v_user_id LIMIT 1;
  END IF;

  -- TG_OP tells creation from reclassification; from_type NULL marks the former.
  IF TG_OP = 'UPDATE' THEN
    v_from := OLD.type;
  END IF;

  INSERT INTO ticket_type_history (
    ticket_id, tenant_id, organization_id,
    from_type, to_type,
    consumed_quota_before, consumed_quota_after,
    changed_at, changed_by_user_id, changed_by_agent_id, reason
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.organization_id,
    v_from, NEW.type,
    CASE WHEN v_from IS NULL THEN NULL ELSE ticket_type_consumes_quota(v_from) END,
    ticket_type_consumes_quota(NEW.type),
    CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE now() END,
    v_user_id, v_agent_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE NULL END
  );

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_ticket_type_creation ON tickets;
CREATE TRIGGER trg_log_ticket_type_creation
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_type_change();

DROP TRIGGER IF EXISTS trg_log_ticket_type_change ON tickets;
CREATE TRIGGER trg_log_ticket_type_change
  AFTER UPDATE OF type ON tickets
  FOR EACH ROW
  WHEN (OLD.type IS DISTINCT FROM NEW.type)
  EXECUTE FUNCTION log_ticket_type_change();

-- Backfill the creation row for tickets that predate this migration, so the
-- report can tell "classified as support from the start" from "reclassified
-- into support later".
INSERT INTO ticket_type_history (
  ticket_id, tenant_id, organization_id, from_type, to_type,
  consumed_quota_before, consumed_quota_after, changed_at, reason
)
SELECT t.id, t.tenant_id, t.organization_id, NULL, t.type,
       NULL, ticket_type_consumes_quota(t.type), t.created_at, 'backfill-created'
FROM tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_type_history h WHERE h.ticket_id = t.id
);

-- ---------------------------------------------------------------
-- 3. support_cycle_usage — consumption against the quota
-- ---------------------------------------------------------------
-- Counts each ticket by its CURRENT type, which is what makes the restitution
-- of cl. 2 automatic.
CREATE OR REPLACE FUNCTION support_cycle_usage(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  cycle_start      date,
  cycle_end        date,
  cycle_label      text,
  quota            integer,
  consumed         integer,
  remaining        integer,
  overage          integer,
  pct_used         numeric,
  overage_cop      numeric
) AS $fn$
DECLARE
  v_cycle    record;
  v_contract organization_support_contracts;
  v_count    integer;
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

  SELECT count(*) INTO v_count
  FROM tickets t
  WHERE t.organization_id = v_contract.organization_id
    AND t.deleted_at IS NULL
    AND ticket_type_consumes_quota(t.type)
    AND (t.created_at AT TIME ZONE 'America/Bogota')::date
        BETWEEN v_cycle.cycle_start AND v_cycle.cycle_end;

  RETURN QUERY SELECT
    v_cycle.cycle_start,
    v_cycle.cycle_end,
    v_cycle.cycle_label,
    v_contract.monthly_ticket_quota,
    v_count,
    greatest(v_contract.monthly_ticket_quota - v_count, 0),
    greatest(v_count - v_contract.monthly_ticket_quota, 0),
    round((v_count::numeric / v_contract.monthly_ticket_quota) * 100, 1),
    greatest(v_count - v_contract.monthly_ticket_quota, 0)
      * v_contract.ticket_unit_price_cop;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION support_cycle_usage(uuid, date) IS
  'Quota consumption for the cycle containing a date. Counts by CURRENT ticket type, so a reclassification restores quota automatically (contract cl. 2).';

-- ---------------------------------------------------------------
-- 4. support_cycle_reclassifications — for the monthly report
-- ---------------------------------------------------------------
-- Cl. 7 requires the report to list "reclasificaciones del período". Only real
-- changes appear (from_type IS NOT NULL); creation rows are excluded.
CREATE OR REPLACE FUNCTION support_cycle_reclassifications(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  ticket_id       uuid,
  ticket_number   text,
  title           text,
  from_type       ticket_type,
  to_type         ticket_type,
  quota_effect    text,
  changed_at      timestamptz
) AS $fn$
  WITH c AS (
    SELECT organization_id FROM organization_support_contracts WHERE id = p_contract_id
  ),
  cy AS (
    SELECT * FROM support_cycle_for(p_contract_id, p_at)
  )
  SELECT
    h.ticket_id,
    t.ticket_number,
    t.title,
    h.from_type,
    h.to_type,
    CASE
      WHEN h.consumed_quota_before AND NOT h.consumed_quota_after THEN 'restituye'
      WHEN NOT h.consumed_quota_before AND h.consumed_quota_after THEN 'consume'
      ELSE 'sin efecto'
    END,
    h.changed_at
  FROM ticket_type_history h
  JOIN tickets t ON t.id = h.ticket_id
  CROSS JOIN cy
  WHERE h.organization_id = (SELECT organization_id FROM c)
    AND h.from_type IS NOT NULL
    AND (h.changed_at AT TIME ZONE 'America/Bogota')::date
        BETWEEN cy.cycle_start AND cy.cycle_end
  ORDER BY h.changed_at DESC;
$fn$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS support_cycle_reclassifications(uuid, date);
--   DROP FUNCTION IF EXISTS support_cycle_usage(uuid, date);
--   DROP TRIGGER IF EXISTS trg_log_ticket_type_change ON tickets;
--   DROP TRIGGER IF EXISTS trg_log_ticket_type_creation ON tickets;
--   DROP FUNCTION IF EXISTS log_ticket_type_change();
--   DROP TABLE IF EXISTS ticket_type_history;
--   DROP FUNCTION IF EXISTS support_cycle_for(uuid, date);
-- ═══════════════════════════════════════════════════════════════
