// ---------------------------------------------------------------------------
// MCP → domain bridge
// ---------------------------------------------------------------------------
// Adapts an MCPContext into a DomainContext and translates typed domain
// failures into JSON-RPC errors, so tool handlers stay one-liners:
//
//   const result = await createTicket(toDomainContext(ctx), fields);
//   return { ticket: unwrap(result) };
//
// Keeping the mapping here means a tool never invents its own error codes and
// the domain layer never learns about JSON-RPC.
// ---------------------------------------------------------------------------

import 'server-only';

import type { DomainContext, DomainErrorCode, DomainResult } from '~/lib/domain/types';

import type { MCPContext } from './context';
import {
  McpError,
  JsonRpcErrorCode,
  forbidden,
  invalidParams,
  notFound,
  unauthorized,
  validationError,
} from './errors';

/**
 * Builds a DomainContext from an MCPContext.
 *
 * `role` is reported as 'agent' rather than copied from the acting agent's
 * record on purpose: an API key's permissions are its scopes, which the
 * registry already enforced before the handler ran. Inheriting a 'readonly'
 * role from the actor agent would silently re-deny writes the key was
 * explicitly granted.
 */
export function toDomainContext(ctx: MCPContext): DomainContext {
  return {
    actor: {
      tenantId: ctx.tenantId,
      agentId: ctx.caller.agentId,
      userId: ctx.caller.userId,
      role: 'agent',
      email: null,
      organizationIds: ctx.organizationIds,
      channel: ctx.caller.channel === 'rest' ? 'rest' : ctx.caller.channel,
    },
    client: ctx.supabase,
  };
}

/** Maps a transport-agnostic domain code onto its JSON-RPC equivalent. */
function toMcpError(message: string, code?: DomainErrorCode): McpError {
  switch (code) {
    case 'unauthorized':
      return unauthorized(message);
    case 'forbidden':
      return forbidden(message);
    case 'not_found':
      return new McpError(JsonRpcErrorCode.NotFound, message, 404);
    case 'invalid_input':
      return invalidParams(message);
    case 'invalid_transition':
    case 'conflict':
      // A rejected transition is a semantic conflict, not a malformed call:
      // the arguments were well-formed, the current state disallows them.
      return new McpError(JsonRpcErrorCode.Conflict, message, 409);
    default:
      return new McpError(JsonRpcErrorCode.InternalError, message, 500);
  }
}

/**
 * Returns the domain result's data, or throws the matching McpError.
 * The route handler already converts McpError into a JSON-RPC failure and
 * records it in mcp_audit_log, so nothing else is needed at the call site.
 */
export function unwrap<T>(result: DomainResult<T>): T {
  if (result.error !== null) {
    throw toMcpError(result.error, result.code);
  }
  return result.data;
}

/** Re-exported for tools that need to signal validation failures directly. */
export { notFound, validationError };
