// ---------------------------------------------------------------------------
// OAuth 2.0 Protected Resource Metadata — RFC 9728
// ---------------------------------------------------------------------------
// GET /.well-known/oauth-protected-resource
//
// This is the document an MCP client fetches after receiving a 401, to learn
// WHERE to authenticate. It is the entry point of the whole authorization
// flow and the one piece the MCP spec makes mandatory for a server that
// supports OAuth.
//
// No authentication: the point of the document is to be readable by a client
// that does not yet have a token. It describes the surface, never a secret.
//
// Current state of this deployment
// --------------------------------
// `authorization_servers` is empty, and deliberately so. Supabase Auth
// advertises /auth/v1/oauth/authorize and /auth/v1/oauth/token in its OIDC
// metadata, but both return 404 — verified against this project's instance.
// It cannot act as the authorization server for MCP today.
//
// Pointing at an endpoint that 404s would be worse than pointing at nothing:
// a client would start a flow it cannot finish, and the failure would look
// like our bug rather than a missing capability. An empty list, together
// with `authorization_status`, says plainly that OAuth discovery exists and
// the authorization server does not yet.
//
// API keys remain the working authentication method and are documented here
// so a client that reads this knows there IS a way in.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';

import { resolveOrigin, resolveResourceId } from '~/lib/mcp/origin';
import { ALL_SCOPES } from '~/lib/services/api-key.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const origin = resolveOrigin(request);
  const resource = resolveResourceId(request);

  return NextResponse.json(
    {
      // RFC 9728 §2 — the canonical identifier of this protected resource.
      // Must match the `resource` parameter clients send under RFC 8707 and
      // the audience of any token issued for it.
      resource,

      // RFC 9728 §2 — issuers whose tokens this resource accepts. Empty
      // until an authorization server exists; see the note above.
      authorization_servers: [],

      scopes_supported: ALL_SCOPES,

      // RFC 6750 bearer tokens in the Authorization header. We never accept
      // credentials in a query string: they end up in logs and referrers.
      bearer_methods_supported: ['header'],

      resource_name: 'NovaDesk ITSM',
      resource_documentation: `${origin}/api/mcp/manifest`,

      // Non-standard, additive: tells a client what it can actually do today
      // instead of leaving it to infer from an empty authorization_servers.
      authorization_status: {
        oauth: 'not_yet_available',
        detail:
          'OAuth discovery is published, but no authorization server is configured yet. Authenticate with an API key issued from the ITSM settings and sent as `Authorization: Bearer <key>`.',
        supported_methods: ['api_key'],
        api_key_format: 'nvd_{live|test}_{32 chars}',
      },
    },
    {
      status: 200,
      headers: {
        // Small, public and stable. Cached at the edge, but briefly enough
        // that enabling an authorization server propagates quickly.
        'cache-control': 'public, max-age=300, s-maxage=300',
        // Discovery is cross-origin by nature: the client fetching this is
        // not the one serving the page.
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
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-max-age': '86400',
    },
  });
}
