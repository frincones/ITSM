import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { redirect, notFound } from 'next/navigation';

import { OrgDetailClient } from './_components/org-detail-client';

export const metadata = {
  title: 'Organization Details',
};

interface OrgDetailPageProps {
  params: { id: string };
}

export default async function OrgDetailPage({ params }: OrgDetailPageProps) {
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

  // Fetch organization
  const { data: organization } = await client
    .from('organizations')
    .select('*')
    .eq('id', params.id)
    .eq('tenant_id', agent.tenant_id)
    .single();

  if (!organization) {
    notFound();
  }

  // Fetch organization users
  const { data: orgUsers } = await client
    .from('organization_users')
    .select('*')
    .eq('organization_id', organization.id)
    .order('name');

  // Fetch assigned agents (via agent_organizations pivot)
  const { data: agentOrgs } = await client
    .from('agent_organizations')
    .select('id, access_level, agent_id, created_at')
    .eq('organization_id', organization.id);

  // Fetch agent details for assigned agents
  const agentIds = (agentOrgs ?? []).map((ao) => ao.agent_id);
  let assignedAgents: Array<{
    pivot_id: string;
    agent_id: string;
    name: string;
    email: string;
    access_level: string;
  }> = [];

  if (agentIds.length > 0) {
    const { data: agentsData } = await client
      .from('agents')
      .select('id, name, email')
      .in('id', agentIds);

    assignedAgents = (agentOrgs ?? []).map((ao) => {
      const agentInfo = (agentsData ?? []).find((a) => a.id === ao.agent_id);
      return {
        pivot_id: ao.id,
        agent_id: ao.agent_id,
        name: agentInfo?.name ?? 'Unknown',
        email: agentInfo?.email ?? '',
        access_level: ao.access_level,
      };
    });
  }

  // Fetch all agents for assignment dropdown
  const { data: allAgents } = await client
    .from('agents')
    .select('id, name, email')
    .eq('status', 'active')
    .order('name');

  // Fetch SLA policies
  const { data: slaConfigs } = await client
    .from('sla_policies')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  return (
    <OrgDetailClient
      organization={organization}
      orgUsers={orgUsers ?? []}
      assignedAgents={assignedAgents}
      allAgents={allAgents ?? []}
      slaConfigs={slaConfigs ?? []}
      tenantId={agent.tenant_id}
    />
  );
}
