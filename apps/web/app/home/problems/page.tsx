import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { ProblemsClient } from './_components/problems-client';

interface ProblemsPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    priority?: string;
  }>;
}

export const metadata = {
  title: 'Problem Management',
};

export default async function ProblemsPage({ searchParams }: ProblemsPageProps) {
  const params = await searchParams;
  const client = getSupabaseServerClient();
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  // Fetch problems with joins
  let query = client
    .from('problems')
    .select(
      `
      id,
      problem_number,
      title,
      status,
      urgency,
      impact,
      priority,
      root_cause,
      workaround,
      created_at,
      assigned_agent:agents!problems_assigned_agent_id_fkey(name, avatar_url),
      category:categories!problems_category_id_fkey(name)
    `,
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Search filter
  if (params.search) {
    query = query.or(
      `title.ilike.%${params.search}%,problem_number.ilike.%${params.search}%`,
    );
  }

  // Status filter
  if (params.status) {
    query = query.eq('status', params.status);
  }

  // Pagination
  query = query.range(offset, offset + limit - 1);

  // RLS filters automatically by tenant_id
  const { data: problems, count } = await query;

  // Fetch related incident counts per problem via problem_ticket_links
  const problemIds = (problems ?? []).map((p) => p.id);
  let relatedIncidentCounts: Record<string, number> = {};

  if (problemIds.length > 0) {
    const { data: links } = await client
      .from('problem_ticket_links')
      .select('problem_id')
      .in('problem_id', problemIds);

    if (links) {
      relatedIncidentCounts = links.reduce(
        (acc: Record<string, number>, link) => {
          acc[link.problem_id] = (acc[link.problem_id] ?? 0) + 1;
          return acc;
        },
        {},
      );
    }
  }

  // Stat counts
  const { count: activeCount } = await client
    .from('problems')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('status', ['new', 'accepted', 'analysis', 'root_cause_identified', 'solution_planned']);

  const { count: knownErrorCount } = await client
    .from('problems')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'root_cause_identified');

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: resolvedThisMonth } = await client
    .from('problems')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('status', ['resolved', 'closed'])
    .gte('resolved_at', startOfMonth.toISOString());

  const { count: totalRelatedIncidents } = await client
    .from('problem_ticket_links')
    .select('id', { count: 'exact', head: true });

  return (
    <ProblemsClient
      problems={(problems ?? []).map((p) => ({
        ...p,
        related_incidents: relatedIncidentCounts[p.id] ?? 0,
      }))}
      totalCount={count ?? 0}
      currentPage={page}
      pageSize={limit}
      searchQuery={params.search ?? ''}
      stats={{
        activeProblems: activeCount ?? 0,
        knownErrors: knownErrorCount ?? 0,
        resolvedThisMonth: resolvedThisMonth ?? 0,
        relatedIncidents: totalRelatedIncidents ?? 0,
      }}
    />
  );
}
