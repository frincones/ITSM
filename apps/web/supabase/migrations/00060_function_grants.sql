-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00060: EXECUTE GRANTS + HARDEN close_support_cycle
-- ═══════════════════════════════════════════════════════════════
-- Without this the whole report is unreachable. Supabase revokes the default
-- PUBLIC execute privilege on functions, so every function created in
-- 00048-00059 was callable from a direct Postgres connection but NOT through
-- PostgREST as `authenticated` — the /home/reports/ciclo RPC calls would all
-- have failed. Verified against production: only set_pause_reason and
-- set_status_change_reason worked, because those two granted explicitly.
--
-- Same class of mistake as the SLA scaffolding this whole series fixes: the
-- machinery existed and nothing could reach it.
--
-- SECURITY NOTE ON close_support_cycle
-- It is SECURITY DEFINER, so granting EXECUTE to `authenticated` would let ANY
-- signed-in user freeze a billing cycle — the admin check lived only in the
-- TypeScript action, and an RPC call bypasses that entirely. The check now
-- lives inside the function, where it cannot be routed around. The TS check
-- stays as a cheaper first gate with a friendlier message.
--
-- Depends on: 00048-00059.

-- ---------------------------------------------------------------
-- 1. Read-only helpers — safe to expose
-- ---------------------------------------------------------------
-- All are STABLE and none is SECURITY DEFINER, so they execute with the
-- caller's own privileges and RLS still filters every row they touch. A client
-- user calling support_cycle_usage sees only their own organization, exactly
-- as they would querying the tables directly.
GRANT EXECUTE ON FUNCTION support_cycle_for(uuid, date)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_cycle_usage(uuid, date)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_cycle_compliance(uuid, date)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_cycle_reclassifications(uuid, date)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_cycle_quota_carryforward(uuid, date)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_termination_risk(uuid, date)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_band_status(uuid, date)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_plan_band(uuid)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION support_contract_at(uuid, date)                     TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION ticket_sla_status(uuid)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ticket_clause4_status(uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ticket_paused_business_minutes(uuid, timestamptz)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ticket_type_consumes_quota(ticket_type)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ticket_type_counts_for_sla(ticket_type)             TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION sla_applies_for_ticket(uuid, timestamptz, ticket_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sla_pause_reason_pauses(sla_pause_reason)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION resolve_pause_reason(ticket_status, text)           TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION add_business_minutes(uuid, timestamptz, integer)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION business_minutes_between(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION end_of_business_day(uuid, timestamptz)              TO authenticated, service_role;

-- The sla-check cron runs with the service role only. No reason for a signed-in
-- user to enumerate at-risk tickets across the tenant through an RPC.
GRANT EXECUTE ON FUNCTION sla_tickets_at_risk(numeric)                        TO service_role;

-- ---------------------------------------------------------------
-- 2. close_support_cycle — admin check inside the function
-- ---------------------------------------------------------------
-- Body is unchanged from 00058 apart from the authorization block at the top
-- and the alias-qualified column references.
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
  -- Closing a cycle settles money. Because this function is SECURITY DEFINER,
  -- the check has to be here: a direct RPC call would never reach the
  -- TypeScript action's guard. auth.uid() being NULL means a service-role or
  -- direct connection, which is allowed — that is a trusted caller.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM agents a
    WHERE a.user_id = auth.uid()
      AND a.is_active = true
      AND a.role = 'admin'
      AND a.tenant_id = (SELECT tenant_id FROM organization_support_contracts
                         WHERE id = p_contract_id)
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede cerrar un ciclo de facturación';
  END IF;

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
  FROM support_cycle_closures c
  WHERE c.contract_id = p_contract_id AND c.cycle_start = v_cycle.cycle_start;

  IF v_existing.id IS NOT NULL AND NOT p_force THEN
    RAISE EXCEPTION 'El ciclo % ya fue cerrado el %. Usa p_force := true para reemplazar el snapshot.',
      v_cycle.cycle_label, v_existing.closed_at;
  END IF;

  -- Snapshot from the live functions BEFORE the closure row exists, so
  -- support_cycle_usage still computes rather than reading a snapshot.
  SELECT * INTO v_usage FROM support_cycle_usage(p_contract_id, v_cycle.cycle_start);
  SELECT * INTO v_comp  FROM support_cycle_compliance(p_contract_id, v_cycle.cycle_start);

  DELETE FROM support_cycle_closures c
  WHERE c.contract_id = p_contract_id AND c.cycle_start = v_cycle.cycle_start;

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

REVOKE ALL ON FUNCTION close_support_cycle(uuid, date, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION close_support_cycle(uuid, date, boolean, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION close_support_cycle(uuid, date, boolean, text) IS
  'Freezes a finished cycle into support_cycle_closures. Admin-only, enforced inside the function because it is SECURITY DEFINER. Refuses an unfinished cycle, and refuses to re-close without p_force.';

-- ---------------------------------------------------------------
-- 3. Tell PostgREST to pick up the new signatures
-- ---------------------------------------------------------------
-- Supabase normally reloads on DDL via an event trigger, but the RPC endpoints
-- 404 until it happens, so the notify is explicit.
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- Revoke the grants and restore the 00058 body of close_support_cycle (which
-- has no internal admin check — do NOT leave it granted to authenticated).
-- ═══════════════════════════════════════════════════════════════
