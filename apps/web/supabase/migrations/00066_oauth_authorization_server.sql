-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00066: OAUTH 2.1 AUTHORIZATION SERVER
-- NovaDesk ITSM — MCP Platform, Phase 4 (second half)
-- ═══════════════════════════════════════════════════════════════
-- What this enables
-- -----------------
-- Connecting the MCP server from Claude.ai and other remote clients, which
-- cannot use API keys — they require an OAuth flow. Claude Code and Cursor
-- keep working with API keys; this is an additional method, not a
-- replacement.
--
-- Why we host the authorization server ourselves
-- ----------------------------------------------
-- Supabase Auth advertises /auth/v1/oauth/authorize and /auth/v1/oauth/token
-- in its OIDC metadata, but both return 404 on this instance (verified
-- 15-oct-2026). It authenticates users; it does not issue OAuth tokens for
-- third-party clients. So the app acts as the authorization server, while
-- Supabase Auth remains the identity provider: /authorize requires an
-- existing ITSM session and reads the signed-in agent from it.
--
-- Security model
-- --------------
-- Tokens are opaque random strings, not JWTs, stored hashed. Two reasons:
-- revocation is immediate (delete the row), and a leaked token in a log is
-- useless without the hash lookup. The MCP server already resolves API keys
-- this way, so token verification reuses that shape.
--
-- Every token is bound to:
--   * a tenant and an acting agent  — same attribution as an API key (00064)
--   * a resource (RFC 8707)         — so a token for one MCP server cannot
--                                     be replayed against another
--   * an explicit scope set         — never broader than the client asked
--
-- Depends on: 00039 (api_keys, mcp_audit_log), 00064 (actor attribution)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: oauth_clients
-- ---------------------------------------------------------------
-- Registered MCP clients. Two registration paths are supported:
--   * dynamic (RFC 7591) — client_id generated here, is_dynamic = true
--   * Client ID Metadata Documents — client_id IS an https URL that serves
--     the metadata; we fetch and cache it rather than storing a secret
--
-- The spec made Dynamic Client Registration MAY (down from SHOULD) in
-- 2025-11-25, but Claude.ai still uses it, so both are implemented.

CREATE TABLE oauth_clients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- For dynamic registration this is a generated opaque id. For a Client ID
  -- Metadata Document it is the https URL itself.
  client_id           text NOT NULL UNIQUE,
  -- NULL for public clients (PKCE only). Hashed when present; a plaintext
  -- client secret in a table is a credential waiting to leak.
  client_secret_hash  text,
  client_name         text NOT NULL,
  client_uri          text,
  logo_uri            text,
  -- Exact-match allowlist. OAuth 2.1 forbids prefix matching: an attacker
  -- who can append a path to a registered URI can steal the code.
  redirect_uris       text[] NOT NULL,
  grant_types         text[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  response_types      text[] NOT NULL DEFAULT ARRAY['code'],
  -- 'none' for public clients using PKCE, 'client_secret_post' otherwise.
  token_endpoint_auth_method text NOT NULL DEFAULT 'none'
    CHECK (token_endpoint_auth_method IN ('none', 'client_secret_post', 'client_secret_basic')),
  -- Scopes this client may ever request. The consent screen can narrow
  -- further, never widen.
  allowed_scopes      text[] NOT NULL DEFAULT '{}',
  is_dynamic          boolean NOT NULL DEFAULT true,
  -- Lets an operator disable a client without losing its history.
  is_active           boolean NOT NULL DEFAULT true,
  -- Which tenant registered it. Dynamic registrations are open by design
  -- (anyone may register), so this is NULL until first use binds it.
  tenant_id           uuid REFERENCES tenants(id) ON DELETE CASCADE,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz
);

ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_oauth_clients_lookup ON oauth_clients (client_id) WHERE is_active = true;
CREATE INDEX idx_oauth_clients_tenant ON oauth_clients (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON oauth_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Operators see the clients registered against their tenant. Registration
-- and token exchange run through service_role, which bypasses RLS.
CREATE POLICY oauth_clients_select ON oauth_clients FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

COMMENT ON TABLE oauth_clients IS
  'MCP clients registered for OAuth. client_id is either a generated id (dynamic registration, RFC 7591) or an https URL serving a Client ID Metadata Document.';

-- ---------------------------------------------------------------
-- 2. TABLE: oauth_authorization_codes
-- ---------------------------------------------------------------
-- Short-lived, single-use codes issued by /authorize and redeemed at
-- /token. Never stored in plaintext: a code is a bearer credential for the
-- length of its life.

CREATE TABLE oauth_authorization_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash       text NOT NULL UNIQUE,
  client_id       text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  -- Who approved it. Both are needed downstream: user_id for author columns,
  -- agent_id for followers and assignment.
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Exactly what the user consented to, not what the client asked for.
  scopes          text[] NOT NULL,
  -- RFC 8707. The token minted from this code is bound to this resource and
  -- is rejected anywhere else.
  resource        text NOT NULL,
  -- Must match the one sent to /token, byte for byte (OAuth 2.1 §4.1.3).
  redirect_uri    text NOT NULL,
  -- PKCE is mandatory in OAuth 2.1, so these are NOT NULL.
  code_challenge  text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256'
    CHECK (code_challenge_method IN ('S256')),
  -- Optional org restriction, mirroring api_keys.organization_ids.
  organization_ids uuid[],
  expires_at      timestamptz NOT NULL,
  -- Set on redemption. A second attempt with the same code means the code
  -- leaked, and OAuth 2.1 §7.5 requires revoking everything derived from it.
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_authorization_codes FORCE ROW LEVEL SECURITY;
-- No authenticated policy: only the token endpoint touches this, via
-- service_role. A code must never be readable from the browser.

CREATE INDEX idx_oauth_codes_hash ON oauth_authorization_codes (code_hash)
  WHERE used_at IS NULL;
CREATE INDEX idx_oauth_codes_expiry ON oauth_authorization_codes (expires_at);

COMMENT ON TABLE oauth_authorization_codes IS
  'Single-use OAuth authorization codes, stored as SHA-256 hashes. PKCE is mandatory. Reuse of a redeemed code revokes the tokens issued from it (OAuth 2.1 section 7.5).';

-- ---------------------------------------------------------------
-- 3. TABLE: oauth_tokens
-- ---------------------------------------------------------------
-- Access and refresh tokens, hashed. One row per token; a refresh token and
-- the access token it issued are linked through refresh_parent_id so
-- revoking a grant takes the whole chain.

CREATE TABLE oauth_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      text NOT NULL UNIQUE,
  token_type      text NOT NULL CHECK (token_type IN ('access', 'refresh')),
  client_id       text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scopes          text[] NOT NULL,
  -- The audience this token is valid for (RFC 8707). Checked on every MCP
  -- request: a token minted for another resource is rejected.
  resource        text NOT NULL,
  organization_ids uuid[],
  -- For an access token issued by a refresh, points at the refresh token.
  -- For a rotated refresh token, points at the one it replaced.
  refresh_parent_id uuid REFERENCES oauth_tokens(id) ON DELETE CASCADE,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  usage_count     bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_oauth_tokens_hash ON oauth_tokens (token_hash)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_oauth_tokens_user ON oauth_tokens (user_id, created_at DESC);
CREATE INDEX idx_oauth_tokens_expiry ON oauth_tokens (expires_at) WHERE revoked_at IS NULL;

-- A user can see and revoke their own grants from the UI.
CREATE POLICY oauth_tokens_select ON oauth_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY oauth_tokens_revoke ON oauth_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE oauth_tokens IS
  'Opaque OAuth tokens stored as SHA-256 hashes. Bound to tenant, acting agent, scopes and resource (RFC 8707 audience). Revocation is immediate: the row is marked, not waited out.';

-- ---------------------------------------------------------------
-- 4. FUNCTION: verify_oauth_token
-- ---------------------------------------------------------------
-- The hot path, mirroring verify_api_key from 00064 so the MCP route can
-- treat both credential types the same way.
--
-- Returns zero rows for a token that is unknown, revoked, expired, or whose
-- resource does not match — the audience check the spec requires, done in
-- SQL so it cannot be forgotten at a call site.

CREATE OR REPLACE FUNCTION verify_oauth_token(
  p_token_hash text,
  p_resource   text
)
RETURNS TABLE (
  token_id         uuid,
  client_id        text,
  tenant_id        uuid,
  user_id          uuid,
  agent_id         uuid,
  scopes           text[],
  organization_ids uuid[],
  client_name      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH touched AS (
    UPDATE oauth_tokens t
       SET last_used_at = now(),
           usage_count  = t.usage_count + 1
     WHERE t.token_hash = p_token_hash
       AND t.token_type = 'access'
       AND t.revoked_at IS NULL
       AND t.expires_at > now()
       -- RFC 8707 audience binding: a token issued for another MCP server
       -- is not valid here, even if it is otherwise sound.
       AND t.resource = p_resource
    RETURNING t.id, t.client_id, t.tenant_id, t.user_id, t.agent_id,
              t.scopes, t.organization_ids
  )
  SELECT
    x.id, x.client_id, x.tenant_id, x.user_id, x.agent_id,
    x.scopes, x.organization_ids, c.client_name
  FROM touched x
  JOIN oauth_clients c ON c.client_id = x.client_id;
END;
$$;

REVOKE ALL ON FUNCTION verify_oauth_token(text, text) FROM PUBLIC;

COMMENT ON FUNCTION verify_oauth_token(text, text) IS
  'Validates an OAuth access token by SHA-256 hash AND resource audience. Side-effects last_used_at/usage_count. Zero rows for unknown, revoked, expired or wrong-audience tokens.';

-- ---------------------------------------------------------------
-- 5. FUNCTION: redeem_authorization_code
-- ---------------------------------------------------------------
-- Atomically claims a code so two concurrent redemptions cannot both
-- succeed. The UPDATE ... WHERE used_at IS NULL is the lock: the second
-- caller matches no row.
--
-- A code that was already used is returned with was_reused = true rather
-- than simply refused, so the caller can revoke the tokens minted from it,
-- as OAuth 2.1 section 7.5 requires.

CREATE OR REPLACE FUNCTION redeem_authorization_code(p_code_hash text)
RETURNS TABLE (
  code_id          uuid,
  client_id        text,
  user_id          uuid,
  agent_id         uuid,
  tenant_id        uuid,
  scopes           text[],
  resource         text,
  redirect_uri     text,
  code_challenge   text,
  organization_ids uuid[],
  was_reused       boolean,
  is_expired       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing oauth_authorization_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_existing
    FROM oauth_authorization_codes
   WHERE code_hash = p_code_hash;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_existing.used_at IS NOT NULL THEN
    RETURN QUERY SELECT
      v_existing.id, v_existing.client_id, v_existing.user_id,
      v_existing.agent_id, v_existing.tenant_id, v_existing.scopes,
      v_existing.resource, v_existing.redirect_uri, v_existing.code_challenge,
      v_existing.organization_ids, true, false;
    RETURN;
  END IF;

  IF v_existing.expires_at <= now() THEN
    RETURN QUERY SELECT
      v_existing.id, v_existing.client_id, v_existing.user_id,
      v_existing.agent_id, v_existing.tenant_id, v_existing.scopes,
      v_existing.resource, v_existing.redirect_uri, v_existing.code_challenge,
      v_existing.organization_ids, false, true;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE oauth_authorization_codes
     SET used_at = now()
   WHERE code_hash = p_code_hash
     AND used_at IS NULL
  RETURNING id, oauth_authorization_codes.client_id,
            oauth_authorization_codes.user_id, oauth_authorization_codes.agent_id,
            oauth_authorization_codes.tenant_id, oauth_authorization_codes.scopes,
            oauth_authorization_codes.resource, oauth_authorization_codes.redirect_uri,
            oauth_authorization_codes.code_challenge,
            oauth_authorization_codes.organization_ids,
            false, false;
END;
$$;

REVOKE ALL ON FUNCTION redeem_authorization_code(text) FROM PUBLIC;

COMMENT ON FUNCTION redeem_authorization_code(text) IS
  'Atomically claims a single-use authorization code. Returns was_reused = true when the code was already redeemed, so the caller can revoke the tokens derived from it per OAuth 2.1 section 7.5.';

-- ---------------------------------------------------------------
-- 6. FUNCTION: gc_oauth_expired
-- ---------------------------------------------------------------
-- Expired codes and tokens accumulate otherwise. Scheduled rather than run
-- inline, for the reason spelled out in 00065: this instance is ~1 GB with a
-- small IO budget, and background writes on the hot path already took the
-- database offline once.

CREATE OR REPLACE FUNCTION gc_oauth_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
  v_n integer;
BEGIN
  -- Codes live minutes; a day of grace is generous for debugging.
  DELETE FROM oauth_authorization_codes
   WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted + v_n;

  -- Revoked and long-expired tokens. Thirty days keeps enough history to
  -- answer "who had access last month" without growing unbounded.
  DELETE FROM oauth_tokens
   WHERE (expires_at < now() - interval '30 days')
      OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted + v_n;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION gc_oauth_expired() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oauth-gc') THEN
      PERFORM cron.unschedule('oauth-gc');
    END IF;
    -- Daily at 03:30 UTC, outside the cadence 00046 established.
    PERFORM cron.schedule('oauth-gc', '30 3 * * *', $cron$ SELECT gc_oauth_expired(); $cron$);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 7. mcp_audit_log: allow the oauth channel
-- ---------------------------------------------------------------
-- The CHECK from 00039 only allowed mcp / rest / internal. An OAuth-
-- authenticated call is none of those, and auditing must not silently drop
-- it.

ALTER TABLE mcp_audit_log DROP CONSTRAINT IF EXISTS mcp_audit_log_channel_check;
ALTER TABLE mcp_audit_log ADD CONSTRAINT mcp_audit_log_channel_check
  CHECK (channel IN ('mcp', 'rest', 'internal', 'oauth'));

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   SELECT cron.unschedule('oauth-gc');
--   DROP FUNCTION IF EXISTS gc_oauth_expired();
--   DROP FUNCTION IF EXISTS redeem_authorization_code(text);
--   DROP FUNCTION IF EXISTS verify_oauth_token(text, text);
--   DROP TABLE IF EXISTS oauth_tokens;
--   DROP TABLE IF EXISTS oauth_authorization_codes;
--   DROP TABLE IF EXISTS oauth_clients;
--   ALTER TABLE mcp_audit_log DROP CONSTRAINT mcp_audit_log_channel_check;
--   ALTER TABLE mcp_audit_log ADD CONSTRAINT mcp_audit_log_channel_check
--     CHECK (channel IN ('mcp', 'rest', 'internal'));
-- ═══════════════════════════════════════════════════════════════
