// ---------------------------------------------------------------------------
// OAuth 2.0 Token Revocation — RFC 7009
// ---------------------------------------------------------------------------
// POST /api/oauth/revoke
//
// A client that is signing out, or that believes a token leaked, needs a way
// to kill it immediately. Because tokens here are opaque rows rather than
// JWTs, revocation is real: the next MCP request fails, not the one after
// the TTL expires.
//
// Revoking a refresh token takes the whole family with it — the access
// tokens minted from it are useless on their own and leaving them alive
// would defeat the point of revoking.
//
// RFC 7009 §2.2: the response is 200 even for an unknown token. Reporting
// "no such token" would turn this endpoint into an oracle for guessing
// valid ones.
// ---------------------------------------------------------------------------

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { hashToken, oauthError, revokeTokenFamily } from '~/lib/oauth/oauth.service';
import { asOAuthClient } from '~/lib/oauth/oauth.types';

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

async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
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

/** 200 with an empty body — the RFC's success response. */
function ok() {
  return new Response(null, {
    status: 200,
    headers: { 'cache-control': 'no-store', ...CORS },
  });
}

export async function POST(request: Request) {
  const params = await readParams(request);
  const { token, client_id } = params;

  if (!token) return oauthError('invalid_request', 'token is required');

  const supabase = asOAuthClient(getSupabaseServerAdminClient());

  const { data } = await supabase
    .from('oauth_tokens')
    .select('id, client_id, token_type, refresh_parent_id, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  // Unknown token: already in the desired state, as far as the caller is
  // concerned (RFC 7009 §2.2).
  if (!data) return ok();

  const row = data as {
    id: string;
    client_id: string;
    token_type: string;
    refresh_parent_id: string | null;
    revoked_at: string | null;
  };

  // A client may only revoke its own tokens. Without this check any client
  // could revoke another's by guessing — or by replaying a token it saw.
  if (client_id && row.client_id !== client_id) {
    return oauthError('invalid_client', 'Token was issued to a different client', 401);
  }

  if (row.revoked_at) return ok();

  if (row.token_type === 'refresh') {
    // The refresh token and every access token minted from it.
    await revokeTokenFamily(supabase, { refreshParentId: row.id });
  } else if (row.refresh_parent_id) {
    // RFC 7009 §2.1: revoking an access token SHOULD also invalidate the
    // refresh token it came from, so the client cannot simply mint another.
    await revokeTokenFamily(supabase, { refreshParentId: row.refresh_parent_id });
  } else {
    await supabase
      .from('oauth_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', row.id);
  }

  return ok();
}
