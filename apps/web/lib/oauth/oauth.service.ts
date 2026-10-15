// ---------------------------------------------------------------------------
// OAuth 2.1 Authorization Server — core logic
// ---------------------------------------------------------------------------
// The app hosts its own authorization server because Supabase Auth cannot
// act as one: it advertises /auth/v1/oauth/authorize and
// /auth/v1/oauth/token in its OIDC metadata, but both return 404 on this
// instance. It authenticates people; it does not issue OAuth tokens to
// third-party clients.
//
// So the roles split: Supabase Auth is the identity provider (/authorize
// requires an existing ITSM session), and this module is the authorization
// server that mints tokens for MCP clients.
//
// Tokens are opaque random strings, stored hashed — not JWTs. Revocation is
// then immediate rather than "wait for expiry", and a token leaked into a
// log is useless without a matching row. It also matches how API keys
// already work, so the MCP route verifies both the same way.
// ---------------------------------------------------------------------------

import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { OAuthSupabaseClient } from './oauth.types';

import { ALL_SCOPES } from '~/lib/services/api-key.types';

/** Access tokens are short-lived; a leaked one stops working quickly. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
/** Refresh tokens carry the long-lived grant and are rotated on every use. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** Codes are redeemed within seconds; a minute is already generous. */
export const AUTH_CODE_TTL_SECONDS = 60;

export const SUPPORTED_SCOPES = ALL_SCOPES;

/** SHA-256 hex. Same construction as API keys, for the same reasons. */
export function hashToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

/** 32 bytes of entropy, URL-safe. */
function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export const newAuthorizationCode = () => randomToken('nvc');
export const newAccessToken = () => randomToken('nvat');
export const newRefreshToken = () => randomToken('nvrt');

/**
 * Verifies a PKCE code_verifier against the stored challenge.
 *
 * S256 only: OAuth 2.1 requires it where technically possible, and `plain`
 * offers no protection against an attacker who intercepted the code.
 * Compared in constant time — a timing oracle on this comparison would let
 * an attacker recover the challenge byte by byte.
 */
export function verifyPkce(codeVerifier: string, storedChallenge: string): boolean {
  // RFC 7636 §4.1: 43-128 characters from the unreserved set.
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-._~]+$/.test(codeVerifier)) return false;

  const computed = createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(storedChallenge, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Canonicalises a resource identifier for RFC 8707 comparison.
 *
 * The spec says to compare canonical URIs, and the difference between
 * `https://host/api/mcp` and `https://host/api/mcp/` would otherwise reject
 * a legitimate token. Fragments are invalid in a resource identifier.
 */
export function canonicalResource(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hash) return null;
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Exact-match redirect URI check.
 *
 * OAuth 2.1 forbids prefix or wildcard matching: an attacker who can append
 * to a registered URI can redirect the code to themselves. Only localhost
 * may vary its port, because a native client binds whatever port is free.
 */
export function redirectUriAllowed(requested: string, registered: string[]): boolean {
  if (registered.includes(requested)) return true;

  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }

  // Loopback: RFC 8252 §7.3 says the port is assigned at runtime, so compare
  // everything except it. Host must still match exactly.
  const isLoopback = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (!isLoopback) return false;

  return registered.some((entry) => {
    try {
      const reg = new URL(entry);
      return (
        reg.hostname === req.hostname &&
        reg.protocol === req.protocol &&
        reg.pathname === req.pathname
      );
    } catch {
      return false;
    }
  });
}

/** Narrows requested scopes to what the client may have. Never widens. */
export function resolveScopes(
  requested: string[] | null,
  clientAllowed: string[],
): string[] {
  const allowed = clientAllowed.length ? clientAllowed : [...SUPPORTED_SCOPES];
  if (!requested?.length) return allowed;
  return requested.filter((s) => allowed.includes(s));
}

export interface ClientRecord {
  client_id: string;
  client_name: string;
  client_uri: string | null;
  redirect_uris: string[];
  allowed_scopes: string[];
  token_endpoint_auth_method: string;
  client_secret_hash: string | null;
  is_active: boolean;
}

/**
 * Resolves a client_id, fetching a Client ID Metadata Document when the id
 * is an https URL (the mechanism the 2025-11-25 spec prefers over dynamic
 * registration).
 *
 * The document is fetched from a URL an unknown caller supplied, so this is
 * an SSRF surface. Mitigations, per the spec's security considerations:
 * https only, no redirects followed, a short timeout, a size cap, and the
 * document's own client_id must equal the URL exactly.
 */
export async function resolveClient(
  client: OAuthSupabaseClient,
  clientId: string,
): Promise<ClientRecord | null> {
  const { data } = await client
    .from('oauth_clients')
    .select(
      'client_id, client_name, client_uri, redirect_uris, allowed_scopes, token_endpoint_auth_method, client_secret_hash, is_active',
    )
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();

  if (data) return data as unknown as ClientRecord;

  if (!clientId.startsWith('https://')) return null;
  return fetchClientIdMetadata(clientId);
}

async function fetchClientIdMetadata(url: string): Promise<ClientRecord | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // The spec requires https and a path component; a bare origin is not a
  // valid Client ID Metadata Document URL.
  if (parsed.protocol !== 'https:') return null;
  if (parsed.pathname === '/' || parsed.pathname === '') return null;

  // Block the obvious SSRF targets. Not exhaustive by DNS, but it stops the
  // trivial cases without a resolver round trip.
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '[::1]'
  ) {
    return null;
  }

  try {
    const res = await fetch(url, {
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const text = await res.text();
    if (text.length > 64 * 1024) return null;

    const doc = JSON.parse(text) as Record<string, unknown>;

    // The document must claim the URL it was served from, or anyone could
    // host a document impersonating another client.
    if (doc.client_id !== url) return null;
    if (typeof doc.client_name !== 'string' || !doc.client_name) return null;
    if (!Array.isArray(doc.redirect_uris) || !doc.redirect_uris.length) return null;

    return {
      client_id: url,
      client_name: doc.client_name,
      client_uri: typeof doc.client_uri === 'string' ? doc.client_uri : null,
      redirect_uris: doc.redirect_uris.filter((u): u is string => typeof u === 'string'),
      // A metadata-document client has no pre-agreed scope list, so it may
      // request any supported scope; consent still gates what it gets.
      allowed_scopes: [...SUPPORTED_SCOPES],
      token_endpoint_auth_method: 'none',
      client_secret_hash: null,
      is_active: true,
    };
  } catch {
    return null;
  }
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

/**
 * Mints an access/refresh pair for a granted authorization.
 *
 * Both rows carry the tenant, acting agent, scopes and resource, so the MCP
 * route can build its context from a token exactly as it does from an API
 * key.
 */
export async function issueTokens(
  client: OAuthSupabaseClient,
  grant: {
    clientId: string;
    userId: string;
    agentId: string;
    tenantId: string;
    scopes: string[];
    resource: string;
    organizationIds: string[] | null;
  },
): Promise<IssuedTokens | null> {
  const accessToken = newAccessToken();
  const refreshToken = newRefreshToken();
  const now = Date.now();

  const { data: refreshRow, error: refreshError } = await client
    .from('oauth_tokens')
    .insert({
      token_hash: hashToken(refreshToken),
      token_type: 'refresh',
      client_id: grant.clientId,
      user_id: grant.userId,
      agent_id: grant.agentId,
      tenant_id: grant.tenantId,
      scopes: grant.scopes,
      resource: grant.resource,
      organization_ids: grant.organizationIds,
      expires_at: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (refreshError || !refreshRow) return null;

  const { error: accessError } = await client.from('oauth_tokens').insert({
    token_hash: hashToken(accessToken),
    token_type: 'access',
    client_id: grant.clientId,
    user_id: grant.userId,
    agent_id: grant.agentId,
    tenant_id: grant.tenantId,
    scopes: grant.scopes,
    resource: grant.resource,
    organization_ids: grant.organizationIds,
    // Linked so revoking the grant takes the access token with it.
    refresh_parent_id: (refreshRow as { id: string }).id,
    expires_at: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
  });

  if (accessError) {
    await client.from('oauth_tokens').delete().eq('id', (refreshRow as { id: string }).id);
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: grant.scopes.join(' '),
  };
}

/**
 * Revokes every token descended from a grant.
 *
 * Used both for an explicit revocation and when a replayed authorization
 * code is detected, which OAuth 2.1 §7.5 treats as evidence of compromise.
 */
export async function revokeTokenFamily(
  client: OAuthSupabaseClient,
  match: { refreshParentId?: string; userId?: string; clientId?: string },
): Promise<number> {
  let query = client
    .from('oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .is('revoked_at', null);

  if (match.refreshParentId) {
    query = query.or(`id.eq.${match.refreshParentId},refresh_parent_id.eq.${match.refreshParentId}`);
  } else if (match.userId && match.clientId) {
    query = query.eq('user_id', match.userId).eq('client_id', match.clientId);
  } else {
    return 0;
  }

  const { data } = await query.select('id');
  return (data ?? []).length;
}

/** Shape of an OAuth error response (RFC 6749 §5.2). */
export function oauthError(
  error: string,
  description?: string,
  status = 400,
): Response {
  return new Response(
    JSON.stringify({ error, ...(description ? { error_description: description } : {}) }),
    {
      status,
      headers: {
        'content-type': 'application/json',
        // The token endpoint is called cross-origin by browser-based clients.
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      },
    },
  );
}
