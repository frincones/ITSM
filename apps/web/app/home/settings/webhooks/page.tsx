import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { redirect } from 'next/navigation';

import { WebhooksClient } from './_components/webhooks-client';

export const metadata = {
  title: 'Webhooks',
};

export default async function WebhooksPage() {
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

  // Fetch webhooks
  const { data: webhooks } = await client
    .from('webhooks')
    .select('*')
    .eq('tenant_id', agent.tenant_id)
    .order('created_at', { ascending: false });

  // Fetch recent webhook logs
  const { data: webhookLogs } = await client
    .from('webhook_logs')
    .select('*')
    .eq('tenant_id', agent.tenant_id)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <WebhooksClient
      webhooks={webhooks ?? []}
      webhookLogs={webhookLogs ?? []}
      tenantId={agent.tenant_id}
    />
  );
}
