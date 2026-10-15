// ---------------------------------------------------------------------------
// OAuth 2.0 Authorization Server Metadata — RFC 8414
// ---------------------------------------------------------------------------
// GET /.well-known/oauth-authorization-server
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

export async function GET(request: Request) {
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

      // Preferred over dynamic registration in the 2025-11-25 spec: a client
      // identifies itself by an https URL serving its own metadata.
      client_id_metadata_document_supported: true,

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
