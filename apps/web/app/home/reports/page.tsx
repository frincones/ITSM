import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  getReportDashboard,
  type ReportDashboard,
} from '~/lib/services/metrics.service';

import { ReportsClient } from './_components/reports-client';

export const metadata = {
  title: 'Reports & Analytics',
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const client = getSupabaseServerClient();

  // Resolve agent + tenant
  const {
    data: { user },
  } = await client.auth.getUser();

  let tenantId = '';
  if (user) {
    const { data: agent } = await client
      .from('agents')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();
    tenantId = agent?.tenant_id ?? '';
  }

  // Date range defaults: last 12 months
  const to = params.to ?? new Date().toISOString().slice(0, 10);
  const from =
    params.from ??
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const orgId = params.org ?? null;

  // Fetch organizations for filter dropdown
  const { data: organizations } = await client
    .from('organizations')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  // Fetch report data
  let dashboard: ReportDashboard | null = null;

  if (tenantId) {
    const result = await getReportDashboard(client, tenantId, { from, to }, orgId);
    dashboard = result.data;
  }

  return (
    <ReportsClient
      dashboard={dashboard}
      organizations={organizations ?? []}
      selectedOrg={orgId}
      dateFrom={from}
      dateTo={to}
    />
  );
}
