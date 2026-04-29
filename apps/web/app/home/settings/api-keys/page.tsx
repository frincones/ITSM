import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { listApiKeys } from '~/lib/services/api-key.service';

import { ApiKeysClient } from './_components/api-keys-client';

export const metadata = {
  title: 'API Keys & MCP',
};

export default async function ApiKeysPage() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: agentRow } = await client
    .from('agents')
    .select('id, tenant_id, role, is_active')
    .eq('user_id', user.id)
    .single();

  if (!agentRow) redirect('/home');
  const agent = agentRow as unknown as {
    id: string;
    tenant_id: string;
    role: string;
    is_active: boolean;
  };
  if (!agent.is_active) redirect('/home');
  if (agent.role !== 'admin' && agent.role !== 'supervisor') {
    redirect('/home');
  }

  const { data: keys } = await listApiKeys(client, agent.tenant_id);

  return <ApiKeysClient keys={keys ?? []} />;
}
