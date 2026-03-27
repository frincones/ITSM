import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { redirect } from 'next/navigation';

import { OrganizationsClient } from './_components/organizations-client';

export const metadata = {
  title: 'Organizations',
};

export default async function OrganizationsPage() {
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

  // Fetch organizations
  const { data: organizations } = await client
    .from('organizations')
    .select('*')
    .eq('tenant_id', agent.tenant_id)
    .order('name');

  // For each organization, fetch user count and ticket count
  const orgsWithCounts = await Promise.all(
    (organizations ?? []).map(async (org) => {
      const [{ count: userCount }, { count: ticketCount }] = await Promise.all([
        client
          .from('organization_users')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id),
        client
          .from('tickets')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id),
      ]);

      return {
        ...org,
        user_count: userCount ?? 0,
        ticket_count: ticketCount ?? 0,
      };
    }),
  );

  // Fetch SLA policies for display
  const { data: slaConfigs } = await client
    .from('sla_policies')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  return (
    <OrganizationsClient
      organizations={orgsWithCounts}
      slaConfigs={slaConfigs ?? []}
      tenantId={agent.tenant_id}
    />
  );
}
