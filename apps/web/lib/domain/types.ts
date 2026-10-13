// ---------------------------------------------------------------------------
// Domain layer — shared types
// ---------------------------------------------------------------------------
// The domain layer holds the business logic that must behave identically no
// matter who triggers it: a human in the UI, an external agent over MCP, an
// internal AI subagent, or a cron job.
//
// The problem it solves
// --------------------
// Server Actions resolve the tenant from `auth.uid()`. An API-key caller has
// no session, so the MCP tools could not reuse them and re-implemented a
// minimal INSERT instead (see the header comment in lib/mcp/tools/tickets.ts).
// The result was measurable: a ticket created over MCP came back unassigned,
// unclassified, with no SLA stamp and no followers, while the tool's own
// description claimed otherwise.
//
// The fix is not to relax the actions but to invert the dependency: the
// business logic takes an explicit `DomainActor` and a Supabase client, and
// each entry point (action / MCP / internal) supplies its own. Identity is an
// input, never something the logic reaches out for.
// ---------------------------------------------------------------------------

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/** Where a domain call came from. Mirrors McpChannel plus 'ui' and 'cron'. */
export type DomainChannel = 'ui' | 'mcp' | 'rest' | 'internal' | 'cron';

/**
 * The resolved identity performing an operation.
 *
 * Both ids matter and they are not interchangeable:
 *   - `agentId` is `agents.id`  — used by ticket_followers, assignment, RBAC.
 *   - `userId`  is `auth.users.id` (i.e. `agents.user_id`) — required by every
 *     author column, which are NOT NULL FKs to auth.users
 *     (ticket_followups.author_id, ticket_tasks, ticket_solutions, kb_articles).
 *
 * Confusing the two is exactly how `tickets_add_comment` shipped broken.
 */
export interface DomainActor {
  tenantId: string;
  /** agents.id of the acting agent, or null for an unattributed caller. */
  agentId: string | null;
  /** auth.users.id of the acting agent, or null when it cannot be resolved. */
  userId: string | null;
  /** Agent role, when known. Drives the client-vs-staff restrictions. */
  role: string | null;
  /** Agent email, used as the notification sender identity. */
  email: string | null;
  /**
   * Organizations this actor is confined to, or null for unrestricted.
   * For MCP this is the API key's allowlist; for a portal user, their own org.
   */
  organizationIds: string[] | null;
  channel: DomainChannel;
}

/** Everything a domain function needs: who is acting, and on what. */
export interface DomainContext {
  actor: DomainActor;
  client: SupabaseClient;
}

/** Uniform result shape. Mirrors the ActionResult used by Server Actions. */
export type DomainResult<T> =
  | { data: T; error: null }
  | { data: null; error: string; code?: DomainErrorCode };

/**
 * Stable, transport-agnostic failure codes. The MCP layer maps these to
 * JSON-RPC codes and the UI layer to messages, so neither has to parse
 * error strings.
 */
export type DomainErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_transition'
  | 'conflict'
  | 'internal';

export function ok<T>(data: T): DomainResult<T> {
  return { data, error: null };
}

export function fail<T = never>(
  error: string,
  code: DomainErrorCode = 'internal',
): DomainResult<T> {
  return { data: null, error, code };
}

/** True when the actor is a client/portal user rather than staff. */
export function isClientActor(actor: DomainActor): boolean {
  return actor.role === 'readonly';
}

/**
 * Narrows a requested organization set to what the actor may touch.
 * Returns null when the actor is unrestricted and asked for nothing.
 *
 * Mirrors MCPContext.resolveOrgFilter so both layers scope identically.
 */
export function resolveOrgScope(
  actor: DomainActor,
  requested?: string[] | null,
): string[] | null {
  const allowed = actor.organizationIds;
  if (!allowed || allowed.length === 0) {
    return requested && requested.length > 0 ? requested : null;
  }
  if (!requested || requested.length === 0) return allowed;
  const set = new Set(allowed);
  const intersection = requested.filter((id) => set.has(id));
  return intersection.length > 0 ? intersection : allowed;
}

/** Throws nothing: returns the actor's auth user id or a typed failure. */
export function requireUserId(
  actor: DomainActor,
): { userId: string; error: null } | { userId: null; error: string } {
  if (!actor.userId) {
    return {
      userId: null,
      error:
        'This caller has no acting user identity, so it cannot perform writes that record an author. Assign an active agent to the API key (api_keys.actor_agent_id) and retry.',
    };
  }
  return { userId: actor.userId, error: null };
}
