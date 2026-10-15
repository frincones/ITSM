// ---------------------------------------------------------------------------
// MCP Context
// ---------------------------------------------------------------------------
// The single object every tool handler receives. Encapsulates:
//   - tenant resolution (resolved from API key, NEVER trusted from input)
//   - the supabase client (service-role; queries MUST filter tenant_id)
//   - granted scopes (with helper to guard tool entry points)
//   - audit writer (one entry per tool call)
//   - request metadata (ip, ua, request id) for traceability
//
// This is the abstraction that makes the MCP a *platform*: tools never see
// HTTP, never see auth, never see transport. They receive a fully-resolved
// caller and a guarded supabase client. Same registry can be invoked over
// HTTP, stdio, or in-process by internal AI agents.
// ---------------------------------------------------------------------------

import 'server-only';

import type { TypedSupabaseClient } from '~/lib/domain/types';

import { forbidden } from './errors';
import { hasScope } from '~/lib/services/api-key.types';

// Mirrors the mcp_audit_log channel CHECK constraint. 'oauth' was added in
// migration 00066: a call authenticated by an OAuth token is neither an API
// key call nor an internal one, and auditing it as 'mcp' would lose the
// distinction between a machine credential and a human-granted one.
export type McpChannel = 'mcp' | 'rest' | 'internal' | 'oauth';

export interface McpCallerMeta {
  /** API key id when authenticated via key, null for internal callers. */
  apiKeyId: string | null;
  /**
   * The agent whose identity this call acts under: resolved from
   * api_keys.actor_agent_id for key callers, or the JWT subject for
   * session callers. Null only when a key has no usable actor.
   */
  agentId: string | null;
  /**
   * The acting agent's auth.users id. Needed by every table whose author
   * column is a NOT NULL FK to auth.users (ticket_followups.author_id,
   * ticket_tasks, ticket_solutions, kb_articles...).
   */
  userId: string | null;
  channel: McpChannel;
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface MCPContext {
  tenantId: string;
  scopes: string[];
  /**
   * Optional org-level scoping: when present, the caller's API key is
   * restricted to these organizations within the tenant. Tools that filter
   * by organization MUST AND-merge this list with caller-provided filters.
   */
  organizationIds: string[] | null;
  caller: McpCallerMeta;
  supabase: TypedSupabaseClient;

  /** Throws Forbidden if scope is not granted. */
  requireScope(scope: string): void;

  /** Returns an organization filter array AND-merged with caller-provided ids. */
  resolveOrgFilter(requestedIds?: string[] | null): string[] | null;

  /**
   * Returns the acting user's auth.users id, or throws Forbidden with an
   * actionable message when the key has no usable actor.
   *
   * Tools that write to a table with a NOT NULL author FK MUST call this
   * instead of reading `caller.userId` directly, so the failure is a clear
   * 403 ("this key has no acting agent") rather than a Postgres 23502
   * surfacing as an opaque -32603 internal error.
   */
  requireActorUserId(): string;
}

export interface MCPContextInit {
  tenantId: string;
  scopes: string[];
  organizationIds: string[] | null;
  caller: McpCallerMeta;
  supabase: TypedSupabaseClient;
}

/**
 * Builds a fully-functional MCPContext from resolved auth data.
 * Pure construction — no I/O, no side effects.
 */
export function buildContext(init: MCPContextInit): MCPContext {
  return {
    tenantId: init.tenantId,
    scopes: init.scopes,
    organizationIds: init.organizationIds,
    caller: init.caller,
    supabase: init.supabase,

    requireScope(scope: string) {
      if (!hasScope(init.scopes, scope)) {
        throw forbidden(`Scope '${scope}' required`);
      }
    },

    requireActorUserId() {
      const userId = init.caller.userId;
      if (!userId) {
        throw forbidden(
          'This API key has no acting agent, so it cannot perform writes that record an author. Assign an active agent to the key (api_keys.actor_agent_id) and retry.',
        );
      }
      return userId;
    },

    resolveOrgFilter(requestedIds?: string[] | null) {
      if (!init.organizationIds || init.organizationIds.length === 0) {
        // Key not org-scoped — caller's filter (if any) wins as-is.
        return requestedIds && requestedIds.length > 0 ? requestedIds : null;
      }
      if (!requestedIds || requestedIds.length === 0) {
        return init.organizationIds;
      }
      // Intersect: only orgs that are both in the key's allowlist AND requested.
      const allowed = new Set(init.organizationIds);
      const intersection = requestedIds.filter((id) => allowed.has(id));
      return intersection.length > 0 ? intersection : init.organizationIds;
    },
  };
}
