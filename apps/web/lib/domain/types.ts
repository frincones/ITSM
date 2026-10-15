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

import type { Database } from '@kit/supabase/database';

/**
 * A Supabase client that knows the schema.
 *
 * Bare `SupabaseClient` resolves to `SupabaseClient<any>`, which silently
 * accepts any table and any column — that is how six invented-column bugs
 * compiled cleanly and then failed on first use in production. Binding the
 * Database generic makes `.insert({ columnThatDoesNotExist: 1 })` a compile
 * error instead of a runtime 400.
 */
export type TypedSupabaseClient = SupabaseClient<Database>;

/** The shape a jsonb column accepts. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Narrows a plain object to the Json type a jsonb column expects.
 *
 * `Record<string, unknown>` is the natural shape to build a patch in, but
 * `unknown` is wider than Json, so it is rejected on write. The values here
 * come from a column that was already jsonb and from literals we control,
 * so the assertion restates what is true rather than hiding a risk — and
 * keeping it in one named place means the next person sees the reasoning
 * instead of an unexplained cast at the call site.
 */
export function asJson(value: Record<string, unknown>): Json {
  return value as Json;
}

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
  client: TypedSupabaseClient;
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
): { ok: true; userId: string; error: null } | { ok: false; userId: null; error: string } {
  if (!actor.userId) {
    return {
      ok: false,
      userId: null,
      error:
        'This caller has no acting user identity, so it cannot perform writes that record an author. Assign an active agent to the API key (api_keys.actor_agent_id) and retry.',
    };
  }
  return { ok: true, userId: actor.userId, error: null };
}
