-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00058: CYCLE CLOSURE + QUOTA CARRY-FORWARD
-- ═══════════════════════════════════════════════════════════════
-- Everything so far computes live. That is right for an open cycle and wrong
-- for a closed one.
--
-- THE PROBLEM THIS SOLVES
-- Usage counts each ticket by its CURRENT type (00055), which is what makes the
-- restitution of cl. 2 automatic. But it also means reclassifying a September
-- ticket in November would change September's count — a cycle already invoiced.
-- The contract anticipates exactly this and says where the restitution goes
-- instead:
--
--   "el cupo se restituye en el conteo del mes o, si este ya cerró, en el
--    siguiente" (cl. 2)
--
-- So a closed cycle is frozen in a snapshot, and a restitution landing after
-- the close becomes a quota credit on the CURRENT cycle.
--
-- WHY THE CREDIT IS SHOWN, NOT NETTED SILENTLY
-- The carry-forward is reported as its own number next to the raw count rather
-- than folded into it. A client who counts their own tickets and gets 32 while
-- the report says 30 will ask why, and "32 consumidos − 2 de crédito arrastrado
-- = 30" is an answer. A bare 30 is an argument.
--
-- Depends on: 00055 (cycles, type history), 00057 (compliance).

-- ---------------------------------------------------------------
-- 1. TABLE: support_cycle_closures
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_cycle_closures (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id          uuid NOT NULL
                         REFERENCES organization_support_contracts(id) ON DELETE CASCADE,
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  cycle_start          date NOT NULL,
  cycle_end            date NOT NULL,

  -- Frozen quota figures
  quota                integer NOT NULL,
  consumed             integer NOT NULL,
  quota_carried        integer NOT NULL DEFAULT 0,
  consumed_net         integer NOT NULL,
  overage              integer NOT NULL,
  overage_cop          numeric(14,2) NOT NULL,

  -- Frozen compliance figures. compliance_pct stays nullable on purpose: a
  -- cycle with nothing measurable has no percentage, and storing 0 or 100 would
  -- invent one.
  measurable           integer NOT NULL,
  met                  integer NOT NULL,
  breached             integer NOT NULL,
  excluded_count       integer NOT NULL,
  compliance_pct       numeric(5,2),
  credit_tickets       integer NOT NULL,
  credit_cop           numeric(14,2) NOT NULL,
  credit_suppressed    boolean NOT NULL DEFAULT false,

  closed_at            timestamptz NOT NULL DEFAULT now(),
  closed_by_user_id    uuid,
  notes                text,

  UNIQUE (contract_id, cycle_start)
);

COMMENT ON TABLE support_cycle_closures IS
  'Frozen snapshot of a billing cycle. Once a row exists the report reads it instead of recomputing, so an invoiced cycle cannot change. Later reclassifications become a quota credit on the current cycle (contract cl. 2).';

CREATE INDEX IF NOT EXISTS idx_cycle_closures_contract
  ON support_cycle_closures (contract_id, cycle_start DESC);

CREATE INDEX IF NOT EXISTS idx_cycle_closures_org
  ON support_cycle_closures (tenant_id, organization_id, cycle_start DESC);

ALTER TABLE support_cycle_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_cycle_closures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cycle_closures_select ON support_cycle_closures;
CREATE POLICY cycle_closures_select ON support_cycle_closures
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

-- Closing a cycle settles money, so only admins may write — and the closure
-- function below is SECURITY DEFINER for the same reason it is the only path.
DROP POLICY IF EXISTS cycle_closures_write ON support_cycle_closures;
CREATE POLICY cycle_closures_write ON support_cycle_closures
  FOR ALL TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  )
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  );

-- ---------------------------------------------------------------
-- 2. support_cycle_quota_carryforward
-- ---------------------------------------------------------------
-- Quota credits owed to the cycle containing p_at, from reclassifications that
-- landed in it but belong to a cycle already closed.
--
-- Net, not just restitutions: a ticket reclassified INTO a quota-consuming type
-- after its cycle closed owes quota the other way. Counting only the credits
-- would be one-sided in our favour, and the same evidence the client would use
-- to claim a restitution shows the reverse case too.
CREATE OR REPLACE FUNCTION support_cycle_quota_carryforward(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS integer AS $fn$
DECLARE
  v_cycle  record;
  v_org    uuid;
  v_credit integer := 0;
  v_row    record;
BEGIN
  SELECT organization_id INTO v_org
  FROM organization_support_contracts WHERE id = p_contract_id;

  SELECT * INTO v_cycle FROM support_cycle_for(p_contract_id, p_at);
  IF v_cycle.cycle_start IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT h.consumed_quota_before,
           h.consumed_quota_after,
           (t.created_at AT TIME ZONE 'America/Bogota')::date AS ticket_day
    FROM ticket_type_history h
    JOIN tickets t ON t.id = h.ticket_id
    WHERE h.organization_id = v_org
      AND h.from_type IS NOT NULL
      AND t.deleted_at IS NULL
      AND (h.changed_at AT TIME ZONE 'America/Bogota')::date
          BETWEEN v_cycle.cycle_start AND v_cycle.cycle_end
  LOOP
    -- Only tickets from an EARLIER cycle that is already closed carry forward.
    -- A reclassification inside the current cycle needs no credit: the live
    -- count already reflects it.
    CONTINUE WHEN v_row.ticket_day >= v_cycle.cycle_start;

    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM support_cycle_closures c
      WHERE c.contract_id = p_contract_id
        AND v_row.ticket_day BETWEEN c.cycle_start AND c.cycle_end
    );

    IF v_row.consumed_quota_before AND NOT v_row.consumed_quota_after THEN
      v_credit := v_credit + 1;
    ELSIF NOT v_row.consumed_quota_before AND v_row.consumed_quota_after THEN
      v_credit := v_credit - 1;
    END IF;
  END LOOP;

  RETURN v_credit;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION support_cycle_quota_carryforward(uuid, date) IS
  'Net quota credit carried into a cycle from reclassifications of tickets whose own cycle already closed (contract cl. 2). Can be negative.';

-- ---------------------------------------------------------------
-- 3. support_cycle_usage — now reports the carry-forward
-- ---------------------------------------------------------------
-- The return type gains columns, so the 00055 version has to be dropped rather
-- than replaced. `consumed` keeps its meaning — the raw ticket count — and the
-- credit is a separate, visible number.
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
  is_closed     boolean
) AS $fn$
DECLARE
  v_cycle    record;
  v_contract organization_support_contracts;
  v_closure  support_cycle_closures;
  v_count    integer;
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

  -- A closed cycle answers from its snapshot. Recomputing would let a later
  -- reclassification move a number that has already been invoiced.
  SELECT * INTO v_closure
  FROM support_cycle_closures
  WHERE contract_id = p_contract_id AND cycle_start = v_cycle.cycle_start;

  IF v_closure.id IS NOT NULL THEN
    RETURN QUERY SELECT
      v_closure.cycle_start, v_closure.cycle_end, v_cycle.cycle_label,
      v_closure.quota, v_closure.consumed, v_closure.quota_carried,
      v_closure.consumed_net,
      greatest(v_closure.quota - v_closure.consumed_net, 0),
      v_closure.overage,
      round((v_closure.consumed_net::numeric / v_closure.quota) * 100, 1),
      v_closure.overage_cop,
      true;
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM tickets t
  WHERE t.organization_id = v_contract.organization_id
    AND t.deleted_at IS NULL
    AND ticket_type_consumes_quota(t.type)
    AND (t.created_at AT TIME ZONE 'America/Bogota')::date
        BETWEEN v_cycle.cycle_start AND v_cycle.cycle_end;

  v_carried := support_cycle_quota_carryforward(p_contract_id, p_at);
  v_net     := greatest(v_count - v_carried, 0);

  RETURN QUERY SELECT
    v_cycle.cycle_start,
    v_cycle.cycle_end,
    v_cycle.cycle_label,
    v_contract.monthly_ticket_quota,
    v_count,
    v_carried,
    v_net,
    greatest(v_contract.monthly_ticket_quota - v_net, 0),
    greatest(v_net - v_contract.monthly_ticket_quota, 0),
    round((v_net::numeric / v_contract.monthly_ticket_quota) * 100, 1),
    greatest(v_net - v_contract.monthly_ticket_quota, 0)
      * v_contract.ticket_unit_price_cop,
    false;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION support_cycle_usage(uuid, date) IS
  'Quota usage for a cycle. Reads the frozen snapshot once the cycle is closed. `consumed` is the raw ticket count; `quota_carried` is the credit from reclassifications of already-closed cycles, shown separately so the difference from the client own count is explainable.';

-- ---------------------------------------------------------------
-- 4. close_support_cycle
-- ---------------------------------------------------------------
-- Freezes a cycle. Called when the cycle is invoiced, which is the moment its
-- numbers stop being negotiable.
--
-- Refuses to close a cycle that has not ended yet: a snapshot taken mid-cycle
-- would freeze an incomplete count as if it were final. Refuses to close twice
-- unless p_force, in which case the previous snapshot is replaced and the
-- reason is recorded — re-closing an invoiced cycle is a decision someone has
-- to own, not a side effect.
CREATE OR REPLACE FUNCTION close_support_cycle(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date,
  p_force       boolean DEFAULT false,
  p_notes       text DEFAULT NULL
)
RETURNS support_cycle_closures AS $fn$
DECLARE
  v_contract organization_support_contracts;
  v_cycle    record;
  v_usage    record;
  v_comp     record;
  v_existing support_cycle_closures;
  v_result   support_cycle_closures;
BEGIN
  SELECT * INTO v_contract
  FROM organization_support_contracts WHERE id = p_contract_id;
  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Contrato % no existe', p_contract_id;
  END IF;

  SELECT * INTO v_cycle FROM support_cycle_for(p_contract_id, p_at);
  IF v_cycle.cycle_start IS NULL THEN
    RAISE EXCEPTION 'No hay ciclo para % en el contrato %', p_at, p_contract_id;
  END IF;

  IF v_cycle.cycle_end >= (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'El ciclo % aún no termina (cierra el %). Un cierre anticipado congelaría un conteo incompleto.',
      v_cycle.cycle_label, v_cycle.cycle_end;
  END IF;

  SELECT * INTO v_existing
  FROM support_cycle_closures
  WHERE contract_id = p_contract_id AND cycle_start = v_cycle.cycle_start;

  IF v_existing.id IS NOT NULL AND NOT p_force THEN
    RAISE EXCEPTION 'El ciclo % ya fue cerrado el %. Usa p_force := true para reemplazar el snapshot.',
      v_cycle.cycle_label, v_existing.closed_at;
  END IF;

  -- Snapshot from the live functions BEFORE the closure row exists, so
  -- support_cycle_usage still computes rather than reading a snapshot.
  SELECT * INTO v_usage  FROM support_cycle_usage(p_contract_id, v_cycle.cycle_start);
  SELECT * INTO v_comp   FROM support_cycle_compliance(p_contract_id, v_cycle.cycle_start);

  DELETE FROM support_cycle_closures
  WHERE contract_id = p_contract_id AND cycle_start = v_cycle.cycle_start;

  INSERT INTO support_cycle_closures (
    tenant_id, contract_id, organization_id,
    cycle_start, cycle_end,
    quota, consumed, quota_carried, consumed_net, overage, overage_cop,
    measurable, met, breached, excluded_count, compliance_pct,
    credit_tickets, credit_cop, credit_suppressed,
    closed_by_user_id, notes
  ) VALUES (
    v_contract.tenant_id, p_contract_id, v_contract.organization_id,
    v_cycle.cycle_start, v_cycle.cycle_end,
    v_usage.quota, v_usage.consumed, v_usage.quota_carried,
    v_usage.consumed_net, v_usage.overage, v_usage.overage_cop,
    v_comp.measurable, v_comp.met, v_comp.breached, v_comp.excluded_count,
    v_comp.compliance_pct,
    v_comp.credit_tickets, v_comp.credit_cop, v_comp.credit_suppressed,
    auth.uid(),
    coalesce(p_notes, CASE WHEN p_force THEN 'Reemplaza un cierre anterior' END)
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION close_support_cycle(uuid, date, boolean, text) IS
  'Freezes a finished cycle into support_cycle_closures. Refuses an unfinished cycle, and refuses to re-close without p_force.';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS close_support_cycle(uuid, date, boolean, text);
--   DROP FUNCTION IF EXISTS support_cycle_quota_carryforward(uuid, date);
--   DROP TABLE IF EXISTS support_cycle_closures CASCADE;
--   -- then restore the 00055 body of support_cycle_usage(uuid, date), whose
--   -- return type has fewer columns:
--   DROP FUNCTION IF EXISTS support_cycle_usage(uuid, date);
-- ═══════════════════════════════════════════════════════════════
