// ---------------------------------------------------------------------------
// API Key Service — Business Logic
// ---------------------------------------------------------------------------
// Hashes, verifies, and manages API keys used by the MCP server and the
// public REST API. Pure business logic — no 'use server'. Used by:
//   - MCP HTTP handler (apps/web/app/api/mcp/route.ts)
//   - Settings UI for API keys (apps/web/app/home/settings/api-keys/*)
//   - Future REST endpoints under /api/v1/*
//
// Storage model (migration 00039):
//   - key_hash:   SHA-256 hex of the full plain key (deterministic, indexed)
//   - key_prefix: first ~12 chars, shown in UI for identification
//   - The plain key is returned to the caller exactly ONCE at creation.
// ---------------------------------------------------------------------------

import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

// Re-export shared types and constants from the client-safe module so existing
// server callers (`import { ... } from '~/lib/services/api-key.service'`)
// keep working without changes.
export {
  ALL_SCOPES,
  hasScope,
  type ApiKeyEnvironment,
  type ApiKeyRecord,
  type CreateApiKeyInput,
  type CreatedApiKey,
  type Scope,
  type VerifiedApiKey,
} from './api-key.types';

import type {
  ApiKeyEnvironment,
  ApiKeyRecord,
  CreateApiKeyInput,
  CreatedApiKey,
  VerifiedApiKey,
} from './api-key.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** SHA-256 hex digest. Deterministic — same input always yields same hash. */
export function hashApiKey(plainKey: string): string {
  return createHash('sha256').update(plainKey, 'utf8').digest('hex');
}

/**
 * Generates a fresh random API key in the format `nvd_{env}_{32 chars}`.
 * Uses URL-safe base64 (no `/`, `+`, `=`) for clean header transport.
 */
export function generatePlainKey(env: ApiKeyEnvironment = 'live'): string {
  const random = randomBytes(24)
    .toString('base64')
    .replace(/\+/g, 'A')
    .replace(/\//g, 'B')
    .replace(/=+$/, '')
    .slice(0, 32);
  return `nvd_${env}_${random}`;
}

/** First 12 visible chars (e.g. `nvd_live_abc`) for UI display. */
export function derivePrefix(plainKey: string): string {
  return plainKey.slice(0, 12);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new API key. Returns the plain key ONCE — caller must surface it
 * to the user immediately and discard. Subsequent reads only see the hash.
 *
 * `client` MUST be a service-role or authenticated tenant-scoped client.
 */
export async function createApiKey(
  client: SupabaseClient,
  input: CreateApiKeyInput,
): Promise<ServiceResult<CreatedApiKey>> {
  const env = input.environment ?? 'live';
  const plainKey = generatePlainKey(env);
  const keyHash = hashApiKey(plainKey);
  const keyPrefix = derivePrefix(plainKey);

  const { data, error } = await client
    .from('api_keys')
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      environment: env,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: input.scopes,
      rate_limit_rpm: input.rateLimitRpm ?? 60,
      organization_ids: input.organizationIds ?? null,
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
      created_by: input.createdBy ?? null,
      metadata: input.metadata ?? {},
    })
    .select(
      'id, tenant_id, name, description, environment, key_prefix, scopes, rate_limit_rpm, organization_ids, metadata, is_active, expires_at, last_used_at, last_used_ip, usage_count, created_by, revoked_at, revoked_by, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? 'Failed to create API key' };
  }

  return {
    data: { record: data as ApiKeyRecord, plainKey },
    error: null,
  };
}

/**
 * Verifies a plain API key against the database via the SECURITY DEFINER
 * function `verify_api_key`. Returns the decoded context (tenant, scopes,
 * limits) or null if invalid / inactive / expired.
 *
 * The function side-effects last_used_at and usage_count for valid keys.
 */
export async function verifyApiKey(
  client: SupabaseClient,
  plainKey: string,
  ip?: string | null,
): Promise<VerifiedApiKey | null> {
  const keyHash = hashApiKey(plainKey);

  const { data, error } = await client.rpc('verify_api_key', {
    p_key_hash: keyHash,
    p_ip: ip ?? null,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    scopes: row.scopes ?? [],
    rate_limit_rpm: row.rate_limit_rpm ?? 60,
    organization_ids: row.organization_ids ?? null,
    environment: row.environment,
  };
}

/**
 * Atomically increments the per-key rate counter for the current minute
 * and returns whether the call should be allowed.
 *
 * `rate_limit_rpm = 0` means unlimited.
 */
export async function checkRateLimit(
  client: SupabaseClient,
  apiKeyId: string,
  rateLimitRpm: number,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  if (rateLimitRpm <= 0) {
    return { allowed: true, current: 0, limit: 0 };
  }

  const { data, error } = await client.rpc('increment_rate_bucket', {
    p_api_key_id: apiKeyId,
    p_window_seconds: 60,
  });

  if (error) {
    // Fail open on rate-limiter errors — observability matters more than
    // strict enforcement when the limiter itself is broken. Surfaced via
    // mcp_audit_log so the operator can spot it.
    return { allowed: true, current: 0, limit: rateLimitRpm };
  }

  const current = typeof data === 'number' ? data : 0;
  return { allowed: current <= rateLimitRpm, current, limit: rateLimitRpm };
}

/** Lists keys for a tenant. Plain keys are NEVER returned. */
export async function listApiKeys(
  client: SupabaseClient,
  tenantId: string,
): Promise<ServiceResult<ApiKeyRecord[]>> {
  const { data, error } = await client
    .from('api_keys')
    .select(
      'id, tenant_id, name, description, environment, key_prefix, scopes, rate_limit_rpm, organization_ids, metadata, is_active, expires_at, last_used_at, last_used_ip, usage_count, created_by, revoked_at, revoked_by, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as ApiKeyRecord[], error: null };
}

/** Revokes a key (soft: keeps the row for audit). */
export async function revokeApiKey(
  client: SupabaseClient,
  tenantId: string,
  keyId: string,
  revokedBy: string | null,
): Promise<ServiceResult<true>> {
  const { error } = await client
    .from('api_keys')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy,
    })
    .eq('id', keyId)
    .eq('tenant_id', tenantId);

  if (error) return { data: null, error: error.message };
  return { data: true, error: null };
}

// Scope helpers and ALL_SCOPES are re-exported from ./api-key.types
// at the top of this file (client-safe module).
