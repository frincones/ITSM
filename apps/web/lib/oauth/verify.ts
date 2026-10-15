// ---------------------------------------------------------------------------
// Unified credential verification for the MCP server
// ---------------------------------------------------------------------------
// The MCP route accepts two credential types on the same header, and the
// rest of the request path should not care which one arrived. This resolves
// either into one shape.
//
// Which path to try is decided by the token prefix, not by attempting both:
// `nvd_` is an API key, `nvat_` an OAuth access token. Trying both would
// double the database round trips on every call and blur the audit trail.
//
// The OAuth path carries one extra check the API key path has no equivalent
// for: RFC 8707 audience binding. A token minted for another MCP server is
// refused here even if it is otherwise valid, which is what stops a token
// obtained by a malicious server from being replayed against this one.
// ---------------------------------------------------------------------------

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { verifyApiKey } from '~/lib/services/api-key.service';

import { hashToken } from './oauth.service';
import { asOAuthClient } from './oauth.types';

export interface VerifiedCredential {
  /** 'mcp' for an API key, 'oauth' for a bearer token. Used in the audit. */
  channel: 'mcp' | 'oauth';
  tenantId: string;
  scopes: string[];
  organizationIds: string[] | null;
  /** The acting agent. Writes are attributed to it. */
  agentId: string | null;
  /** The acting agent's auth.users id, for NOT NULL author columns. */
  userId: string | null;
  /** Present only for API keys; OAuth tokens are not rate limited per key. */
  apiKeyId: string | null;
  rateLimitRpm: number | null;
  /** Human-readable credential name, for error messages and the audit. */
  label: string;
}

/** OAuth access tokens are minted with this prefix (see oauth.service.ts). */
const OAUTH_PREFIX = 'nvat_';

/**
 * Resolves a Bearer token to a tenant, an acting identity and a scope set.
 *
 * `resource` is the canonical identifier of THIS server. It is only
 * consulted for OAuth tokens, where the audience must match.
 */
export async function verifyCredential(
  supabase: SupabaseClient,
  bearer: string,
  resource: string,
  ip: string | null,
): Promise<VerifiedCredential | null> {
  if (bearer.startsWith(OAUTH_PREFIX)) {
    return verifyOAuthAccessToken(supabase, bearer, resource);
  }

  const key = await verifyApiKey(supabase, bearer, ip);
  if (!key) return null;

  return {
    channel: 'mcp',
    tenantId: key.tenant_id,
    scopes: key.scopes,
    organizationIds: key.organization_ids,
    agentId: key.actor_agent_id,
    userId: key.actor_user_id,
    apiKeyId: key.id,
    rateLimitRpm: key.rate_limit_rpm,
    label: `api_key:${key.id}`,
  };
}

async function verifyOAuthAccessToken(
  supabase: SupabaseClient,
  token: string,
  resource: string,
): Promise<VerifiedCredential | null> {
  // The audience check lives inside the function so it cannot be skipped by
  // a caller that forgets to compare.
  const { data, error } = await asOAuthClient(supabase).rpc('verify_oauth_token', {
    p_token_hash: hashToken(token),
    p_resource: resource,
  });

  if (error) return null;

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        token_id: string;
        client_id: string;
        tenant_id: string;
        user_id: string;
        agent_id: string;
        scopes: string[];
        organization_ids: string[] | null;
        client_name: string;
      }
    | undefined;

  if (!row) return null;

  return {
    channel: 'oauth',
    tenantId: row.tenant_id,
    scopes: row.scopes,
    organizationIds: row.organization_ids,
    // Unlike an API key, an OAuth token always has a real person behind it:
    // the consent screen refuses to issue a code without one.
    agentId: row.agent_id,
    userId: row.user_id,
    apiKeyId: null,
    // OAuth grants have no per-key RPM column. They inherit the default
    // applied below rather than going unlimited.
    rateLimitRpm: null,
    label: `oauth:${row.client_name}`,
  };
}
