// ---------------------------------------------------------------------------
// Server Actions — API Keys CRUD (UI-facing)
// ---------------------------------------------------------------------------
// These actions back the /home/settings/api-keys page. They use the
// authenticated SSR client (RLS enforced) so platform admins can only
// see / mutate keys for their own tenant.
//
// `createApiKeyAction` is the one place where the plain key is returned
// to the caller. After response, the key never appears again.
// ---------------------------------------------------------------------------

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '~/lib/services/api-key.service';
import {
  ALL_SCOPES,
  type ApiKeyEnvironment,
  type ApiKeyRecord,
} from '~/lib/services/api-key.types';

const SETTINGS_PATH = '/home/settings/api-keys';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Auth + tenant resolution
// ---------------------------------------------------------------------------

async function resolveAdminTenant(): Promise<
  | { tenantId: string; agentId: string }
  | { error: string }
> {
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role, is_active')
    .eq('user_id', user.id)
    .single();

  if (!agent) return { error: 'Agent not found' };
  const a = agent as unknown as {
    id: string;
    tenant_id: string;
    role: string;
    is_active: boolean;
  };
  if (!a.is_active) return { error: 'Agent is inactive' };
  if (a.role !== 'admin' && a.role !== 'supervisor') {
    return { error: 'Only admins and supervisors can manage API keys' };
  }
  return { tenantId: a.tenant_id, agentId: a.id };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listApiKeysAction(): Promise<
  ActionResult<ApiKeyRecord[]>
> {
  const auth = await resolveAdminTenant();
  if ('error' in auth) return { ok: false, error: auth.error };
  const client = getSupabaseServerClient();
  const { data, error } = await listApiKeys(client, auth.tenantId);
  if (error || !data) return { ok: false, error: error ?? 'Failed to load API keys' };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  environment: z.enum(['live', 'test']).default('live'),
  scopes: z.array(z.string().min(1)).min(1, 'Select at least one scope'),
  rate_limit_rpm: z.number().int().min(0).max(10_000).default(60),
  organization_ids: z.array(z.string().uuid()).optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

export async function createApiKeyAction(
  rawInput: unknown,
): Promise<ActionResult<{ record: ApiKeyRecord; plainKey: string }>> {
  const auth = await resolveAdminTenant();
  if ('error' in auth) return { ok: false, error: auth.error };

  const parsed = createSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  // Validate every scope against the catalog (allow wildcards too).
  const allowedSet = new Set<string>([
    ...ALL_SCOPES,
    'admin:*',
    '*',
    '*:read',
    '*:write',
  ]);
  // Also allow per-resource wildcards like `tickets:*`.
  for (const s of parsed.data.scopes) {
    if (allowedSet.has(s)) continue;
    if (/^[a-z_]+:\*$/.test(s)) continue;
    return { ok: false, error: `Unknown scope: ${s}` };
  }

  const client = getSupabaseServerClient();
  const result = await createApiKey(client, {
    tenantId: auth.tenantId,
    name: parsed.data.name,
    description: parsed.data.description,
    environment: parsed.data.environment as ApiKeyEnvironment,
    scopes: parsed.data.scopes,
    rateLimitRpm: parsed.data.rate_limit_rpm,
    organizationIds: parsed.data.organization_ids,
    expiresAt: parsed.data.expires_at ? new Date(parsed.data.expires_at) : null,
    createdBy: auth.agentId,
  });
  if (result.error || !result.data) {
    return { ok: false, error: result.error ?? 'Failed to create API key' };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

export async function revokeApiKeyAction(
  keyId: string,
): Promise<ActionResult<true>> {
  const auth = await resolveAdminTenant();
  if ('error' in auth) return { ok: false, error: auth.error };

  if (!z.string().uuid().safeParse(keyId).success) {
    return { ok: false, error: 'Invalid keyId' };
  }

  const client = getSupabaseServerClient();
  const result = await revokeApiKey(client, auth.tenantId, keyId, auth.agentId);
  if (result.error) return { ok: false, error: result.error };

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: true };
}
