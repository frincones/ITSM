// ---------------------------------------------------------------------------
// MCP Public Manifest — GET /api/mcp/manifest
// ---------------------------------------------------------------------------
// Discovery endpoint. No authentication required. Returns the public
// catalog of tools, scopes, protocol version, and connection examples.
// Useful for:
//   - Auto-generating SDKs / OpenAPI specs
//   - Showing in the API keys UI for documentation
//   - MCP marketplace listings
//
// We deliberately do NOT include auth-only data (audit logs, tenant
// info). Anyone can hit this — it only describes the API surface.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';

import { zodToJsonSchema } from '~/lib/mcp/json-schema';
import { listPrompts } from '~/lib/mcp/prompts';
import { listResourceTemplates } from '~/lib/mcp/resources';
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  registry,
} from '~/lib/mcp/server';
import { ALL_SCOPES } from '~/lib/services/api-key.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Absolute endpoint, derived from the incoming request so the manifest is
  // correct behind Vercel, a custom domain or a local tunnel alike.
  const origin = (() => {
    try {
      const url = new URL(request.url);
      const forwardedHost = request.headers.get('x-forwarded-host');
      const forwardedProto = request.headers.get('x-forwarded-proto');
      const host = forwardedHost ?? url.host;
      const proto = forwardedProto ?? url.protocol.replace(':', '');
      return `${proto}://${host}`;
    } catch {
      return '';
    }
  })();
  const endpoint = `${origin}/api/mcp`;

  const tools = registry.list().map((t) => ({
    name: t.name,
    description: t.description,
    scope: t.scope,
    inputSchema: zodToJsonSchema(t.inputSchema),
    since: t.meta?.since,
    deprecated: t.meta?.deprecated,
    tags: t.meta?.tags ?? [],
  }));

  return NextResponse.json(
    {
      server: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      },
      transport: {
        type: 'streamable-http',
        url: endpoint,
        // POST carries JSON-RPC; GET opens the server→client SSE channel.
        methods: ['POST', 'GET'],
        contentType: 'application/json',
        accept: 'application/json, text/event-stream',
        format: 'jsonrpc-2.0',
        sessionHeader: 'Mcp-Session-Id',
        protocolVersionHeader: 'MCP-Protocol-Version',
      },
      authentication: {
        scheme: 'bearer',
        header: 'Authorization',
        prefix: 'Bearer',
        keyFormat: 'nvd_{live|test}_{32 chars}',
        instructions:
          'Generate API keys in /home/settings/api-keys. Pass them in the Authorization header on every request.',
      },
      scopes: ALL_SCOPES,
      tools,
      // Resources and prompts are listed without their contents: the
      // manifest is public, and reading a resource is scope-guarded.
      resourceTemplates: listResourceTemplates(),
      prompts: listPrompts(),
      examples: [
        {
          title: 'List tickets',
          method: 'tools/call',
          params: {
            name: 'tickets_list',
            arguments: { page: 1, limit: 20, status: ['new', 'assigned'] },
          },
        },
        {
          title: 'Search knowledge base',
          method: 'tools/call',
          params: {
            name: 'kb_search',
            arguments: { query: 'wifi password reset', limit: 5 },
          },
        },
      ],
      // Ready-to-paste client configuration. The URL must be absolute —
      // a relative path is meaningless to an MCP client — so it is derived
      // from the request host rather than hardcoded.
      clientConfigs: {
        claudeCode: {
          command: `claude mcp add --transport http novadesk ${endpoint} --header "Authorization: Bearer YOUR_API_KEY"`,
        },
        claudeDesktop: {
          mcpServers: {
            novadesk: {
              type: 'http',
              url: endpoint,
              headers: { Authorization: 'Bearer YOUR_API_KEY' },
            },
          },
        },
        cursor: {
          mcpServers: {
            novadesk: {
              url: endpoint,
              headers: { Authorization: 'Bearer YOUR_API_KEY' },
            },
          },
        },
      },
    },
    {
      status: 200,
      headers: {
        // Manifest is small and public — cache aggressively at the edge.
        'cache-control': 'public, max-age=300, s-maxage=300',
      },
    },
  );
}
