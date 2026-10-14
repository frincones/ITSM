// ---------------------------------------------------------------------------
// API Key — Shared Types & Constants (client-safe)
// ---------------------------------------------------------------------------
// Pure types and pure-JS helpers. Safe to import from Client Components.
// The runtime service (hashing, DB ops) lives in api-key.service.ts and is
// `server-only` — it must NEVER be imported from a Client Component.
// ---------------------------------------------------------------------------

export type ApiKeyEnvironment = 'live' | 'test';

export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  environment: ApiKeyEnvironment;
  key_prefix: string;
  scopes: string[];
  rate_limit_rpm: number;
  organization_ids: string[] | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  usage_count: number;
  created_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerifiedApiKey {
  id: string;
  tenant_id: string;
  scopes: string[];
  rate_limit_rpm: number;
  organization_ids: string[] | null;
  environment: ApiKeyEnvironment;
  /**
   * The agent this key acts as (api_keys.actor_agent_id). Writes are
   * attributed to this agent so API-driven actions are auditable like UI
   * actions. Null when the key predates actor attribution or its agent was
   * deactivated — reads still work, writes to author-bearing tables fail.
   */
  actor_agent_id: string | null;
  /**
   * The acting agent's auth.users id (agents.user_id). Required by every
   * table whose author column is a NOT NULL FK to auth.users, such as
   * ticket_followups.author_id.
   */
  actor_user_id: string | null;
}

export interface CreateApiKeyInput {
  tenantId: string;
  name: string;
  description?: string;
  environment?: ApiKeyEnvironment;
  scopes: string[];
  rateLimitRpm?: number;
  organizationIds?: string[];
  expiresAt?: Date | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreatedApiKey {
  record: ApiKeyRecord;
  /** Plain key — return to user once, never persisted in plaintext. */
  plainKey: string;
}

/** Catalog of all scopes the MCP server understands. UI uses this for pickers. */
export const ALL_SCOPES = [
  'tickets:read',
  'tickets:write',
  'tickets:comment',
  'tickets:assign',
  'tickets:delete',
  'organizations:read',
  'organizations:write',
  'contacts:read',
  'contacts:write',
  'agents:read',
  'kb:read',
  'kb:search',
  'kb:write',
  'problems:read',
  'problems:write',
  'changes:read',
  'changes:write',
  'assets:read',
  'assets:write',
  'slas:read',
  'metrics:read',
  'audit:read',
  'webhooks:manage',
  'inbox:read',
  'inbox:write',
  // Separate from inbox:write on purpose: a reply with internal=false is
  // DELIVERED to the customer over WhatsApp or email. A key can be allowed
  // to triage and assign conversations without being able to speak to them.
  'inbox:reply',
  'automation:read',
  'automation:write',
  // Separate from automation:write on purpose: enabling a workflow or rule
  // changes what happens to live tickets from the next event onward. A key
  // can draft and edit automation without being able to switch it on.
  'automation:activate',
  // Separate from kb:write: publishing an article with is_public makes it
  // visible to customers in the portal.
  'kb:publish',
  // Separate from organizations:write: deactivating a client takes its
  // portal offline for every one of its users immediately.
  'organizations:deactivate',
  // Separate from changes:write: approving a change is a governance
  // decision that records who authorised the work.
  'changes:approve',
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

/**
 * Pure-JS scope check (no Node APIs). Lives here so server tools and the
 * registry can import without dragging the `server-only` boundary.
 *
 * Wildcards supported on either side of the colon: `tickets:*`, `*:read`, `*`.
 */
export function hasScope(grantedScopes: string[], required: string): boolean {
  if (grantedScopes.includes('*') || grantedScopes.includes('admin:*')) {
    return true;
  }

  if (grantedScopes.includes(required)) return true;

  const [resource, action] = required.split(':');
  if (!resource || !action) return false;

  return (
    grantedScopes.includes(`${resource}:*`) ||
    grantedScopes.includes(`*:${action}`)
  );
}
