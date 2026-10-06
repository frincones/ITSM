-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00049: DEFAULT ASSIGNEE + AUTO-ADVANCE INSTRUMENTATION
-- ═══════════════════════════════════════════════════════════════
-- Two operational changes:
--
-- 1. Round-robin assignment is retired. It had three separate
--    implementations (createTicket, inbound-email service, auto-assign cron)
--    all mutating a shared cursor in tenants.settings, and it spread tickets
--    across every active agent regardless of which client they belonged to.
--    Each client has a dedicated owner instead, set per organization here.
--    Assignment resolves: organizations.default_agent_id → an optional
--    tenant-wide default → unassigned. Stored as data, not in code, so it
--    survives an email change or a handover.
--
-- 2. Status transitions can now carry a reason, so automated movement stays
--    permanently distinguishable from human action. Needed by the
--    advance-assigned-tickets cron, which moves 'assigned' → 'in_progress'
--    during contract hours: without the tag, ticket_status_history would
--    show "work started at 08:00" for tickets nobody had opened.
--
-- Depends on: 00045 (ticket_status_history), 00048 (log_ticket_status_change
-- with pause-reason capture — this migration extends that same function).

-- ---------------------------------------------------------------
-- 1. RPC: tag the next status change in this transaction
-- ---------------------------------------------------------------
-- set_config is not reachable through the Supabase JS client, so the
-- reason travels via this thin wrapper. Transaction-local (third arg true),
-- so it cannot leak into another request on a pooled connection.
CREATE OR REPLACE FUNCTION set_status_change_reason(p_reason text)
RETURNS void AS $$
  SELECT set_config('app.status_change_reason', coalesce(p_reason, ''), true);
$$ LANGUAGE sql VOLATILE;

REVOKE ALL ON FUNCTION set_status_change_reason(text) FROM public;
GRANT EXECUTE ON FUNCTION set_status_change_reason(text) TO authenticated, service_role;

COMMENT ON FUNCTION set_status_change_reason(text) IS
  'Tags the next ticket status change in this transaction, captured into ticket_status_history.reason. Used by automations so machine transitions never masquerade as human ones.';

-- ---------------------------------------------------------------
-- 2. TRIGGER: capture the reason alongside the pause reason
-- ---------------------------------------------------------------
-- Extends the 00048 version. Everything about pause handling is unchanged;
-- the only addition is the `reason` column, which until now was written only
-- by log_ticket_creation ('created') and the 00045 backfill.
CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS trigger AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_agent_id uuid;
  v_reason   sla_pause_reason;
  v_tag      text;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents WHERE user_id = v_user_id LIMIT 1;
  END IF;

  v_reason := resolve_pause_reason(
    NEW.status,
    current_setting('app.pause_reason', true)
  );

  v_tag := nullif(btrim(coalesce(current_setting('app.status_change_reason', true), '')), '');

  INSERT INTO ticket_status_history(
    ticket_id, tenant_id, organization_id,
    from_status, to_status,
    changed_at, changed_by_user_id, changed_by_agent_id,
    reason, pause_reason, pauses_sla
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.organization_id,
    OLD.status, NEW.status,
    now(), v_user_id, v_agent_id,
    v_tag, v_reason, sla_pause_reason_pauses(v_reason)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Automated transitions must be cheap to exclude from lifecycle metrics.
CREATE INDEX IF NOT EXISTS idx_status_history_automated
  ON ticket_status_history (tenant_id, changed_at DESC)
  WHERE reason = 'auto-advance';

-- ---------------------------------------------------------------
-- 3. SEED: per-client default owner
-- ---------------------------------------------------------------
-- Ownership is per CLIENT:
--   Podenza        → Emma Castillo
--   Prosuministros → Freddy Rincones
--
-- Plus a tenant-wide fallback (Emma) that only catches tickets created with
-- NO client selected — see the rationale at the fallback below.
--
-- Agents and organizations are resolved by name so the migration carries no
-- hardcoded ids. Each pairing is applied independently: if one can't be
-- resolved unambiguously it is skipped with a NOTICE and the other still
-- lands.
DO $$
DECLARE
  v_pair       record;
  v_agent_id   uuid;
  v_org_id     uuid;
  v_tenant_id  uuid;
  v_agents     integer;
  v_orgs       integer;
BEGIN
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('%podenza%',        '%emma%castillo%',   'Podenza / Emma Castillo'),
      ('%prosuministro%',  '%freddy%rincones%', 'Prosuministros / Freddy Rincones')
    ) AS t(org_pattern, agent_pattern, label)
  LOOP
    SELECT count(*) INTO v_orgs
    FROM organizations WHERE name ILIKE v_pair.org_pattern;

    SELECT count(*) INTO v_agents
    FROM agents
    WHERE name ILIKE v_pair.agent_pattern
      AND is_active = true
      AND role IN ('admin', 'supervisor', 'agent');

    IF v_orgs <> 1 OR v_agents <> 1 THEN
      RAISE NOTICE '[00049] %: matched % organization(s) and % active agent(s) — skipped. Set organizations.default_agent_id manually.',
        v_pair.label, v_orgs, v_agents;
      CONTINUE;
    END IF;

    SELECT id, tenant_id INTO v_org_id, v_tenant_id
    FROM organizations WHERE name ILIKE v_pair.org_pattern;

    SELECT id INTO v_agent_id
    FROM agents
    WHERE name ILIKE v_pair.agent_pattern
      AND is_active = true
      AND role IN ('admin', 'supervisor', 'agent');

    UPDATE organizations
    SET default_agent_id = v_agent_id
    WHERE id = v_org_id;

    RAISE NOTICE '[00049] %: default owner set (org %, agent %).',
      v_pair.label, v_org_id, v_agent_id;
  END LOOP;

  -- Tenant-wide fallback → Emma Castillo.
  --
  -- This only ever fires for a ticket with NO organization, which the create
  -- form allows (organization_id is optionalUuid and the select has no
  -- default, so an agent can simply forget to pick the client). Without a
  -- fallback such a ticket is orphaned: no owner, no notification, sitting in
  -- 'new' until somebody spots it in the queue — the auto-assign cron logs a
  -- warning but will not guess, and the advance cron only touches 'assigned'.
  --
  -- The trade-off is that a future client with no default_agent_id of its own
  -- also lands here. Accepted deliberately: there are no new clients in
  -- sight, and revisiting this is a one-line change to the setting. The
  -- alternative failure mode — a silently orphaned ticket — is worse today.
  SELECT count(*) INTO v_agents
  FROM agents
  WHERE name ILIKE '%emma%castillo%'
    AND is_active = true
    AND role IN ('admin', 'supervisor', 'agent');

  IF v_agents = 1 THEN
    SELECT id, tenant_id INTO v_agent_id, v_tenant_id
    FROM agents
    WHERE name ILIKE '%emma%castillo%'
      AND is_active = true
      AND role IN ('admin', 'supervisor', 'agent');

    UPDATE tenants
    SET settings = coalesce(settings, '{}'::jsonb)
                   || jsonb_build_object('default_assignee_agent_id', v_agent_id::text)
    WHERE id = v_tenant_id;

    RAISE NOTICE '[00049] Tenant-wide fallback owner set to agent % (tickets with no client).', v_agent_id;
  ELSE
    RAISE NOTICE '[00049] Matched % active agents for the tenant-wide fallback — left unset. Tickets with no client will stay unassigned.', v_agents;
  END IF;

  -- Retire the round-robin cursor everywhere. Harmless if absent.
  UPDATE tenants
  SET settings = coalesce(settings, '{}'::jsonb) - 'round_robin_last_agent_id'
  WHERE settings ? 'round_robin_last_agent_id';
END $$;

-- ---------------------------------------------------------------
-- 4. pg_cron: advance 'assigned' → 'in_progress'
-- ---------------------------------------------------------------
-- Three runs per weekday inside the contract's working hours (cl. 4:
-- Mon-Fri 08:00-17:00 America/Bogota):
--
--   13:00 UTC = 08:00 Bogota  → start of the working day
--   17:00 UTC = 12:00 Bogota  → midday
--   21:00 UTC = 16:00 Bogota  → mid-afternoon
--
-- Colombia has no DST, so those offsets are stable year-round. The last slot
-- is 16:00 rather than 17:00 on purpose: the endpoint requires "now" to be
-- strictly inside the window and 17:00 is the closing edge, so a 17:00 run
-- would always be a no-op.
--
-- 3 runs/weekday = 15/week. Sized deliberately: the pg_cron HTTP jobs are
-- what drained the Disk IO budget before 00046 cut their cadence, so new
-- jobs get the lowest frequency that still does the job. The endpoint
-- re-checks the calendar itself — including holidays, which cron cannot
-- know — so a run landing on a holiday is a cheap no-op.
--
-- Trade-off of three runs instead of hourly: a ticket assigned at 12:05 sits
-- in 'assigned' until 16:00. That costs nothing contractually — the response
-- SLA is measured from the ticket opening, and this job never writes
-- first_response_at — it only means the queue reflects reality a few hours
-- later.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('advance-assigned-tickets')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'advance-assigned-tickets'
    );

    PERFORM cron.schedule(
      'advance-assigned-tickets',
      '0 13,17,21 * * 1-5',
      $job$SELECT public.call_cron_endpoint('/api/cron/advance-assigned-tickets')$job$
    );
  ELSE
    RAISE NOTICE '[00049] pg_cron not installed — schedule advance-assigned-tickets manually.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   SELECT cron.unschedule('advance-assigned-tickets');
--   DROP INDEX IF EXISTS idx_status_history_automated;
--   DROP FUNCTION IF EXISTS set_status_change_reason(text);
--   -- restore the 00048 body of log_ticket_status_change()
--   UPDATE organizations SET default_agent_id = NULL
--    WHERE name ILIKE '%podenza%' OR name ILIKE '%prosuministro%';
--   UPDATE tenants SET settings = settings - 'default_assignee_agent_id';
--
-- Reverting the code side (round-robin) additionally needs
-- tenants.settings.round_robin_last_agent_id repopulated — any agent id in
-- the tenant works, the rotation just resumes from there.
-- ═══════════════════════════════════════════════════════════════
