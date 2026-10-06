-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00059: PLAN CATALOG + CAPACITY BAND
-- ═══════════════════════════════════════════════════════════════
-- The capacity band of contract cl. 6 needs something the schema did not have:
-- the plan LADDER. Until now plan_name was free text on the contract, so
-- nothing knew that Business sits above Professional, or what descending would
-- cost. ANEXO A becomes a table.
--
-- HOW THE BAND WORKS (cl. 6 + ANEXO A)
-- Each plan has a tolerance band equal to half its quota. Consumption sustained
-- OUTSIDE the band for two consecutive cycles adjusts the plan from the third:
--
--   Plan          Cupo   Banda      Baja si (2 ciclos)  Sube si (2 ciclos)
--   Essential      15    1 – 22     no aplica           23 o más
--   Professional   30    16 – 44    15 o menos          45 o más
--   Business       60    31 – 89    30 o menos          90 o más
--   Enterprise    120    61 – 120   60 o menos          no aplica
--
-- Both derive from the ladder: the ascent threshold is ceil(quota × 1.5) and
-- the descent threshold is the quota of the plan below.
--
-- WHAT THIS DOES NOT DO, AND WHY
-- It does not change the plan. Cl. 6 says the adjustment is "automática" and
-- then, two paragraphs later, that "el cambio de plan lo confirma PODENZA por
-- escrito" — so it cannot be automatic, and a system that switched the plan by
-- itself would be asserting a change the client has not signed. This detects
-- the condition, records it, and says from which cycle the adjustment is due.
--
-- Worth knowing which direction will actually fire. At 45 tickets, staying on
-- Professional and paying overage costs the client $1.499.995 against
-- $2.000.000 for Business — ascending is more expensive until 60 tickets, so a
-- client whose written confirmation is required will not give it. Descending
-- halves their fee, so that one they will confirm. The band is therefore
-- one-way in practice, and the descent alert is the one that protects revenue.
-- Both are recorded regardless: the contract grants both, and the report has to
-- show what the contract says, not what we expect.
--
-- Depends on: 00048 (contracts), 00055 (cycles), 00058 (closures).

-- ---------------------------------------------------------------
-- 1. TABLE: support_plans — ANEXO A
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_plans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  -- Position on the ladder. The band's neighbours are found by tier ± 1.
  tier                  smallint NOT NULL,
  monthly_ticket_quota  integer NOT NULL CHECK (monthly_ticket_quota > 0),
  monthly_fee_cop       numeric(14,2) NOT NULL,
  ticket_unit_price_cop numeric(12,2) NOT NULL,
  -- Response targets, so a plan change carries its SLAs with it: "Los SLA se
  -- ajustan al plan que entra en vigencia" (cl. 6).
  p0_minutes            integer NOT NULL,
  p1_minutes            integer NOT NULL,
  p2_minutes            integer NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, tier)
);

COMMENT ON TABLE support_plans IS
  'ANEXO A of the support contract. The tier ordering is what lets the capacity band of cl. 6 know which plan is above or below the current one.';

ALTER TABLE support_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_plans_select ON support_plans;
CREATE POLICY support_plans_select ON support_plans
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS support_plans_write ON support_plans;
CREATE POLICY support_plans_write ON support_plans
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

-- Link contracts to the catalog. Kept nullable: a bespoke contract that does
-- not match a catalogue plan is legitimate, and it simply has no band.
ALTER TABLE organization_support_contracts
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES support_plans(id);

COMMENT ON COLUMN organization_support_contracts.plan_id IS
  'Catalogue plan this contract runs on. NULL for a bespoke contract, which then has no capacity band.';

CREATE INDEX IF NOT EXISTS idx_support_contracts_plan
  ON organization_support_contracts (plan_id) WHERE plan_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. SEED — the four plans, and the link for existing contracts
-- ---------------------------------------------------------------
DO $seed$
DECLARE
  v_tenant_id uuid;
  v_row       record;
BEGIN
  -- Seed per tenant that already has a support contract; the catalogue is
  -- tenant-scoped like everything else.
  FOR v_tenant_id IN
    SELECT DISTINCT tenant_id FROM organization_support_contracts
  LOOP
    FOR v_row IN
      SELECT * FROM (VALUES
        ('Essential',     1,  15,  500000.00, 33333.00,  480, 1440, 4320),
        ('Professional',  2,  30, 1000000.00, 33333.00,  240,  720, 2880),
        ('Business',      3,  60, 2000000.00, 33333.00,  120,  240, 1440),
        ('Enterprise',    4, 120, 4000000.00, 33333.00,   30,   60,  240)
      ) AS t(name, tier, quota, fee, unit, p0, p1, p2)
    LOOP
      INSERT INTO support_plans (
        tenant_id, name, tier, monthly_ticket_quota,
        monthly_fee_cop, ticket_unit_price_cop,
        p0_minutes, p1_minutes, p2_minutes
      ) VALUES (
        v_tenant_id, v_row.name, v_row.tier, v_row.quota,
        v_row.fee, v_row.unit, v_row.p0, v_row.p1, v_row.p2
      )
      ON CONFLICT (tenant_id, name) DO NOTHING;
    END LOOP;
  END LOOP;

  -- Match existing contracts to the catalogue by name.
  UPDATE organization_support_contracts c
  SET plan_id = p.id
  FROM support_plans p
  WHERE p.tenant_id = c.tenant_id
    AND lower(p.name) = lower(c.plan_name)
    AND c.plan_id IS NULL;

  RAISE NOTICE '[00059] % contrato(s) vinculado(s) al catálogo de planes.',
    (SELECT count(*) FROM organization_support_contracts WHERE plan_id IS NOT NULL);
END $seed$;

-- ---------------------------------------------------------------
-- 3. support_plan_band — thresholds for one plan
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION support_plan_band(p_plan_id uuid)
RETURNS TABLE (
  plan_name         text,
  quota             integer,
  band_low          integer,
  band_high         integer,
  ascend_at         integer,   -- NULL on the top plan
  descend_at        integer,   -- NULL on the bottom plan
  plan_above        text,
  plan_below        text,
  fee_above_cop     numeric,
  fee_below_cop     numeric
) AS $fn$
  WITH me AS (
    SELECT * FROM support_plans WHERE id = p_plan_id
  ),
  above AS (
    SELECT p.* FROM support_plans p, me
    WHERE p.tenant_id = me.tenant_id AND p.tier = me.tier + 1 AND p.is_active
  ),
  below AS (
    SELECT p.* FROM support_plans p, me
    WHERE p.tenant_id = me.tenant_id AND p.tier = me.tier - 1 AND p.is_active
  )
  SELECT
    me.name,
    me.monthly_ticket_quota,
    -- One above the descent threshold, or 1 on the bottom plan.
    coalesce((SELECT monthly_ticket_quota FROM below), 0) + 1,
    -- One below the ascent threshold, or the quota itself on the top plan.
    CASE
      WHEN (SELECT 1 FROM above) IS NULL THEN me.monthly_ticket_quota
      ELSE ceil(me.monthly_ticket_quota * 1.5)::integer - 1
    END,
    CASE
      WHEN (SELECT 1 FROM above) IS NULL THEN NULL
      ELSE ceil(me.monthly_ticket_quota * 1.5)::integer
    END,
    (SELECT monthly_ticket_quota FROM below),
    (SELECT name FROM above),
    (SELECT name FROM below),
    (SELECT monthly_fee_cop FROM above),
    (SELECT monthly_fee_cop FROM below)
  FROM me;
$fn$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION support_plan_band(uuid) IS
  'Capacity band thresholds for a plan (cl. 6): ascent at ceil(quota x 1.5), descent at the quota of the plan below. NULL where the ladder ends.';

-- ---------------------------------------------------------------
-- 4. support_band_status — is an adjustment due?
-- ---------------------------------------------------------------
-- Walks the CLOSED cycles backwards. Only closed cycles count: an open cycle's
-- consumption is still moving, and treating a half-finished month as "out of
-- band" would raise an alarm that the next two weeks might retract.
CREATE OR REPLACE FUNCTION support_band_status(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  plan_name          text,
  quota              integer,
  band_low           integer,
  band_high          integer,
  ascend_at          integer,
  descend_at         integer,
  cycles_considered  integer,
  consecutive_above  integer,
  consecutive_below  integer,
  direction          text,     -- 'ascenso' | 'descenso' | 'estable'
  adjustment_due     boolean,
  target_plan        text,
  target_fee_cop     numeric,
  effective_from     date,     -- the third cycle
  detail             text
) AS $fn$
DECLARE
  v_contract organization_support_contracts;
  v_band     record;
  v_above    integer := 0;
  v_below    integer := 0;
  v_seen     integer := 0;
  v_parts    text[] := '{}';
  v_row      record;
  v_next     date;
BEGIN
  SELECT * INTO v_contract
  FROM organization_support_contracts WHERE id = p_contract_id;

  IF v_contract.id IS NULL OR v_contract.plan_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_band FROM support_plan_band(v_contract.plan_id);
  IF v_band.plan_name IS NULL THEN
    RETURN;
  END IF;

  -- Closed cycles, newest first. The streak breaks at the first cycle inside
  -- the band, so only a SUSTAINED excursion counts (cl. 6: "un consumo fuera
  -- de banda por un solo mes no modifica el plan").
  FOR v_row IN
    SELECT cycle_start, cycle_end, consumed_net
    FROM support_cycle_closures
    WHERE contract_id = p_contract_id
      AND cycle_end <= p_at
    ORDER BY cycle_start DESC
    LIMIT 6
  LOOP
    v_seen := v_seen + 1;

    IF v_band.ascend_at IS NOT NULL AND v_row.consumed_net >= v_band.ascend_at THEN
      IF v_below > 0 THEN EXIT; END IF;
      v_above := v_above + 1;
      v_parts := v_parts || format('%s: %s (≥ %s)',
        to_char(v_row.cycle_start, 'DD-Mon'), v_row.consumed_net, v_band.ascend_at);
    ELSIF v_band.descend_at IS NOT NULL AND v_row.consumed_net <= v_band.descend_at THEN
      IF v_above > 0 THEN EXIT; END IF;
      v_below := v_below + 1;
      v_parts := v_parts || format('%s: %s (≤ %s)',
        to_char(v_row.cycle_start, 'DD-Mon'), v_row.consumed_net, v_band.descend_at);
    ELSE
      -- Inside the band: the streak ends here.
      EXIT;
    END IF;
  END LOOP;

  -- The adjustment takes effect from the THIRD cycle, so it starts the day
  -- after the current cycle ends.
  SELECT (cycle_end + 1)::date INTO v_next FROM support_cycle_for(p_contract_id, p_at);

  RETURN QUERY SELECT
    v_band.plan_name,
    v_band.quota,
    v_band.band_low,
    v_band.band_high,
    v_band.ascend_at,
    v_band.descend_at,
    v_seen,
    v_above,
    v_below,
    CASE
      WHEN v_above >= 1 THEN 'ascenso'
      WHEN v_below >= 1 THEN 'descenso'
      ELSE 'estable'
    END,
    (v_above >= 2 OR v_below >= 2),
    CASE
      WHEN v_above >= 2 THEN v_band.plan_above
      WHEN v_below >= 2 THEN v_band.plan_below
      ELSE NULL
    END,
    CASE
      WHEN v_above >= 2 THEN v_band.fee_above_cop
      WHEN v_below >= 2 THEN v_band.fee_below_cop
      ELSE NULL
    END,
    CASE WHEN (v_above >= 2 OR v_below >= 2) THEN v_next ELSE NULL END,
    CASE
      WHEN v_above = 0 AND v_below = 0
        THEN format('Consumo dentro de la banda (%s–%s)', v_band.band_low, v_band.band_high)
      WHEN v_above = 1 OR v_below = 1
        THEN format('Un ciclo fuera de banda — %s. Se requieren dos consecutivos.',
                    array_to_string(v_parts, ', '))
      ELSE format('%s ciclos consecutivos fuera de banda — %s',
                  greatest(v_above, v_below), array_to_string(v_parts, ', '))
    END;
END;
$fn$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION support_band_status(uuid, date) IS
  'Capacity band evaluation over CLOSED cycles (cl. 6). Reports the condition and the cycle the adjustment would take effect from — it never changes the plan, because cl. 6 requires the client to confirm in writing.';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS support_band_status(uuid, date);
--   DROP FUNCTION IF EXISTS support_plan_band(uuid);
--   ALTER TABLE organization_support_contracts DROP COLUMN IF EXISTS plan_id;
--   DROP TABLE IF EXISTS support_plans CASCADE;
-- ═══════════════════════════════════════════════════════════════
