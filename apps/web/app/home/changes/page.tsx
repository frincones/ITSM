import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { ChangesClient } from './_components/changes-client';

interface ChangesPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    change_type?: string;
  }>;
}

export const metadata = {
  title: 'Change Management',
};

export default async function ChangesPage({ searchParams }: ChangesPageProps) {
  const params = await searchParams;
  const client = getSupabaseServerClient();
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  // Fetch changes with joins
  let query = client
    .from('changes')
    .select(
      `
      id,
      change_number,
      title,
      status,
      change_type,
      risk_level,
      scheduled_start,
      scheduled_end,
      approval_status,
      created_at,
      assigned_agent:agents!changes_assigned_agent_id_fkey(name, avatar_url),
      category:categories!changes_category_id_fkey(name)
    `,
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Search filter
  if (params.search) {
    query = query.or(
      `title.ilike.%${params.search}%,change_number.ilike.%${params.search}%`,
    );
  }

  // Status filter
  if (params.status) {
    query = query.eq('status', params.status);
  }

  // Change type filter
  if (params.change_type) {
    query = query.eq('change_type', params.change_type);
  }

  // Pagination
  query = query.range(offset, offset + limit - 1);

  // RLS filters automatically by tenant_id
  const { data: changes, count } = await query;

  // Stat counts
  const { count: pendingApproval } = await client
    .from('changes')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'approval_pending');

  const { count: scheduled } = await client
    .from('changes')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'scheduled');

  const { count: implementing } = await client
    .from('changes')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'in_progress');

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: completedThisMonth } = await client
    .from('changes')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('status', ['implemented', 'closed'])
    .gte('actual_end', startOfMonth.toISOString());

  return (
    <ChangesClient
      changes={changes ?? []}
      totalCount={count ?? 0}
      currentPage={page}
      pageSize={limit}
      searchQuery={params.search ?? ''}
      stats={{
        pendingApproval: pendingApproval ?? 0,
        scheduled: scheduled ?? 0,
        implementing: implementing ?? 0,
        completedThisMonth: completedThisMonth ?? 0,
      }}
    />
  );
}
