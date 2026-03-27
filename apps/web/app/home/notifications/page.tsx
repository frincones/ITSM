import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { redirect } from 'next/navigation';

import { NotificationsClient } from './_components/notifications-client';

export const metadata = {
  title: 'Notifications',
};

export default async function NotificationsPage() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  // Fetch agent record for current user
  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    redirect('/home');
  }

  // Fetch notifications for this agent
  const { data: notifications } = await client
    .from('notifications')
    .select('*')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <NotificationsClient
      notifications={notifications ?? []}
      agentId={agent.id}
    />
  );
}
