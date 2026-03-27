import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { SettingsClient } from './_components/settings-client';

interface SettingsPageProps {
  searchParams: Promise<{
    section?: string;
  }>;
}

export const metadata = {
  title: 'Settings & Administration',
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const client = getSupabaseServerClient();
  const activeSection = params.section ?? 'general';

  // Fetch tenant settings for General tab
  const {
    data: { user },
  } = await client.auth.getUser();

  let tenantSettings = null;

  if (user) {
    const { data: agent } = await client
      .from('agents')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (agent) {
      const { data: tenant } = await client
        .from('tenants')
        .select('id, name, slug, settings')
        .eq('id', agent.tenant_id)
        .single();

      tenantSettings = tenant;
    }
  }

  // Fetch agents for Users & Agents section
  const { data: agents } = await client
    .from('agents')
    .select('id, name, email, role, is_active, avatar_url')
    .order('name', { ascending: true });

  // Fetch groups for Groups & Teams section
  const { data: groups } = await client
    .from('groups')
    .select('id, name, description, email')
    .order('name', { ascending: true });

  // Fetch categories
  const { data: categories } = await client
    .from('categories')
    .select('id, name, parent_id, description')
    .order('name', { ascending: true });

  // Fetch SLA configs
  const { data: slaConfigs } = await client
    .from('slas')
    .select('id, name, description, target_critical, target_high, target_medium, target_low, is_active')
    .order('name', { ascending: true });

  // Fetch profiles/roles
  const { data: profiles } = await client
    .from('profiles')
    .select('id, name, description, is_system')
    .order('name', { ascending: true });

  return (
    <SettingsClient
      activeSection={activeSection}
      tenantSettings={tenantSettings}
      agents={agents ?? []}
      groups={groups ?? []}
      categories={categories ?? []}
      slaConfigs={slaConfigs ?? []}
      profiles={profiles ?? []}
    />
  );
}
