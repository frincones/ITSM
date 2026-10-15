// ---------------------------------------------------------------------------
// OAuth 2.0 Authorization Server Metadata — RFC 8414
// ---------------------------------------------------------------------------
// GET /.well-known/oauth-authorization-server            (el issuer real)
// GET /.well-known/oauth-authorization-server/api/mcp    (variante que
//                                                         algunos clientes
//                                                         prueban primero)
//
// El issuer de este servidor NO tiene path (`https://host`), así que la ruta
// canónica es la raíz. Pero varios clientes —Claude.ai entre ellos— prueban
// primero la forma con el path del recurso, como hacen para RFC 9728. Un
// catch-all opcional responde a ambas en vez de devolver 404 y hacer que el
// cliente abandone el flujo.
//
// El documento es el mismo en los dos casos: describe un único authorization
// server, y `issuer` siempre apunta al origen sin path.
//
// The MCP spec requires an authorization server to publish either this or
// OpenID Connect Discovery. A client reaches it after reading
// /.well-known/oauth-protected-resource, which names this issuer.
//
// `code_challenge_methods_supported` carries weight beyond documentation:
// the spec tells clients to REFUSE to proceed if it is absent, because
// there is no other way to discover PKCE support. Omitting it would make
// every compliant client give up.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';

import { resolveOrigin } from '~/lib/mcp/origin';
import { SUPPORTED_SCOPES } from '~/lib/oauth/oauth.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  _context: { params: Promise<{ resource?: string[] }> },
) {
  const origin = resolveOrigin(request);

  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      revocation_endpoint: `${origin}/api/oauth/revoke`,

      scopes_supported: SUPPORTED_SCOPES,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],

      // Public clients using PKCE need no secret; confidential clients may
      // post one. Basic auth is omitted deliberately — it adds an encoding
      // footgun for no benefit when the alternative is available.
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],

      // S256 only. OAuth 2.1 requires it where technically possible, and
      // `plain` protects against nothing once a code is intercepted.
      code_challenge_methods_supported: ['S256'],

      // RFC 8707. Tokens are bound to the resource they were requested for
      // and rejected elsewhere.
      resource_indicators_supported: true,

      // NOT advertised, deliberately.
      //
      // `resolveClient()` still accepts an https client_id and fetches the
      // document, so a client that uses CIMD keeps working. But advertising
      // the capability makes Claude.ai PREFER it and skip dynamic
      // registration entirely — and Claude.ai serves no reachable metadata
      // document (its redirect_uri answers 400, and the usual well-known
      // paths 404/403), so the flow would end with nothing to fetch.
      //
      // Advertising a capability the main client cannot complete is worse
      // than not advertising it: it steers that client away from the path
      // that does work. Restore this once a client that publishes a real
      // metadata document needs it.

      service_documentation: `${origin}/api/mcp/manifest`,
    },
    {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=300',
        'access-control-allow-origin': '*',
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      'access-control-max-age': '86400',
    },
  });
}
