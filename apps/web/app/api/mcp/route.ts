// ---------------------------------------------------------------------------
// MCP HTTP Endpoint — /api/mcp  (Streamable HTTP transport, MCP 2025-03-26)
// ---------------------------------------------------------------------------
// Implements JSON-RPC 2.0 over the MCP Streamable HTTP transport so MCP
// clients (Claude Code, Claude Desktop, Cursor) can complete the handshake.
//
// Transport contract honored:
//   * POST  /api/mcp  with `Accept: application/json[, text/event-stream]`
//                     → JSON-RPC body. On `initialize`, response carries
//                       `Mcp-Session-Id: <uuid>`. Stateless backend: the
//                       session id is regenerated each `initialize`.
//   * GET   /api/mcp  with `Accept: text/event-stream`
//                     → opens an SSE stream the client can poll for
//                       server-pushed messages. Keep-alive comment every
//                       15 s; closes after ~50 s so Vercel doesn't kill it
//                       abruptly (clients reconnect transparently).
//
// JSON-RPC methods:
//   - initialize           handshake: returns server info + capabilities
//   - tools/list           catalog of registered tools (with JSON Schema)
//   - tools/call           invoke a tool by name with arguments
//   - ping                 liveness
//   - notifications/*      ignored (no async pushes yet)
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
// Vercel: cap stream duration. SSE GET stays open up to this; clients
// reconnect transparently after close. POST handler typically returns
// in <100 ms so this cap doesn't affect normal tool calls.
export const maxDuration = 60;

// Header used by Streamable HTTP. Spec: visible ASCII chars 0x21–0x7E.
const SESSION_HEADER = 'Mcp-Session-Id';

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

function newSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
}

/** True when the client signals it accepts SSE (per Streamable HTTP). */
function clientAcceptsSse(req: NextRequest): boolean {
  const accept = req.headers.get('accept') ?? '';
  return accept.includes('text/event-stream');
}

/** Builds an SSE event line from a JSON-RPC payload. */
function sseFrame(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
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
// Common response builders
// ---------------------------------------------------------------------------

/**
 * Builds the headers carried on every response (POST or GET):
 *   - `Mcp-Session-Id`: required by Streamable HTTP clients (Claude Code,
 *     Claude Desktop, Cursor) to complete the handshake. We re-issue on
 *     every initialize and echo the inbound id on subsequent requests.
 *   - CORS allow-list: relaxed for cross-origin MCP clients connecting
 *     from custom hosts. Origin is reflected when present.
 */
function commonHeaders(req: NextRequest, sessionId: string): Headers {
  const h = new Headers();
  h.set(SESSION_HEADER, sessionId);
  h.set('Access-Control-Expose-Headers', SESSION_HEADER);
  const origin = req.headers.get('origin');
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Vary', 'Origin');
    h.set('Access-Control-Allow-Credentials', 'true');
  }
  return h;
}

/**
 * Builds an SSE response carrying ONE JSON-RPC message and closes the
 * stream. Used when the client sets `Accept: text/event-stream` on POST —
 * which Claude Code does on initialize.
 */
function jsonRpcAsSse(
  req: NextRequest,
  payload: unknown,
  status: number,
  sessionId: string,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(sseFrame(payload)));
      controller.close();
    },
  });
  const headers = commonHeaders(req, sessionId);
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');
  // Disable Vercel/Cloudflare buffering of SSE streams.
  headers.set('X-Accel-Buffering', 'no');
  return new Response(stream, { status, headers });
}

// ---------------------------------------------------------------------------
// HTTP handler — POST
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Pre-resolve session id: echo inbound (subsequent requests) or mint a
  // new one on initialize.
  const inboundSession = req.headers.get(SESSION_HEADER) ?? req.headers.get(SESSION_HEADER.toLowerCase());
  const wantsSse = clientAcceptsSse(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const sid = inboundSession || newSessionId();
    const err = buildError(null, JsonRpcErrorCode.ParseError, 'Invalid JSON');
    if (wantsSse) return jsonRpcAsSse(req, err, 400, sid);
    return NextResponse.json(err, { status: 400, headers: commonHeaders(req, sid) });
  }

  // Detect an `initialize` call so we mint a fresh session id.
  const isInitialize =
    !Array.isArray(body) &&
    typeof body === 'object' &&
    body !== null &&
    (body as JsonRpcRequest).method === 'initialize';
  const sessionId = isInitialize ? newSessionId() : inboundSession || newSessionId();

  // Batch support per JSON-RPC 2.0.
  if (Array.isArray(body)) {
    if (body.length === 0) {
      const err = buildError(null, JsonRpcErrorCode.InvalidRequest, 'Empty batch');
      if (wantsSse) return jsonRpcAsSse(req, err, 400, sessionId);
      return NextResponse.json(err, { status: 400, headers: commonHeaders(req, sessionId) });
    }
    const results = await Promise.all(
      body.map((item) => executeRpc(req, item as JsonRpcRequest)),
    );
    const payload = results.map((r) => r.response);
    if (wantsSse) return jsonRpcAsSse(req, payload, 200, sessionId);
    return NextResponse.json(payload, { status: 200, headers: commonHeaders(req, sessionId) });
  }

  const single = body as JsonRpcRequest;
  const { response, httpStatus } = await executeRpc(req, single);
  if (wantsSse) return jsonRpcAsSse(req, response, httpStatus, sessionId);
  return NextResponse.json(response, { status: httpStatus, headers: commonHeaders(req, sessionId) });
}

// ---------------------------------------------------------------------------
// HTTP handler — GET (Streamable HTTP SSE channel)
// ---------------------------------------------------------------------------
// MCP clients open this stream to receive server-pushed messages
// (notifications, server-to-client requests). We don't push anything
// asynchronously yet, so the stream stays open with periodic keep-alive
// comments and self-terminates after ~50 s. Clients reconnect transparently.
//
// Auth is OPTIONAL on GET: Claude Code probes this endpoint as part of
// transport detection BEFORE auth is configured for some flows. We accept
// without Bearer; the stream simply carries no privileged events. POST
// remains strictly authenticated.

export async function GET(req: NextRequest) {
  const inboundSession = req.headers.get(SESSION_HEADER) ?? req.headers.get(SESSION_HEADER.toLowerCase());
  const sessionId = inboundSession || newSessionId();

  const headers = commonHeaders(req, sessionId);
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');
  headers.set('X-Accel-Buffering', 'no');

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Initial comment so proxies flush headers immediately.
      controller.enqueue(encoder.encode(': mcp stream open\n\n'));

      // Periodic heartbeat keeps middleboxes from closing the connection.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          // Stream already closed by the client — stop pinging.
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Self-close shortly before Vercel's maxDuration so we shut down
      // cleanly. Clients reconnect.
      const closeAfter = setTimeout(() => {
        try { controller.close(); } catch { /* already closed */ }
      }, 50_000);

      // Abort cleanly when the client disconnects.
      const onAbort = () => {
        clearInterval(heartbeat);
        clearTimeout(closeAfter);
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', onAbort);
    },
  });

  return new Response(stream, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// HTTP handler — OPTIONS (CORS preflight)
// ---------------------------------------------------------------------------

export async function OPTIONS(req: NextRequest) {
  const headers = commonHeaders(req, '');
  headers.delete(SESSION_HEADER);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    `Authorization, Content-Type, Accept, ${SESSION_HEADER}, mcp-session-id, mcp-protocol-version`,
  );
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}
