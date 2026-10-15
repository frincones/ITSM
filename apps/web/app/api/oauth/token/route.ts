// ---------------------------------------------------------------------------
// OAuth 2.1 Token Endpoint
// ---------------------------------------------------------------------------
// POST /api/oauth/token
//
// Two grants: authorization_code (first exchange) and refresh_token
// (renewal). Both mint a fresh access/refresh pair; refresh tokens are
// rotated because OAuth 2.1 requires it for public clients, and every MCP
// client is a public client.
//
// Replay handling is the part worth reading. If a code is presented twice,
// the second attempt is not merely refused — every token descended from
// that code is revoked, per OAuth 2.1 §7.5. A replayed code means it leaked,
// and the attacker may already hold a working token from the first use.
// The same rule applies to a replayed refresh token.
// ---------------------------------------------------------------------------

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { recordMcpCall } from '~/lib/mcp/audit';
import { asOAuthClient, type OAuthSupabaseClient } from '~/lib/oauth/oauth.types';
import {
  canonicalResource,
  hashToken,
  issueTokens,
  oauthError,
  resolveClient,
  revokeTokenFamily,
  verifyPkce,
} from '~/lib/oauth/oauth.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
  'access-control-max-age': '86400',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Accepts form-encoded (the spec's default) and JSON, which some clients send. */
async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, String(v ?? '')]),
      );
    } catch {
      return {};
    }
  }

  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

export async function POST(request: Request) {
  const params = await readParams(request);
  // Cast at the boundary: the generated types predate migration 00066.
  // See lib/oauth/oauth.types.ts — this disappears once it is applied.
  const supabase = asOAuthClient(getSupabaseServerAdminClient());

  const grantType = params.grant_type;
  if (grantType === 'authorization_code') {
    return handleAuthorizationCode(request, supabase, params);
  }
  if (grantType === 'refresh_token') {
    return handleRefreshToken(request, supabase, params);
  }

  return oauthError(
    'unsupported_grant_type',
    `Supported: authorization_code, refresh_token. Received: ${grantType ?? '(none)'}`,
  );
}

async function handleAuthorizationCode(
  request: Request,
  supabase: OAuthSupabaseClient,
  params: Record<string, string>,
) {
  const { code, client_id, redirect_uri, code_verifier, resource } = params;

  if (!code) return oauthError('invalid_request', 'code is required');
  if (!client_id) return oauthError('invalid_request', 'client_id is required');
  if (!code_verifier) {
    return oauthError('invalid_request', 'code_verifier is required: PKCE is mandatory');
  }

  const client = await resolveClient(supabase, client_id);
  if (!client) return oauthError('invalid_client', 'Unknown or inactive client', 401);

  const { data, error } = await supabase.rpc('redeem_authorization_code', {
    p_code_hash: hashToken(code),
  });

  if (error) return oauthError('server_error', error.message, 500);

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        code_id: string;
        client_id: string;
        user_id: string;
        agent_id: string;
        tenant_id: string;
        scopes: string[];
        resource: string;
        redirect_uri: string;
        code_challenge: string;
        organization_ids: string[] | null;
        was_reused: boolean;
        is_expired: boolean;
      }
    | undefined;

  if (!row) return oauthError('invalid_grant', 'Unknown authorization code');

  if (row.was_reused) {
    // OAuth 2.1 §7.5: a replayed code is evidence of compromise. The
    // attacker may already hold tokens from the first redemption, so the
    // whole grant goes, not just this attempt.
    await revokeTokenFamily(supabase, {
      userId: row.user_id,
      clientId: row.client_id,
    });
    await recordMcpCall(supabase, {
      tenantId: row.tenant_id,
      apiKeyId: null,
      agentId: row.agent_id,
      channel: 'oauth',
      toolName: 'oauth/token:code_replay',
      status: 'unauthorized',
      statusCode: 400,
      durationMs: 0,
      errorMessage: 'Authorization code replayed; all tokens for this grant revoked',
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
      requestId: null,
    });
    return oauthError(
      'invalid_grant',
      'This authorization code was already used. All tokens issued from it have been revoked.',
    );
  }

  if (row.is_expired) return oauthError('invalid_grant', 'Authorization code has expired');

  // The code belongs to the client that requested it.
  if (row.client_id !== client_id) {
    return oauthError('invalid_grant', 'Authorization code was issued to a different client');
  }

  // OAuth 2.1 §4.1.3: byte-for-byte, not a prefix.
  if (redirect_uri && redirect_uri !== row.redirect_uri) {
    return oauthError('invalid_grant', 'redirect_uri does not match the authorization request');
  }

  if (!verifyPkce(code_verifier, row.code_challenge)) {
    return oauthError('invalid_grant', 'PKCE verification failed');
  }

  // RFC 8707: if the client names a resource here it must be the one the
  // code was bound to, or the token would be minted for a different
  // audience than the user approved.
  if (resource) {
    const canonical = canonicalResource(resource);
    if (!canonical || canonical !== row.resource) {
      return oauthError('invalid_target', 'resource does not match the authorization request');
    }
  }

  const tokens = await issueTokens(supabase, {
    clientId: row.client_id,
    userId: row.user_id,
    agentId: row.agent_id,
    tenantId: row.tenant_id,
    scopes: row.scopes,
    resource: row.resource,
    organizationIds: row.organization_ids,
  });

  if (!tokens) return oauthError('server_error', 'Could not issue tokens', 500);

  await supabase
    .from('oauth_clients')
    .update({ last_used_at: new Date().toISOString() })
    .eq('client_id', row.client_id);

  return tokenResponse(tokens);
}

async function handleRefreshToken(
  request: Request,
  supabase: OAuthSupabaseClient,
  params: Record<string, string>,
) {
  const { refresh_token, client_id, scope } = params;

  if (!refresh_token) return oauthError('invalid_request', 'refresh_token is required');
  if (!client_id) return oauthError('invalid_request', 'client_id is required');

  const { data: tokenRow } = await supabase
    .from('oauth_tokens')
    .select(
      'id, client_id, user_id, agent_id, tenant_id, scopes, resource, organization_ids, revoked_at, expires_at',
    )
    .eq('token_hash', hashToken(refresh_token))
    .eq('token_type', 'refresh')
    .maybeSingle();

  if (!tokenRow) return oauthError('invalid_grant', 'Unknown refresh token');

  const row = tokenRow as {
    id: string;
    client_id: string;
    user_id: string;
    agent_id: string;
    tenant_id: string;
    scopes: string[];
    resource: string;
    organization_ids: string[] | null;
    revoked_at: string | null;
    expires_at: string;
  };

  if (row.revoked_at) {
    // A revoked refresh token being presented means it leaked after
    // rotation. Same reasoning as a replayed code: revoke the family.
    await revokeTokenFamily(supabase, { userId: row.user_id, clientId: row.client_id });
    return oauthError(
      'invalid_grant',
      'This refresh token was already rotated. All tokens for this grant have been revoked.',
    );
  }

  if (new Date(row.expires_at) <= new Date()) {
    return oauthError('invalid_grant', 'Refresh token has expired');
  }

  if (row.client_id !== client_id) {
    return oauthError('invalid_grant', 'Refresh token was issued to a different client');
  }

  // A refresh may narrow scope but never widen it (OAuth 2.1 §4.3.1).
  let scopes = row.scopes;
  if (scope) {
    const requested = scope.split(/\s+/).filter(Boolean);
    const narrowed = requested.filter((s) => row.scopes.includes(s));
    if (narrowed.length !== requested.length) {
      return oauthError('invalid_scope', 'Refresh cannot request scopes beyond the original grant');
    }
    scopes = narrowed;
  }

  // Rotation: the old refresh token dies with the new pair, so a stolen
  // copy is detectable on next use.
  await supabase
    .from('oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', row.id);

  const tokens = await issueTokens(supabase, {
    clientId: row.client_id,
    userId: row.user_id,
    agentId: row.agent_id,
    tenantId: row.tenant_id,
    scopes,
    resource: row.resource,
    organizationIds: row.organization_ids,
  });

  if (!tokens) return oauthError('server_error', 'Could not issue tokens', 500);
  return tokenResponse(tokens);
}

function tokenResponse(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}) {
  return new Response(
    JSON.stringify({
      access_token: tokens.access_token,
      token_type: 'Bearer',
      expires_in: tokens.expires_in,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // RFC 6749 §5.1: token responses must never be cached.
        'cache-control': 'no-store',
        pragma: 'no-cache',
        ...CORS,
      },
    },
  );
}
