import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan: string;
  subscription_status: string;
  logo_url: string | null;
  brand_colors: Record<string, string> | null;
  settings: Record<string, unknown> | null;
  features_enabled: string[];
  max_agents: number;
  max_ai_queries: number;
  ai_queries_used: number;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// getCurrentTenant
// ---------------------------------------------------------------------------

/**
 * Resolves the tenant that the currently authenticated user belongs to.
 *
 * Flow:
 *   1. Get `auth.uid()` from the Supabase client.
 *   2. Look up the `agents` row for that user (falls back to `partner_agents`).
 *   3. Fetch the full tenant record using the resolved `tenant_id`.
 *
 * Returns `null` when the user is unauthenticated or has no tenant.
 */
export async function getCurrentTenant(
  client: SupabaseClient,
): Promise<Tenant | null> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) return null;

  // Try agents first
  const { data: agent } = await client
    .from('agents')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  let tenantId: string | null = agent?.tenant_id ?? null;

  // Fallback: partner_agents
  if (!tenantId) {
    const { data: partnerAgent } = await client
      .from('partner_agents')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    tenantId = partnerAgent?.tenant_id ?? null;
  }

  if (!tenantId) return null;

  const { data: tenant, error: tenantError } = await client
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (tenantError || !tenant) return null;

  return tenant as unknown as Tenant;
}

// ---------------------------------------------------------------------------
// getTenantBySlug
// ---------------------------------------------------------------------------

/**
 * Resolves a tenant by its URL slug (used for subdomain-based resolution).
 *
 * Example: `acme.novadesk.com` -> slug = `'acme'`
 *
 * This function uses the **service-role** or an unauthenticated client because
 * it runs before the user is authenticated (e.g. in middleware / login page).
 * The caller is responsible for passing a client with appropriate privileges.
 */
export async function getTenantBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<Tenant | null> {
  if (!slug || slug.trim().length === 0) return null;

  const normalizedSlug = slug.trim().toLowerCase();

  const { data: tenant, error } = await client
    .from('tenants')
    .select('*')
    .eq('slug', normalizedSlug)
    .single();

  if (error || !tenant) return null;

  return tenant as unknown as Tenant;
}
