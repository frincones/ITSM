// ---------------------------------------------------------------------------
// OAuth 2.0 Dynamic Client Registration — RFC 7591
// ---------------------------------------------------------------------------
// POST /api/oauth/register
//
// The 2025-11-25 spec downgraded this from SHOULD to MAY and prefers Client
// ID Metadata Documents, but Claude.ai still registers dynamically, so both
// paths are supported.
//
// Registration is deliberately open — that is what RFC 7591 is for, and an
// MCP client has no prior relationship with this server. A registration by
// itself grants nothing: it only reserves a client_id. Access still requires
// a human to sign in and approve a consent screen, and the scopes granted
// there are what bound the token.
// ---------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { SUPPORTED_SCOPES, hashToken, oauthError } from '~/lib/oauth/oauth.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'access-control-max-age': '86400',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** A redirect URI must be https, or loopback for a native client (RFC 8252). */
function validRedirectUri(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return oauthError('invalid_client_metadata', 'Body must be JSON');
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === 'string')
    : [];

  if (!redirectUris.length) {
    return oauthError('invalid_redirect_uri', 'redirect_uris is required and must be non-empty');
  }

  const invalid = redirectUris.filter((u) => !validRedirectUri(u));
  if (invalid.length) {
    return oauthError(
      'invalid_redirect_uri',
      `Redirect URIs must use https, or http on loopback. Rejected: ${invalid.join(', ')}`,
    );
  }

  // Cap the list: an unbounded array is a cheap way to bloat the table.
  if (redirectUris.length > 10) {
    return oauthError('invalid_redirect_uri', 'At most 10 redirect URIs');
  }

  const clientName =
    typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim().slice(0, 255)
      : 'Unnamed MCP client';

  const authMethod =
    body.token_endpoint_auth_method === 'client_secret_post' ? 'client_secret_post' : 'none';

  // Only scopes this server knows. An unknown scope in the request is
  // dropped rather than rejected: RFC 7591 lets the server narrow.
  const requestedScopes =
    typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
  const allowedScopes = requestedScopes.length
    ? requestedScopes.filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s))
    : [...SUPPORTED_SCOPES];

  const clientId = `nvc_${randomBytes(16).toString('base64url')}`;

  // A public client (PKCE, no secret) is the normal case for MCP. A secret
  // is issued only when the client asks to authenticate with one.
  let clientSecret: string | null = null;
  let clientSecretHash: string | null = null;
  if (authMethod === 'client_secret_post') {
    clientSecret = randomBytes(32).toString('base64url');
    clientSecretHash = hashToken(clientSecret);
  }

  const supabase = getSupabaseServerAdminClient();
  const { error } = await supabase.from('oauth_clients').insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: clientName,
    client_uri: typeof body.client_uri === 'string' ? body.client_uri.slice(0, 500) : null,
    logo_uri: typeof body.logo_uri === 'string' ? body.logo_uri.slice(0, 500) : null,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
    allowed_scopes: allowedScopes,
    is_dynamic: true,
    // Left null: a dynamic registration is not yet tied to a tenant. The
    // consent step binds it, because that is where a real user appears.
    tenant_id: null,
  });

  if (error) return oauthError('server_error', error.message, 500);

  return new Response(
    JSON.stringify({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
      scope: allowedScopes.join(' '),
      // RFC 7591 §3.2.1: 0 means the id does not expire.
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
    }),
    {
      status: 201,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
    },
  );
}
