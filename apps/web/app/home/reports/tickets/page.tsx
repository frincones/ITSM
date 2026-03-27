import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { TicketReportsClient } from './_components/ticket-reports-client';

export const metadata = {
  title: 'Ticket Reports',
};

export default async function TicketReportsPage() {
  const client = getSupabaseServerClient();

  // Fetch ticket counts by status and type
  const { data: tickets } = await client
    .from('tickets')
    .select('status, type')
    .is('deleted_at', null);

  // Fetch agents for filter
  const { data: agents } = await client
    .from('agents')
    .select('id, name')
    .eq('status', 'active')
    .order('name');

  // Fetch groups for filter
  const { data: groups } = await client
    .from('groups')
    .select('id, name')
    .order('name');

  return (
    <TicketReportsClient
      tickets={tickets ?? []}
      agents={agents ?? []}
      groups={groups ?? []}
    />
  );
}
