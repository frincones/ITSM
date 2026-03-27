import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { redirect } from 'next/navigation';

import { UsersPermissionsClient } from './_components/users-permissions-client';

export const metadata = {
  title: 'Users & Permissions',
};

export default async function UsersPermissionsPage() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: agent } = await client
    .from('agents')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    redirect('/home');
  }

  // Fetch TDX agents with profile name
  const { data: agents } = await client
    .from('agents')
    .select('id, name, email, role, is_active, profile_id, profiles(name)')
    .eq('tenant_id', agent.tenant_id)
    .order('name');

  // Fetch organization users with org name and profile name
  const { data: orgUsers } = await client
    .from('organization_users')
    .select('id, name, email, role, is_active, organization_id, profile_id, organizations(name), profiles(name)')
    .eq('tenant_id', agent.tenant_id)
    .order('name');

  // Combine into unified list
  const unifiedUsers = [
    ...(agents ?? []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      name: a.name as string,
      email: a.email as string,
      role: a.role as string,
      is_active: a.is_active as boolean,
      profile_id: a.profile_id as string | null,
      profile_name: (a.profiles as Record<string, unknown> | null)?.name as string | null ?? null,
      organization_id: null as string | null,
      organization_name: null as string | null,
      type: 'tdx_agent' as const,
    })),
    ...(orgUsers ?? []).map((u: Record<string, unknown>) => ({
      id: u.id as string,
      name: u.name as string,
      email: u.email as string,
      role: u.role as string,
      is_active: u.is_active as boolean,
      profile_id: u.profile_id as string | null,
      profile_name: (u.profiles as Record<string, unknown> | null)?.name as string | null ?? null,
      organization_id: u.organization_id as string | null,
      organization_name: (u.organizations as Record<string, unknown> | null)?.name as string | null ?? null,
      type: 'org_user' as const,
    })),
  ];

  // Fetch all organizations for dropdown
  const { data: organizations } = await client
    .from('organizations')
    .select('id, name')
    .eq('tenant_id', agent.tenant_id)
    .eq('is_active', true)
    .order('name');

  // Fetch all profiles for dropdown
  const { data: profiles } = await client
    .from('profiles')
    .select('id, name, description, is_system')
    .order('name');

  // Fetch profile permissions for all profiles
  const { data: profilePermissions } = await client
    .from('profile_permissions')
    .select('id, profile_id, resource, actions, scope');

  return (
    <UsersPermissionsClient
      users={unifiedUsers}
      organizations={organizations ?? []}
      profiles={profiles ?? []}
      profilePermissions={profilePermissions ?? []}
    />
  );
}
