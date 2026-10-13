-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00064: MCP ACTOR ATTRIBUTION
-- NovaDesk ITSM — MCP Platform, Phase 1
-- ═══════════════════════════════════════════════════════════════
-- Problem this solves
-- -------------------
-- Write tools that insert into tables whose author column is a NOT NULL
-- FK to auth.users (ticket_followups.author_id is the first, and there
-- are more: ticket_tasks, ticket_solutions, kb_articles) cannot be used
-- by an API-key caller, because an API key has no auth.users identity.
--
-- `tickets_add_comment` has been broken since it shipped for exactly this
-- reason (it also referenced two columns that never existed:
-- author_agent_id and source). Nothing surfaced it because no write tool
-- had ever been executed in production.
--
-- Solution
-- --------
-- Every API key declares the agent it acts as. The MCP context resolves
-- that agent's user_id and writes it into author columns, so an action
-- performed by an agent over MCP is attributable to a real person in
-- exactly the same way a UI action is. This keeps every existing NOT NULL
-- FK intact — no column is relaxed, no CHECK constraint is touched.
--
-- Backfill: existing keys are pointed at the tenant's first active admin
-- so no key is left unusable. Operators should repoint them deliberately.
--
-- Depends on: 00039_api_keys_and_mcp.sql, 00002 (agents), 00004 (tickets)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. COLUMN: api_keys.actor_agent_id
-- ---------------------------------------------------------------

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS actor_agent_id uuid REFERENCES agents(id) ON DELETE RESTRICT;

COMMENT ON COLUMN api_keys.actor_agent_id IS
  'The agent this key acts as. Writes performed over MCP/REST are attributed to this agent (and its auth.users id), so API-driven actions are auditable like UI actions. ON DELETE RESTRICT: an agent with live keys cannot be removed silently.';

CREATE INDEX IF NOT EXISTS idx_api_keys_actor ON api_keys (actor_agent_id)
  WHERE actor_agent_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. BACKFILL: point existing keys at an admin of their own tenant
-- ---------------------------------------------------------------
-- Deliberately scoped per tenant so a key never gains an actor from a
-- different tenant. Prefers 'admin', falls back to any active agent.

UPDATE api_keys k
   SET actor_agent_id = (
     SELECT a.id
       FROM agents a
      WHERE a.tenant_id = k.tenant_id
        AND a.is_active = true
        AND a.user_id IS NOT NULL
      ORDER BY (a.role = 'admin') DESC, a.created_at ASC
      LIMIT 1
   )
 WHERE k.actor_agent_id IS NULL;

-- ---------------------------------------------------------------
-- 3. FUNCTION: verify_api_key — now returns the actor identity
-- ---------------------------------------------------------------
-- Same contract as 00039 plus actor_agent_id / actor_user_id, resolved
-- in the same round trip so the hot auth path stays at one query.
--
-- The actor is joined with a LEFT JOIN on purpose: a key whose agent was
-- deactivated keeps working for READS (actor_user_id comes back NULL and
-- write tools fail loudly) instead of locking the integration out
-- entirely on an unrelated HR change.

DROP FUNCTION IF EXISTS verify_api_key(text, inet);

CREATE OR REPLACE FUNCTION verify_api_key(
  p_key_hash text,
  p_ip inet DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  tenant_id        uuid,
  scopes           text[],
  rate_limit_rpm   integer,
  organization_ids uuid[],
  environment      api_key_environment,
  actor_agent_id   uuid,
  actor_user_id    uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH touched AS (
    UPDATE api_keys k
       SET last_used_at = now(),
           last_used_ip = COALESCE(p_ip, k.last_used_ip),
           usage_count  = k.usage_count + 1
     WHERE k.key_hash = p_key_hash
       AND k.is_active = true
       AND k.revoked_at IS NULL
       AND (k.expires_at IS NULL OR k.expires_at > now())
    RETURNING
      k.id,
      k.tenant_id,
      k.scopes,
      k.rate_limit_rpm,
      k.organization_ids,
      k.environment,
      k.actor_agent_id
  )
  SELECT
    t.id,
    t.tenant_id,
    t.scopes,
    t.rate_limit_rpm,
    t.organization_ids,
    t.environment,
    t.actor_agent_id,
    a.user_id
  FROM touched t
  LEFT JOIN agents a
         ON a.id = t.actor_agent_id
        AND a.tenant_id = t.tenant_id
        AND a.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION verify_api_key(text, inet) FROM PUBLIC;

COMMENT ON FUNCTION verify_api_key(text, inet) IS
  'Validates an API key by SHA-256 hash and returns its tenant, scopes, limits and acting agent identity. Side-effects last_used_at/usage_count. Returns zero rows for an invalid, revoked or expired key.';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS verify_api_key(text, inet);
--   -- then restore the 00039 definition verbatim
--   DROP INDEX IF EXISTS idx_api_keys_actor;
--   ALTER TABLE api_keys DROP COLUMN IF EXISTS actor_agent_id;
-- ═══════════════════════════════════════════════════════════════
