import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { ReportsClient } from './_components/reports-client';

export const metadata = {
  title: 'Reports & Analytics',
};

export default async function ReportsPage() {
  const client = getSupabaseServerClient();

  // Fetch total tickets count
  const { count: totalTickets } = await client
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  // Fetch tickets grouped by priority
  const { data: ticketsByPriority } = await client
    .from('tickets')
    .select('priority')
    .is('deleted_at', null);

  // Fetch tickets grouped by category
  const { data: ticketsByCategory } = await client
    .from('tickets')
    .select('category:categories!tickets_category_id_fkey(name)')
    .is('deleted_at', null);

  // Fetch agent performance data
  const { data: agents } = await client
    .from('agents')
    .select('id, name, avatar_url')
    .eq('status', 'active')
    .order('name')
    .limit(10);

  return (
    <ReportsClient
      totalTickets={totalTickets ?? 0}
      ticketsByPriority={ticketsByPriority ?? []}
      ticketsByCategory={ticketsByCategory ?? []}
      agents={agents ?? []}
    />
  );
}
