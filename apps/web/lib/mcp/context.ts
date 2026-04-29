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

import type { SupabaseClient } from '@supabase/supabase-js';

import { forbidden } from './errors';
import { hasScope } from '~/lib/services/api-key.types';

export type McpChannel = 'mcp' | 'rest' | 'internal';

export interface McpCallerMeta {
  /** API key id when authenticated via key, null for internal callers. */
  apiKeyId: string | null;
  /** Agent id when authenticated via JWT, null for API-key callers. */
  agentId: string | null;
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
  supabase: SupabaseClient;

  /** Throws Forbidden if scope is not granted. */
  requireScope(scope: string): void;

  /** Returns an organization filter array AND-merged with caller-provided ids. */
  resolveOrgFilter(requestedIds?: string[] | null): string[] | null;
}

export interface MCPContextInit {
  tenantId: string;
  scopes: string[];
  organizationIds: string[] | null;
  caller: McpCallerMeta;
  supabase: SupabaseClient;
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
