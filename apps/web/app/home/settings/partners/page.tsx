import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { redirect } from 'next/navigation';

import { PartnersClient } from './_components/partners-client';

export const metadata = {
  title: 'Partners & Vendors',
};

export default async function PartnersPage() {
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

  // Fetch partners
  const { data: partners } = await client
    .from('partners')
    .select('*')
    .eq('tenant_id', agent.tenant_id)
    .order('name');

  // Fetch SLA policies for association
  const { data: slaConfigs } = await client
    .from('sla_policies')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  // Fetch agents for partner agent assignment
  const { data: agents } = await client
    .from('agents')
    .select('id, name, email')
    .eq('status', 'active')
    .order('name');

  return (
    <PartnersClient
      partners={partners ?? []}
      slaConfigs={slaConfigs ?? []}
      agents={agents ?? []}
      tenantId={agent.tenant_id}
    />
  );
}
