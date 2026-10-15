// ---------------------------------------------------------------------------
// OAuth 2.1 Authorization Endpoint — request validation and code issuance
// ---------------------------------------------------------------------------
// Split out of the page so the security decisions sit in one testable place
// and the component only renders.
//
// The hard rule of /authorize: an error goes back to the CLIENT via the
// redirect_uri ONLY once the redirect_uri itself is known to be legitimate.
// Before that point an error must be shown in OUR page, because redirecting
// to an unvalidated URI is exactly how an open redirector is built — and an
// attacker would use it to receive a code (OAuth 2.1 §7.5, RFC 6749 §4.1.2.1).
// ---------------------------------------------------------------------------

import 'server-only';

import type { OAuthSupabaseClient } from '~/lib/oauth/oauth.types';

import {
  AUTH_CODE_TTL_SECONDS,
  type ClientRecord,
  canonicalResource,
  hashToken,
  newAuthorizationCode,
  redirectUriAllowed,
  resolveScopes,
} from '~/lib/oauth/oauth.service';

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  resource: string;
  scopes: string[];
}

export type AuthorizeValidation =
  /** Safe to render consent: client and redirect_uri are both verified. */
  | { kind: 'ok'; request: AuthorizeRequest; client: ClientRecord }
  /**
   * The redirect_uri is verified, so the error belongs to the client and is
   * returned through it (RFC 6749 §4.1.2.1).
   */
  | { kind: 'redirect_error'; redirectTo: string }
  /**
   * The redirect_uri could not be trusted. Render the message ourselves;
   * redirecting here would make this an open redirector.
   */
  | { kind: 'render_error'; error: string; description: string };

function buildErrorRedirect(
  redirectUri: string,
  state: string | null,
  error: string,
  description: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Validates an /authorize request.
 *
 * Order matters and is dictated by the spec: client_id and redirect_uri are
 * checked FIRST, because every later error can only be reported through a
 * redirect_uri that has already been proven legitimate.
 */
export async function validateAuthorizeRequest(
  supabase: OAuthSupabaseClient,
  params: URLSearchParams,
  expectedResource: string,
  resolveClientFn: (c: OAuthSupabaseClient, id: string) => Promise<ClientRecord | null>,
): Promise<AuthorizeValidation> {
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');

  if (!clientId) {
    return {
      kind: 'render_error',
      error: 'invalid_request',
      description: 'client_id is required.',
    };
  }

  const client = await resolveClientFn(supabase, clientId);
  if (!client) {
    return {
      kind: 'render_error',
      error: 'invalid_client',
      description:
        'This client is not registered or has been disabled. Register it first, or check the client_id.',
    };
  }

  // Omitting redirect_uri is only unambiguous with exactly one registered.
  const effectiveRedirect =
    redirectUri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0]! : null);

  if (!effectiveRedirect) {
    return {
      kind: 'render_error',
      error: 'invalid_request',
      description:
        'redirect_uri is required when the client has more than one registered redirect URI.',
    };
  }

  if (!redirectUriAllowed(effectiveRedirect, client.redirect_uris)) {
    return {
      kind: 'render_error',
      error: 'invalid_redirect_uri',
      description:
        'The redirect_uri does not exactly match one registered for this client. OAuth 2.1 requires an exact match.',
    };
  }

  // ── Past this line the redirect_uri is trusted, so errors go to the client.

  const responseType = params.get('response_type');
  if (responseType !== 'code') {
    return {
      kind: 'redirect_error',
      redirectTo: buildErrorRedirect(
        effectiveRedirect,
        state,
        'unsupported_response_type',
        'Only response_type=code is supported. The implicit and password grants are removed in OAuth 2.1.',
      ),
    };
  }

  const codeChallenge = params.get('code_challenge');
  const challengeMethod = params.get('code_challenge_method');

  if (!codeChallenge) {
    return {
      kind: 'redirect_error',
      redirectTo: buildErrorRedirect(
        effectiveRedirect,
        state,
        'invalid_request',
        'code_challenge is required: PKCE is mandatory in OAuth 2.1.',
      ),
    };
  }

  // S256 only. `plain` would let anyone who intercepted the request reuse
  // the challenge as the verifier.
  if (challengeMethod && challengeMethod !== 'S256') {
    return {
      kind: 'redirect_error',
      redirectTo: buildErrorRedirect(
        effectiveRedirect,
        state,
        'invalid_request',
        'Only code_challenge_method=S256 is supported.',
      ),
    };
  }

  // A base64url SHA-256 digest is always 43 characters.
  if (!/^[A-Za-z0-9\-._~]{43}$/.test(codeChallenge)) {
    return {
      kind: 'redirect_error',
      redirectTo: buildErrorRedirect(
        effectiveRedirect,
        state,
        'invalid_request',
        'code_challenge must be a base64url-encoded SHA-256 digest (43 characters).',
      ),
    };
  }

  // RFC 8707. The MCP spec requires clients to send it; when absent we bind
  // to this server rather than minting an unbounded-audience token.
  const requestedResource = params.get('resource');
  let resource = expectedResource;
  if (requestedResource) {
    const canonical = canonicalResource(requestedResource);
    if (!canonical || canonical !== canonicalResource(expectedResource)) {
      return {
        kind: 'redirect_error',
        redirectTo: buildErrorRedirect(
          effectiveRedirect,
          state,
          'invalid_target',
          `This authorization server only issues tokens for ${expectedResource}.`,
        ),
      };
    }
    resource = canonical;
  }

  const requestedScopes = params.get('scope')?.split(/\s+/).filter(Boolean) ?? null;
  const scopes = resolveScopes(requestedScopes, client.allowed_scopes);

  if (!scopes.length) {
    return {
      kind: 'redirect_error',
      redirectTo: buildErrorRedirect(
        effectiveRedirect,
        state,
        'invalid_scope',
        'None of the requested scopes are available to this client.',
      ),
    };
  }

  return {
    kind: 'ok',
    client,
    request: {
      clientId,
      redirectUri: effectiveRedirect,
      state,
      codeChallenge,
      resource,
      scopes,
    },
  };
}

/**
 * Issues an authorization code for an approved request and returns the URL
 * to send the user back to.
 *
 * The code records what the USER approved, not what the client asked for:
 * the token endpoint reads the grant from this row and never re-reads the
 * original request.
 */
export async function issueAuthorizationCode(
  supabase: OAuthSupabaseClient,
  approval: {
    request: AuthorizeRequest;
    userId: string;
    agentId: string;
    tenantId: string;
    /** Narrowed at consent if the user unchecked scopes. Never widened. */
    grantedScopes: string[];
    organizationIds: string[] | null;
  },
): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  const { request } = approval;

  // Defence in depth: consent runs in a browser, so treat the posted scope
  // list as untrusted and intersect it with the validated request.
  const granted = approval.grantedScopes.filter((s) => request.scopes.includes(s));
  if (!granted.length) return { ok: false, error: 'No scopes were granted.' };

  const code = newAuthorizationCode();

  const { error } = await supabase.from('oauth_authorization_codes').insert({
    code_hash: hashToken(code),
    client_id: request.clientId,
    user_id: approval.userId,
    agent_id: approval.agentId,
    tenant_id: approval.tenantId,
    scopes: granted,
    resource: request.resource,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
    organization_ids: approval.organizationIds,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
  });

  if (error) return { ok: false, error: error.message };

  // A dynamic registration has no tenant until a real user approves it.
  // Binding it here is what ties an anonymous client_id to this workspace.
  await supabase
    .from('oauth_clients')
    .update({ tenant_id: approval.tenantId })
    .eq('client_id', request.clientId)
    .is('tenant_id', null);

  const url = new URL(request.redirectUri);
  url.searchParams.set('code', code);
  // Echoed back unmodified: this is the client's CSRF defence, and dropping
  // it would make a compliant client reject the response.
  if (request.state) url.searchParams.set('state', request.state);

  return { ok: true, redirectTo: url.toString() };
}
