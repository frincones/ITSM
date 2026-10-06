-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00048: SUPPORT CONTRACTS — SLA ACTIVATION PER CLIENT
-- ═══════════════════════════════════════════════════════════════
-- Until now the SLA subsystem was inert scaffolding: slas / calendars /
-- tickets.sla_due_date all existed, sla.service.ts had a working
-- calculateSLADueDate(), but nothing ever called it. Every ticket carried
-- sla_due_date = NULL, so /api/cron/sla-check matched zero rows (and was
-- never even scheduled in pg_cron), and getSLAComplianceRate() returned a
-- hardcoded 100% whenever the denominator was 0.
--
-- That last part is the dangerous one: Prosuministros has NO support
-- contract with us, yet it would report "100% SLA compliance" — inventing a
-- contractual commitment we never signed. This migration makes the absence
-- of a contract the absence of an SLA, structurally.
--
-- THE RULE, in one place:
--   A ticket has an SLA only if its organization has a support contract
--   that is in force and sla_enabled on the ticket's opening date, AND its
--   classification counts toward SLA. Anything else is EXCLUDED from the
--   denominator — never counted as met.
--
-- Components:
--   1. sla_pause_reason enum — the contract's own exemption catalogue
--   2. organization_support_contracts (time-bounded: the contract says
--      "los SLA aplicables cada mes son los del plan vigente en ese mes")
--   3. support_contract_targets (per severity, versioned with the contract)
--   4. Resolution helpers — the single source of truth for "does SLA apply"
--   5. ticket_status_history.pause_reason / .pauses_sla
--   6. log_ticket_status_change() captures the pause reason
--   7. Seed: Podenza only. Prosuministros is deliberately NOT seeded.
--
-- Depends on: 00045 (ticket_status_history) and 00047 (esperando_ventana).
-- Both MUST be applied first or sections 5-6 and the trigger will fail.

-- ---------------------------------------------------------------
-- 0. EXTENSION — needed for the no-overlap exclusion constraint
-- ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------
-- 1. ENUM: sla_pause_reason
-- ---------------------------------------------------------------
-- Every paused minute must trace back to a clause of the contract. This is
-- the closed catalogue from clause 4 ("El reloj se suspende mientras el
-- ticket esté a la espera de información, validación o aprobación de
-- PODENZA" + "fuerza mayor, dependencias de terceros, ventanas de
-- mantenimiento acordadas"), plus one deliberately non-pausing value.
--
-- 'priorizacion_interna' is the hole-closer: a ticket parked in backlog
-- because WE deprioritised it has no contractual basis for freezing the
-- clock. Without this value, any status could silently stop the clock and
-- the compliance number would be theatre.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sla_pause_reason') THEN
    CREATE TYPE sla_pause_reason AS ENUM (
      'espera_cliente_info',         -- cl. 4 "a la espera de información"
      'espera_cliente_validacion',   -- cl. 4 "validación o aprobación"
      'dependencia_tercero',         -- cl. 4 "dependencias de terceros"
      'ventana_mantenimiento',       -- cl. 4 "ventanas de mantenimiento acordadas"
      'fuerza_mayor',                -- cl. 4 "fuerza mayor"
      'priorizacion_interna'         -- NO contractual basis → does NOT pause
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. TABLE: organization_support_contracts
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_support_contracts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  plan_name              text NOT NULL,
  monthly_ticket_quota   integer NOT NULL CHECK (monthly_ticket_quota > 0),
  ticket_unit_price_cop  numeric(12,2) NOT NULL CHECK (ticket_unit_price_cop >= 0),
  monthly_fee_cop        numeric(14,2) NOT NULL CHECK (monthly_fee_cop >= 0),

  calendar_id            uuid REFERENCES calendars(id),

  -- The billing cycle runs from this day of month to the day before, NOT by
  -- calendar month end (contract clause 8: "si el servicio inicia el 21,
  -- cada ciclo cierra el día 21 del mes siguiente"). Capped at 28 so every
  -- month actually has the day.
  cycle_start_day        smallint NOT NULL DEFAULT 1
                           CHECK (cycle_start_day BETWEEN 1 AND 28),

  -- The switch. FALSE keeps the contract row for quota/billing purposes
  -- while suspending SLA measurement (e.g. the ramp-up exception of
  -- clause 9, or a suspension for non-payment under clause 10).
  sla_enabled            boolean NOT NULL DEFAULT true,

  -- Minimum tickets in a cycle before service credits apply. The contract
  -- as signed has NO floor, so the default is 0 — which means a 3-ticket
  -- month with one miss lands at 66.7% and triggers a 5-ticket credit.
  -- Set this to 10 if the otrosí introducing a volume floor is executed.
  credit_min_tickets     integer NOT NULL DEFAULT 0
                           CHECK (credit_min_tickets >= 0),

  contract_ref           text,
  notes                  text,

  effective_from         date NOT NULL,
  effective_to           date,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT support_contract_period_valid
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE organization_support_contracts IS
  'Per-client support contract, time-bounded. The ABSENCE of a row in force is what makes SLA not apply — there is no per-client boolean to forget. Prosuministros intentionally has no row.';

COMMENT ON COLUMN organization_support_contracts.sla_enabled IS
  'Suspends SLA measurement while keeping the contract for quota/billing. Distinct from having no contract at all.';

-- Only one contract may govern any given day — the whole design rests on
-- "the plan in force that month" being unambiguous.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_contract_no_overlap'
  ) THEN
    ALTER TABLE organization_support_contracts
      ADD CONSTRAINT support_contract_no_overlap
      EXCLUDE USING gist (
        organization_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_contracts_org_period
  ON organization_support_contracts (organization_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_support_contracts_tenant
  ON organization_support_contracts (tenant_id);

DROP TRIGGER IF EXISTS set_updated_at ON organization_support_contracts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organization_support_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------
-- 3. TABLE: support_contract_targets
-- ---------------------------------------------------------------
-- Response targets per severity, versioned with the contract so a plan
-- change never rewrites history.
--
-- Podenza / Professional, from ANEXO A (response time, NOT resolution):
--   critical (P0) → 4 h    high (P1) → 12 h    medium (P2) → 48 h
-- The contract defines three severities; severity_level has four, so 'low'
-- is mapped onto the P2 target.
CREATE TABLE IF NOT EXISTS support_contract_targets (
  contract_id             uuid NOT NULL
                            REFERENCES organization_support_contracts(id) ON DELETE CASCADE,
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  severity                severity_level NOT NULL,
  first_response_minutes  integer NOT NULL CHECK (first_response_minutes > 0),

  -- Clause 4 carries a SECOND, separate P0 commitment beyond the response
  -- SLA: "TDX entregará una mitigación o solución temporal dentro de la
  -- misma jornada hábil". Tracked as its own flag because it is a distinct
  -- obligation — and the one most at risk when a P0 lands at 16:30.
  mitigation_same_day     boolean NOT NULL DEFAULT false,

  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, severity)
);

COMMENT ON TABLE support_contract_targets IS
  'Response-time target per severity. Frozen onto each ticket at creation so closed-cycle reports stay reproducible when the plan changes.';

CREATE INDEX IF NOT EXISTS idx_support_contract_targets_tenant
  ON support_contract_targets (tenant_id);

-- ---------------------------------------------------------------
-- 4. RESOLUTION HELPERS — the single source of truth
-- ---------------------------------------------------------------

-- Which classifications consume the monthly ticket quota (clause 2).
-- 'incident' is included deliberately: a platform failure fits none of the
-- three categories in clause 2, but P0/P1 in ANEXO A describe exactly
-- incidents, so the severity matrix plainly contemplates them. This is the
-- internally consistent reading — and the point Podenza may dispute until
-- the otrosí adds a "corrección de defectos" category.
CREATE OR REPLACE FUNCTION ticket_type_consumes_quota(p_type ticket_type)
RETURNS boolean AS $$
  SELECT p_type IN ('support', 'incident', 'request');
$$ LANGUAGE sql IMMUTABLE;

-- Which classifications are measured for SLA. Kept as a SEPARATE function
-- from quota consumption even though the lists match today, because the
-- contract treats them independently: a reopen within 15 days creates a new
-- response obligation (clause 3) but consumes no quota (clause 2), and a
-- third-party incident may warrant a response without consuming quota.
CREATE OR REPLACE FUNCTION ticket_type_counts_for_sla(p_type ticket_type)
RETURNS boolean AS $$
  SELECT p_type IN ('support', 'incident', 'request');
$$ LANGUAGE sql IMMUTABLE;

-- Does a pause reason actually stop the clock?
CREATE OR REPLACE FUNCTION sla_pause_reason_pauses(p_reason sla_pause_reason)
RETURNS boolean AS $$
  SELECT p_reason IS NOT NULL AND p_reason <> 'priorizacion_interna';
$$ LANGUAGE sql IMMUTABLE;

-- The contract governing an organization on a given date, if any.
CREATE OR REPLACE FUNCTION support_contract_at(
  p_organization_id uuid,
  p_at              date
)
RETURNS organization_support_contracts AS $$
  SELECT *
  FROM organization_support_contracts
  WHERE organization_id = p_organization_id
    AND effective_from <= p_at
    AND (effective_to IS NULL OR effective_to >= p_at)
  ORDER BY effective_from DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- THE rule. Everything else in the codebase must go through this.
-- Deliberately returns FALSE (not NULL) for tickets with no organization,
-- so an internal ticket never lands in an SLA denominator.
CREATE OR REPLACE FUNCTION sla_applies_for_ticket(
  p_organization_id uuid,
  p_opened_at       timestamptz,
  p_type            ticket_type
)
RETURNS boolean AS $$
  SELECT
    p_organization_id IS NOT NULL
    AND ticket_type_counts_for_sla(p_type)
    AND EXISTS (
      SELECT 1
      FROM organization_support_contracts c
      WHERE c.organization_id = p_organization_id
        AND c.sla_enabled
        AND c.effective_from <= (p_opened_at AT TIME ZONE 'America/Bogota')::date
        AND (c.effective_to IS NULL
             OR c.effective_to >= (p_opened_at AT TIME ZONE 'America/Bogota')::date)
    );
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION sla_applies_for_ticket(uuid, timestamptz, ticket_type) IS
  'The single authority on whether a ticket carries an SLA. FALSE means EXCLUDED from the compliance denominator — never "met".';

-- ---------------------------------------------------------------
-- 5. ticket_status_history — pause tracking
-- ---------------------------------------------------------------
ALTER TABLE ticket_status_history
  ADD COLUMN IF NOT EXISTS pause_reason sla_pause_reason,
  ADD COLUMN IF NOT EXISTS pauses_sla   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ticket_status_history.pause_reason IS
  'Why the clock was (or was not) paused on entering this status. Implicit for pending/testing; required for detenido/backlog/esperando_ventana.';

CREATE INDEX IF NOT EXISTS idx_status_history_ticket_pauses
  ON ticket_status_history (ticket_id, changed_at)
  WHERE pauses_sla = true;

-- ---------------------------------------------------------------
-- 6. TRIGGER — capture the pause reason
-- ---------------------------------------------------------------
-- The reason travels through a transaction-local setting rather than a
-- function argument, so the trigger still captures it no matter which code
-- path caused the change — UI action, cron, direct SQL or MCP. Same
-- robustness rationale as 00041 and 00045. App code sets it with:
--
--   select set_config('app.pause_reason', 'dependencia_tercero', true);
--   update tickets set status = 'detenido' where id = ...;

-- set_config is not reachable through the Supabase JS client, so the app hands
-- the reason over through this thin wrapper. Transaction-local (third arg
-- true), so it cannot leak into another request on a pooled connection.
CREATE OR REPLACE FUNCTION set_pause_reason(p_reason text)
RETURNS void AS $fn$
  SELECT set_config('app.pause_reason', coalesce(p_reason, ''), true);
$fn$ LANGUAGE sql VOLATILE;

REVOKE ALL ON FUNCTION set_pause_reason(text) FROM public;
GRANT EXECUTE ON FUNCTION set_pause_reason(text) TO authenticated, service_role;

COMMENT ON FUNCTION set_pause_reason(text) IS
  'Declares why the next status change in this transaction pauses the SLA clock. Captured into ticket_status_history.pause_reason by log_ticket_status_change.';

CREATE OR REPLACE FUNCTION resolve_pause_reason(
  p_to_status ticket_status,
  p_raw       text
)
RETURNS sla_pause_reason AS $$
DECLARE
  v_reason sla_pause_reason;
BEGIN
  -- Statuses that are unambiguously a client wait carry an implicit reason,
  -- so agents never have to justify the obvious. 'testing' is documented in
  -- 00032 as "the agent already did their part and is waiting for the
  -- requester to confirm the fix", which is clause 4's "validación".
  IF p_to_status = 'pending' THEN
    RETURN 'espera_cliente_info';
  ELSIF p_to_status = 'testing' THEN
    RETURN 'espera_cliente_validacion';
  END IF;

  -- Everything else either needs an explicit justification or isn't a pause.
  IF p_to_status NOT IN ('detenido', 'backlog', 'esperando_ventana') THEN
    RETURN NULL;
  END IF;

  -- FAIL CLOSED. An unjustified or malformed reason does NOT stop the
  -- clock. If someone forgets to justify, the system errs against us — an
  -- understated compliance number is defensible, an inflated one collapses
  -- the moment the client cross-checks their own email trail.
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN
    RETURN 'priorizacion_interna';
  END IF;

  BEGIN
    v_reason := btrim(p_raw)::sla_pause_reason;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN 'priorizacion_interna';
  END;

  RETURN v_reason;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS trigger AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_agent_id uuid;
  v_reason   sla_pause_reason;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents WHERE user_id = v_user_id LIMIT 1;
  END IF;

  v_reason := resolve_pause_reason(
    NEW.status,
    current_setting('app.pause_reason', true)
  );

  INSERT INTO ticket_status_history(
    ticket_id, tenant_id, organization_id,
    from_status, to_status,
    changed_at, changed_by_user_id, changed_by_agent_id,
    pause_reason, pauses_sla
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.organization_id,
    OLD.status, NEW.status,
    now(), v_user_id, v_agent_id,
    v_reason, sla_pause_reason_pauses(v_reason)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------
-- Contract terms are commercial data: staff read everything in the tenant,
-- a client reads only its own. Writes are admin-only — these rows drive
-- money (quota, overage, service credits).
ALTER TABLE organization_support_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_support_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE support_contract_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_contract_targets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_contracts_select ON organization_support_contracts;
CREATE POLICY support_contracts_select ON organization_support_contracts
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

DROP POLICY IF EXISTS support_contracts_write ON organization_support_contracts;
CREATE POLICY support_contracts_write ON organization_support_contracts
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

DROP POLICY IF EXISTS support_contract_targets_select ON support_contract_targets;
CREATE POLICY support_contract_targets_select ON support_contract_targets
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND contract_id IN (SELECT id FROM organization_support_contracts)
  );

DROP POLICY IF EXISTS support_contract_targets_write ON support_contract_targets;
CREATE POLICY support_contract_targets_write ON support_contract_targets
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
-- 8. SEED — Podenza only
-- ---------------------------------------------------------------
-- Idempotent and defensive: it resolves Podenza by name and does nothing
-- (with a NOTICE) if it can't identify exactly one organization. It never
-- touches any other client — Prosuministros has no support contract and
-- must therefore have no row here.
DO $$
DECLARE
  v_org_id      uuid;
  v_tenant_id   uuid;
  v_org_count   integer;
  v_calendar_id uuid;
  v_contract_id uuid;
  v_dow         integer;
BEGIN
  SELECT count(*) INTO v_org_count
  FROM organizations WHERE name ILIKE '%podenza%';

  IF v_org_count <> 1 THEN
    RAISE NOTICE '[00048] Found % organizations matching "podenza" — skipping seed. Insert the contract manually.', v_org_count;
    RETURN;
  END IF;

  SELECT id, tenant_id INTO v_org_id, v_tenant_id
  FROM organizations WHERE name ILIKE '%podenza%';

  -- Business calendar: Mon-Fri 08:00-17:00 America/Bogota (clause 4).
  -- Holidays are loaded separately — a misplaced holiday shifts a whole
  -- month's compliance, so that list gets verified before it goes in.
  SELECT id INTO v_calendar_id
  FROM calendars
  WHERE tenant_id = v_tenant_id AND name = 'Horario Hábil Colombia (L-V 8-17)';

  IF v_calendar_id IS NULL THEN
    INSERT INTO calendars (tenant_id, name, description, timezone, is_active)
    VALUES (
      v_tenant_id,
      'Horario Hábil Colombia (L-V 8-17)',
      'Contrato Podenza cl. 4: lunes a viernes 8:00 a.m. a 5:00 p.m. hora de Colombia, excluyendo festivos.',
      'America/Bogota',
      true
    )
    RETURNING id INTO v_calendar_id;

    FOR v_dow IN 1..5 LOOP
      INSERT INTO calendar_schedules (tenant_id, calendar_id, day_of_week, start_time, end_time)
      VALUES (v_tenant_id, v_calendar_id, v_dow, '08:00', '17:00')
      ON CONFLICT (calendar_id, day_of_week) DO NOTHING;
    END LOOP;
  END IF;

  -- Contract: Professional, 30 tickets/month, cycle closes on the 22nd,
  -- in force from the service start date in the signed payment calendar.
  SELECT id INTO v_contract_id
  FROM organization_support_contracts
  WHERE organization_id = v_org_id AND effective_from = DATE '2026-09-22';

  IF v_contract_id IS NULL THEN
    INSERT INTO organization_support_contracts (
      tenant_id, organization_id,
      plan_name, monthly_ticket_quota, ticket_unit_price_cop, monthly_fee_cop,
      calendar_id, cycle_start_day, sla_enabled, credit_min_tickets,
      contract_ref, notes, effective_from
    ) VALUES (
      v_tenant_id, v_org_id,
      'Professional', 30, 33333.00, 1000000.00,
      v_calendar_id, 22, true, 0,
      'Contrato de soporte firmado 2026-09-22',
      'Plan inicial Professional. Banda de capacidad: asciende con 45+ tickets sostenidos 2 meses, desciende con 15 o menos. credit_min_tickets=0 refleja el contrato firmado (sin piso de volumen para créditos).',
      DATE '2026-09-22'
    )
    RETURNING id INTO v_contract_id;
  END IF;

  -- Response targets, ANEXO A / Professional. 'low' maps onto P2.
  INSERT INTO support_contract_targets (
    contract_id, tenant_id, severity, first_response_minutes, mitigation_same_day
  ) VALUES
    (v_contract_id, v_tenant_id, 'critical',  240, true),   -- P0: 4 h  + same-day mitigation
    (v_contract_id, v_tenant_id, 'high',      720, false),  -- P1: 12 h
    (v_contract_id, v_tenant_id, 'medium',   2880, false),  -- P2: 48 h
    (v_contract_id, v_tenant_id, 'low',      2880, false)   -- treated as P2
  ON CONFLICT (contract_id, severity) DO NOTHING;

  RAISE NOTICE '[00048] Seeded Podenza support contract %. No other client was touched.', v_contract_id;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   CREATE OR REPLACE FUNCTION log_ticket_status_change() ... -- restore 00045 body
--   DROP FUNCTION IF EXISTS resolve_pause_reason(ticket_status, text);
--   DROP FUNCTION IF EXISTS set_pause_reason(text);
--   ALTER TABLE ticket_status_history
--     DROP COLUMN IF EXISTS pauses_sla,
--     DROP COLUMN IF EXISTS pause_reason;
--   DROP FUNCTION IF EXISTS sla_applies_for_ticket(uuid, timestamptz, ticket_type);
--   DROP FUNCTION IF EXISTS support_contract_at(uuid, date);
--   DROP FUNCTION IF EXISTS sla_pause_reason_pauses(sla_pause_reason);
--   DROP FUNCTION IF EXISTS ticket_type_counts_for_sla(ticket_type);
--   DROP FUNCTION IF EXISTS ticket_type_consumes_quota(ticket_type);
--   DROP TABLE IF EXISTS support_contract_targets CASCADE;
--   DROP TABLE IF EXISTS organization_support_contracts CASCADE;
--   DROP TYPE IF EXISTS sla_pause_reason;
-- ═══════════════════════════════════════════════════════════════
