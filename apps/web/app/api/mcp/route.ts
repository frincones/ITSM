// ---------------------------------------------------------------------------
// MCP HTTP Endpoint — POST /api/mcp
// ---------------------------------------------------------------------------
// Implements JSON-RPC 2.0 over HTTP for the Model Context Protocol.
//
// Methods supported:
//   - initialize           handshake: returns server info + capabilities
//   - tools/list           catalog of registered tools (with JSON Schema)
//   - tools/call           invoke a tool by name with arguments
//   - ping                 liveness
//   - notifications/*      ignored (no streaming yet)
//
// Auth: Bearer token in `Authorization` header. The token is the plain
//   API key (`nvd_live_xxxxx`). It's hashed with SHA-256 and verified
//   against the `api_keys` table via the SECURITY DEFINER RPC.
//
// Rate limit: per-key, per-minute, enforced atomically in-DB via
//   `increment_rate_bucket`. Replaceable with Redis without changing
//   handler code.
//
// Every call (including failures) is recorded in `mcp_audit_log`.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { recordMcpCall, type AuditStatus } from '~/lib/mcp/audit';
import { buildContext, type McpCallerMeta } from '~/lib/mcp/context';
import {
  JsonRpcErrorCode,
  McpError,
  invalidParams,
  methodNotFound,
  rateLimited,
  unauthorized,
} from '~/lib/mcp/errors';
import { zodToJsonSchema } from '~/lib/mcp/json-schema';
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  registry,
} from '~/lib/mcp/server';
import {
  checkRateLimit,
  verifyApiKey,
} from '~/lib/services/api-key.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function buildError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match || !match[1]) return null;
  return match[1].trim();
}

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  );
}

function newRequestId(): string {
  // RFC4122-like, sufficient for tracing. Crypto.randomUUID is available
  // in Node 19+ which Next 15 requires.
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Method dispatchers
// ---------------------------------------------------------------------------

async function handleInitialize(): Promise<unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    capabilities: {
      tools: { listChanged: false },
      resources: {},
      prompts: {},
      logging: {},
    },
    instructions:
      'NovaDesk ITSM MCP server. Tools are namespaced by resource (tickets.*, kb.*, ...). Authenticate with Bearer <api_key>. See /api/mcp/manifest for the full public catalog.',
  };
}

function handleToolsList(): unknown {
  const tools = registry.list().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema),
    ...(t.outputSchema ? { outputSchema: zodToJsonSchema(t.outputSchema) } : {}),
    _meta: {
      scope: t.scope,
      since: t.meta?.since,
      deprecated: t.meta?.deprecated,
      tags: t.meta?.tags,
    },
  }));
  return { tools };
}

// ---------------------------------------------------------------------------
// Per-request execution
// ---------------------------------------------------------------------------

async function executeRpc(
  req: NextRequest,
  rpc: JsonRpcRequest,
): Promise<{ response: JsonRpcResponse; httpStatus: number }> {
  const id = rpc.id ?? null;
  const requestId = req.headers.get('x-request-id') ?? newRequestId();

  // Validate JSON-RPC envelope.
  if (rpc.jsonrpc !== '2.0' || !rpc.method) {
    return {
      response: buildError(
        id,
        JsonRpcErrorCode.InvalidRequest,
        'Invalid JSON-RPC 2.0 request',
      ),
      httpStatus: 400,
    };
  }

  // Notifications (id absent) are silently accepted in the spec; we don't
  // implement push notifications, so just acknowledge.
  if (rpc.id === undefined && rpc.method.startsWith('notifications/')) {
    return { response: { jsonrpc: '2.0', id: null, result: null }, httpStatus: 204 };
  }

  // Methods that don't require auth.
  if (rpc.method === 'ping') {
    return { response: { jsonrpc: '2.0', id, result: {} }, httpStatus: 200 };
  }

  if (rpc.method === 'initialize') {
    return {
      response: { jsonrpc: '2.0', id, result: await handleInitialize() },
      httpStatus: 200,
    };
  }

  // ---- Authenticated methods ----
  const supabase = getSupabaseServerAdminClient();
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent');

  const bearer = extractBearer(req);
  if (!bearer) {
    return {
      response: buildError(id, JsonRpcErrorCode.Unauthorized, 'Missing Bearer token'),
      httpStatus: 401,
    };
  }

  const verified = await verifyApiKey(supabase, bearer, ip);
  if (!verified) {
    return {
      response: buildError(id, JsonRpcErrorCode.Unauthorized, 'Invalid or revoked API key'),
      httpStatus: 401,
    };
  }

  // Rate limit (per key, per minute).
  const rate = await checkRateLimit(supabase, verified.id, verified.rate_limit_rpm);
  if (!rate.allowed) {
    await recordMcpCall(supabase, {
      tenantId: verified.tenant_id,
      apiKeyId: verified.id,
      agentId: null,
      channel: 'mcp',
      toolName: rpc.method,
      status: 'rate_limited',
      statusCode: 429,
      durationMs: 0,
      ip,
      userAgent,
      requestId,
      arguments: rpc.params,
    });
    const err = rateLimited(rate.limit);
    return {
      response: buildError(id, err.code, err.message, err.data),
      httpStatus: 429,
    };
  }

  // Build the tool execution context.
  const callerMeta: McpCallerMeta = {
    apiKeyId: verified.id,
    agentId: null,
    channel: 'mcp',
    ip,
    userAgent,
    requestId,
  };

  const ctx = buildContext({
    tenantId: verified.tenant_id,
    scopes: verified.scopes,
    organizationIds: verified.organization_ids,
    caller: callerMeta,
    supabase,
  });

  // Method routing.
  const start = Date.now();
  let auditStatus: AuditStatus = 'success';
  let httpStatus = 200;
  let toolName = rpc.method;
  let toolArgs: unknown = rpc.params;
  let result: unknown = null;
  let errorMessage: string | null = null;

  try {
    if (rpc.method === 'tools/list') {
      result = handleToolsList();
    } else if (rpc.method === 'tools/call') {
      const params = (rpc.params ?? {}) as { name?: string; arguments?: unknown };
      if (!params.name || typeof params.name !== 'string') {
        throw invalidParams('tools/call requires { name: string, arguments?: object }');
      }
      toolName = params.name;
      toolArgs = params.arguments;
      const toolResult = await registry.invoke(params.name, ctx, params.arguments ?? {});
      result = {
        content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
        structuredContent: toolResult,
        isError: false,
      };
    } else if (rpc.method === 'resources/list' || rpc.method === 'prompts/list') {
      // Reserved for the next iteration. Return empty lists so MCP clients
      // that probe these don't error out.
      result = rpc.method === 'resources/list' ? { resources: [] } : { prompts: [] };
    } else {
      throw methodNotFound(rpc.method);
    }
  } catch (err) {
    if (err instanceof McpError) {
      httpStatus = err.httpStatus;
      auditStatus =
        err.code === JsonRpcErrorCode.Forbidden ? 'forbidden'
          : err.code === JsonRpcErrorCode.Unauthorized ? 'unauthorized'
          : err.code === JsonRpcErrorCode.ValidationError || err.code === JsonRpcErrorCode.InvalidParams ? 'invalid_input'
          : 'error';
      errorMessage = err.message;
      const failure = buildError(id, err.code, err.message, err.data);
      await recordMcpCall(supabase, {
        tenantId: verified.tenant_id,
        apiKeyId: verified.id,
        agentId: null,
        channel: 'mcp',
        toolName,
        status: auditStatus,
        statusCode: httpStatus,
        durationMs: Date.now() - start,
        errorMessage,
        ip,
        userAgent,
        requestId,
        arguments: toolArgs,
      });
      return { response: failure, httpStatus };
    }

    httpStatus = 500;
    auditStatus = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    const failure = buildError(id, JsonRpcErrorCode.InternalError, errorMessage);
    await recordMcpCall(supabase, {
      tenantId: verified.tenant_id,
      apiKeyId: verified.id,
      agentId: null,
      channel: 'mcp',
      toolName,
      status: 'error',
      statusCode: 500,
      durationMs: Date.now() - start,
      errorMessage,
      ip,
      userAgent,
      requestId,
      arguments: toolArgs,
    });
    return { response: failure, httpStatus };
  }

  // Success path.
  await recordMcpCall(supabase, {
    tenantId: verified.tenant_id,
    apiKeyId: verified.id,
    agentId: null,
    channel: 'mcp',
    toolName,
    status: 'success',
    statusCode: 200,
    durationMs: Date.now() - start,
    ip,
    userAgent,
    requestId,
    arguments: toolArgs,
  });

  return { response: { jsonrpc: '2.0', id, result }, httpStatus: 200 };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      buildError(null, JsonRpcErrorCode.ParseError, 'Invalid JSON'),
      { status: 400 },
    );
  }

  // Batch support per JSON-RPC 2.0.
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return NextResponse.json(
        buildError(null, JsonRpcErrorCode.InvalidRequest, 'Empty batch'),
        { status: 400 },
      );
    }
    const results = await Promise.all(
      body.map((item) => executeRpc(req, item as JsonRpcRequest)),
    );
    return NextResponse.json(
      results.map((r) => r.response),
      { status: 200 },
    );
  }

  const single = body as JsonRpcRequest;
  const { response, httpStatus } = await executeRpc(req, single);
  return NextResponse.json(response, { status: httpStatus });
}

// GET is reserved for the future Streamable HTTP SSE channel. For now,
// return 405 with a descriptive payload so misconfigured clients fail
// loudly.
export async function GET() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      hint: 'Use POST with a JSON-RPC 2.0 envelope. SSE streaming will be added in a future version.',
      manifest: '/api/mcp/manifest',
    },
    { status: 405 },
  );
}
