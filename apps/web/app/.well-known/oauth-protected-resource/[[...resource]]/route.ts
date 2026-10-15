// ---------------------------------------------------------------------------
// OAuth 2.0 Protected Resource Metadata — RFC 9728
// ---------------------------------------------------------------------------
// GET /.well-known/oauth-protected-resource            (recurso sin path)
// GET /.well-known/oauth-protected-resource/api/mcp    (este servidor)
//
// RFC 9728 §3.1: cuando el identificador del recurso tiene path, ese path se
// AÑADE DESPUÉS del sufijo well-known — no al principio. Para
// `https://host/api/mcp` el documento vive en
// `/.well-known/oauth-protected-resource/api/mcp`.
//
// Servirlo solo en la raíz es lo que hacía fallar la conexión desde
// Claude.ai: pide la ruta con path, recibía 404 y abortaba antes de
// empezar el flujo. Un catch-all opcional cubre ambas formas.
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

export async function GET(
  request: Request,
  context: { params: Promise<{ resource?: string[] }> },
) {
  const origin = resolveOrigin(request);
  const resource = resolveResourceId(request);

  // El path pedido debe corresponder al recurso que este documento describe.
  // Responder el mismo metadata para cualquier ruta convertiría esto en un
  // comodín: un cliente que pide /otro-servidor recibiría credenciales de
  // descubrimiento que no le corresponden.
  const segments = (await context.params).resource ?? [];
  if (segments.length) {
    const requested = `/${segments.join('/')}`;
    if (requested !== new URL(resource).pathname) {
      return new Response(
        JSON.stringify({
          error: 'not_found',
          error_description: `No protected resource metadata for ${requested}. This server publishes ${new URL(resource).pathname}.`,
        }),
        {
          status: 404,
          headers: {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
          },
        },
      );
    }
  }

  return NextResponse.json(
    {
      // RFC 9728 §2 — the canonical identifier of this protected resource.
      // Must match the `resource` parameter clients send under RFC 8707 and
      // the audience of any token issued for it.
      resource,

      // RFC 9728 §2 — issuers whose tokens this resource accepts. The MCP
      // spec requires at least one entry, and a client reads this to find
      // where to authenticate. The app hosts its own: Supabase Auth
      // advertises OAuth endpoints that return 404, so it cannot serve as
      // the authorization server (see lib/oauth/oauth.service.ts).
      authorization_servers: [origin],

      scopes_supported: ALL_SCOPES,

      // RFC 6750 bearer tokens in the Authorization header. We never accept
      // credentials in a query string: they end up in logs and referrers.
      bearer_methods_supported: ['header'],

      resource_name: 'NovaDesk ITSM',
      resource_documentation: `${origin}/api/mcp/manifest`,

      // Non-standard, additive: API keys remain a supported method
      // alongside OAuth, and a client reading only the standard fields
      // would not learn that.
      authorization_status: {
        oauth: 'available',
        detail:
          'Authenticate with OAuth 2.1 (authorization code + PKCE) via the authorization server listed above, or with an API key issued from the ITSM settings. Both are sent as `Authorization: Bearer <token>`.',
        supported_methods: ['oauth2', 'api_key'],
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
