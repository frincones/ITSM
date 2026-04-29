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
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  registry,
} from '~/lib/mcp/server';
import { ALL_SCOPES } from '~/lib/services/api-key.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
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
      },
      transport: {
        type: 'http',
        url: '/api/mcp',
        methods: ['POST'],
        contentType: 'application/json',
        format: 'jsonrpc-2.0',
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
      clientConfigs: {
        claudeDesktop: {
          mcpServers: {
            novadesk: {
              transport: 'http',
              url: '/api/mcp',
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
