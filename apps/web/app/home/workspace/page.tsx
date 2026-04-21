import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { withI18n } from '~/lib/i18n/with-i18n';

import { WorkspaceClient } from './_components/workspace-client';

export const metadata = {
  title: 'Workspace',
};

const TICKET_SELECT = `
  id,
  ticket_number,
  title,
  status,
  type,
  urgency,
  priority,
  created_at,
  closed_at,
  organization_id,
  assigned_agent_id,
  requester_email,
  custom_fields,
  requester:contacts(id, name, email),
  assigned_agent:agents(id, name, avatar_url),
  category:categories!tickets_category_id_fkey(id, name)
`;

async function WorkspacePage() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  // Role gate — only TDX agents (admin, supervisor, agent) see Workspace.
  const { data: agent } = await client
    .from('agents')
    .select('id, role, tenant_id, name, email')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!agent || agent.role === 'readonly') redirect('/home/tickets');

  // Open tickets (status NOT in closed/resolved/cancelled). Capped to 500
  // rows to protect the payload — a healthy queue should never exceed this,
  // and the workspace does client-side grouping so bigger sets inflate both
  // the RSC response AND the hydration cost for no visible benefit.
  const openPromise = client
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('tenant_id', agent.tenant_id)
    .is('deleted_at', null)
    .not('status', 'in', '(closed,resolved,cancelled)')
    .order('created_at', { ascending: false })
    .limit(500);

  // Recent closed — last 50 by closed_at (keeps payload small).
  const closedPromise = client
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('tenant_id', agent.tenant_id)
    .is('deleted_at', null)
    .in('status', ['closed', 'resolved', 'cancelled'])
    .order('closed_at', { ascending: false, nullsFirst: true })
    .limit(50);

  const agentsPromise = client
    .from('agents')
    .select('id, name, email, avatar_url, role')
    .eq('tenant_id', agent.tenant_id)
    .eq('is_active', true)
    .order('name');

  const orgsPromise = client
    .from('organizations')
    .select('id, name, slug')
    .eq('tenant_id', agent.tenant_id)
    .eq('is_active', true)
    .order('name');

  const [
    openResult,
    closedResult,
    agentsResult,
    orgsResult,
  ] = await Promise.all([openPromise, closedPromise, agentsPromise, orgsPromise]);

  const openTickets = (openResult.data ?? []) as unknown as any[];
  const closedTickets = (closedResult.data ?? []) as unknown as any[];
  const allTickets = [...openTickets, ...closedTickets];

  return (
    <WorkspaceClient
      currentAgentId={agent.id}
      currentAgentName={agent.name ?? 'Agent'}
      tickets={allTickets}
      agents={agentsResult.data ?? []}
      organizations={orgsResult.data ?? []}
    />
  );
}

export default withI18n(WorkspacePage);
