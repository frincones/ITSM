import { createClient } from '@supabase/supabase-js';

/**
 * Resolves an organization by its portal_token using service_role key.
 * This bypasses RLS since portal URLs are accessed without auth.
 */
export async function resolveOrgByPortalToken(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client
    .from('organizations')
    .select('id, name, slug, logo_url, brand_colors, ai_context, portal_token, tenant_id')
    .eq('portal_token', token)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  return data as {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    brand_colors: { primary?: string; accent?: string } | null;
    ai_context: string | null;
    portal_token: string;
    tenant_id: string;
  };
}
