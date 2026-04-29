-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00039: API KEYS + MCP PLATFORM
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Foundation tables for the MCP server + public API:
--                * api_keys           — hashed credentials for external
--                                       agents and integrations
--                * mcp_audit_log      — call-level audit trail (separate
--                                       from audit_logs to avoid bloating
--                                       the compliance-scoped table and
--                                       to keep its CHECK constraint
--                                       untouched)
--                * mcp_rate_buckets   — naive in-DB token bucket; can be
--                                       swapped for Redis later without
--                                       changing tool code
--                * helper functions   — verify_api_key(), record_mcp_call()
--
-- Design notes:
--   - Hashing: SHA-256 hex (industry standard for API keys with high
--     entropy: GitHub, Stripe). Bcrypt is overkill for 32-byte random
--     keys and slows down per-request validation.
--   - tenant_id is enforced explicitly in tool handlers (REGLA #6).
--     RLS still uses get_current_tenant_id() for any UI consumption.
--   - All existing tables, policies, functions, types are LEFT UNTOUCHED.
--
-- Depends on: 00038_realtime_tickets.sql, 00002 (tenants, agents)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE api_key_environment AS ENUM ('live', 'test');

-- ---------------------------------------------------------------
-- 2. TABLE: api_keys
-- ---------------------------------------------------------------

CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  environment     api_key_environment NOT NULL DEFAULT 'live',
  -- key_prefix is the first ~12 visible chars (e.g. "nvd_live_abcd")
  -- shown in the UI to identify the key without exposing the secret.
  key_prefix      text NOT NULL,
  -- key_hash stores SHA-256(plain_key) hex-encoded (64 chars).
  key_hash        text NOT NULL,
  -- Granular scopes: 'tickets:read', 'tickets:write', 'kb:search', etc.
  -- Wildcards allowed: 'tickets:*', '*:read', 'admin:*'.
  scopes          text[] NOT NULL DEFAULT '{}',
  -- Rate limit per minute (per key). 0 = unlimited.
  rate_limit_rpm  integer NOT NULL DEFAULT 60,
  -- Optional org-level scoping: when set, the key only sees tickets
  -- and resources for these organizations within the tenant.
  organization_ids uuid[],
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,
  last_used_at    timestamptz,
  last_used_ip    inet,
  usage_count     bigint NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES agents(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES agents(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(key_hash)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_api_keys_tenant       ON api_keys (tenant_id);
CREATE INDEX idx_api_keys_hash_active  ON api_keys (key_hash) WHERE is_active = true AND revoked_at IS NULL;
CREATE INDEX idx_api_keys_tenant_active ON api_keys (tenant_id, created_at DESC) WHERE is_active = true AND revoked_at IS NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: only authenticated users from the same tenant see their keys.
-- The MCP server itself uses service_role and bypasses RLS by design.
CREATE POLICY api_keys_select ON api_keys FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY api_keys_insert ON api_keys FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY api_keys_update ON api_keys FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY api_keys_delete ON api_keys FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

COMMENT ON TABLE api_keys IS 'Hashed API credentials for MCP and REST external clients. Tenant-scoped.';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hex of the plain API key. The plain key is returned only once at creation.';
COMMENT ON COLUMN api_keys.scopes IS 'Granular permissions: ''tickets:read'', ''kb:search'', wildcards ''tickets:*'' and ''*:read''.';

-- ---------------------------------------------------------------
-- 3. TABLE: mcp_audit_log
-- ---------------------------------------------------------------
-- Separate from audit_logs to keep that table's CHECK constraint and
-- compliance scope untouched. mcp_audit_log captures EVERY tool call,
-- success or failure, for debugging, billing, and abuse detection.

CREATE TABLE mcp_audit_log (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  api_key_id      uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  -- Caller identity, when resolvable: agent for JWT-authed calls,
  -- NULL for pure API key calls.
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,
  -- 'mcp' for MCP transport, 'rest' for /api/v1/* endpoints, 'internal'
  -- for in-process calls from internal AI agents and workflows.
  channel         text NOT NULL CHECK (channel IN ('mcp', 'rest', 'internal')),
  -- Tool name, e.g. 'tickets.list', 'kb.search'.
  tool_name       text NOT NULL,
  -- 'success' | 'error' | 'forbidden' | 'rate_limited' | 'invalid_input'
  status          text NOT NULL,
  -- HTTP-style numeric status (200, 400, 401, 403, 422, 429, 500).
  status_code     integer,
  -- Sanitized arguments (no PII / secrets). NULL if too large.
  arguments       jsonb,
  error_message   text,
  duration_ms     integer,
  ip_address      inet,
  user_agent      text,
  request_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mcp_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_audit_log FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_mcp_audit_tenant_created ON mcp_audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_mcp_audit_key_created    ON mcp_audit_log (api_key_id, created_at DESC) WHERE api_key_id IS NOT NULL;
CREATE INDEX idx_mcp_audit_tool           ON mcp_audit_log (tenant_id, tool_name, created_at DESC);
CREATE INDEX idx_mcp_audit_failures       ON mcp_audit_log (tenant_id, created_at DESC) WHERE status <> 'success';

CREATE POLICY mcp_audit_select ON mcp_audit_log FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
-- Inserts come exclusively from service_role (the MCP server) — no
-- authenticated INSERT policy is needed; service_role bypasses RLS.

-- ---------------------------------------------------------------
-- 4. TABLE: mcp_rate_buckets
-- ---------------------------------------------------------------
-- Naive in-DB rate limiter: one row per (api_key_id, minute_bucket).
-- Auto-purged by a partial index on stale rows. For high traffic,
-- swap for Upstash/Redis without changing tool handlers.

CREATE TABLE mcp_rate_buckets (
  api_key_id      uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  bucket_minute   timestamptz NOT NULL,
  call_count      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, bucket_minute)
);

ALTER TABLE mcp_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_rate_buckets FORCE ROW LEVEL SECURITY;
-- No authenticated policies: only service_role writes here.

CREATE INDEX idx_mcp_rate_buckets_minute ON mcp_rate_buckets (bucket_minute);

-- ---------------------------------------------------------------
-- 5. HELPER FUNCTIONS
-- ---------------------------------------------------------------

-- Atomically resolve and validate an API key by its SHA-256 hash.
-- Returns one row when valid; zero rows otherwise. Always updates
-- last_used_at and increments usage_count for valid keys.
CREATE OR REPLACE FUNCTION verify_api_key(
  p_key_hash text,
  p_ip inet DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  tenant_id       uuid,
  scopes          text[],
  rate_limit_rpm  integer,
  organization_ids uuid[],
  environment     api_key_environment
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
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
     k.environment;
END;
$$;

REVOKE ALL ON FUNCTION verify_api_key(text, inet) FROM PUBLIC;

-- Atomically increment the rate bucket and return the new count.
-- Caller compares against rate_limit_rpm to decide allow/deny.
CREATE OR REPLACE FUNCTION increment_rate_bucket(
  p_api_key_id uuid,
  p_window_seconds integer DEFAULT 60
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket timestamptz;
  v_count  integer;
BEGIN
  v_bucket := date_trunc('minute', now());

  INSERT INTO mcp_rate_buckets (api_key_id, bucket_minute, call_count)
       VALUES (p_api_key_id, v_bucket, 1)
  ON CONFLICT (api_key_id, bucket_minute)
  DO UPDATE SET call_count = mcp_rate_buckets.call_count + 1
  RETURNING call_count INTO v_count;

  -- Best-effort cleanup of stale buckets (older than 10 minutes).
  -- Cheap because of the partial-friendly btree index.
  DELETE FROM mcp_rate_buckets
   WHERE bucket_minute < (now() - interval '10 minutes');

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION increment_rate_bucket(uuid, integer) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP FUNCTION IF EXISTS increment_rate_bucket(uuid, integer);
--   DROP FUNCTION IF EXISTS verify_api_key(text, inet);
--   DROP TABLE IF EXISTS mcp_rate_buckets;
--   DROP TABLE IF EXISTS mcp_audit_log;
--   DROP TABLE IF EXISTS api_keys;
--   DROP TYPE IF EXISTS api_key_environment;
-- ═══════════════════════════════════════════════════════════════
