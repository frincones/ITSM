import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  getCycleReport,
  getDailyActivity,
} from '~/lib/services/cycle-report.service';
import { withI18n } from '~/lib/i18n/with-i18n';

import { CycleReportClient } from './_components/cycle-report-client';

export const metadata = {
  title: 'Reporte mensual de servicio',
};

// Live figures on every visit. The same reasoning as /home/reports: a cached
// render is how a stale counter stays on screen after the underlying tickets
// have moved.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ org?: string; at?: string }>;
}

/**
 * The monthly service report required by contract clause 7.
 *
 * Separate from /home/reports on purpose: that one is a daily operational view
 * driven by a single date, while this one is scoped to a billing CYCLE — the
 * 22nd to the 21st for Podenza, not a calendar month (cl. 8).
 *
 * Unlike the operational report there is no "all clients" mode. The figures
 * here are contractual: quota, overage and service credits only mean anything
 * against one specific contract, and summing two clients' compliance into one
 * percentage would produce a number nobody owes.
 */
async function CycleReportPage({ searchParams }: PageProps) {
  const { org, at } = await searchParams;

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  const isClient = !agent || agent.role === 'readonly';

  // Resolve the organization. Client users are pinned to their own membership;
  // staff pick one, and must pick one.
  let organizationId: string | null = org ?? null;

  if (isClient) {
    const { data: orgUser } = await client
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    const forced = (orgUser as { organization_id: string } | null)
      ?.organization_id;
    if (!forced) redirect('/home');
    organizationId = forced;
  }

  // Staff with no client chosen: offer the list of clients that actually have
  // a support contract, since this report is meaningless for the others.
  if (!organizationId) {
    const { data: contracted } = await client
      .from('organization_support_contracts')
      .select('organization_id, plan_name, organization:organizations(id, name)')
      .order('effective_from', { ascending: false });

    const options = ((contracted ?? []) as unknown as Array<{
      plan_name: string;
      organization: { id: string; name: string } | null;
    }>)
      .filter((r) => r.organization)
      .map((r) => ({
        id: r.organization!.id,
        name: r.organization!.name,
        plan: r.plan_name,
      }));

    // Exactly one contracted client — no point asking.
    if (options.length === 1) {
      redirect(`/home/reports/ciclo?org=${options[0]!.id}`);
    }

    return <CycleReportClient report={null} daily={[]} options={options} />;
  }

  const report = await getCycleReport(client, organizationId, at);

  const daily = report
    ? await getDailyActivity(client, report.contractId, at)
    : [];

  return (
    <CycleReportClient
      report={report}
      daily={daily}
      options={[]}
      isClient={isClient}
      canClose={agent?.role === 'admin'}
    />
  );
}

export default withI18n(CycleReportPage);
