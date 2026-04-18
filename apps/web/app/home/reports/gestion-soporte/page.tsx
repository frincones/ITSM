import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { withI18n } from '~/lib/i18n/with-i18n';

import { GestionSoporteClient } from './_components/gestion-soporte-client';

export const metadata = {
  title: 'Reporte Gestión Soporte',
};

interface PageProps {
  searchParams: Promise<{ date?: string; org?: string }>;
}

async function GestionSoportePage({ searchParams }: PageProps) {
  const { date, org } = await searchParams;
  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) redirect('/auth/sign-in');

  // Determine organization — for org_users it's forced to their membership.
  let organizationId: string | null = org ?? null;
  let organizationName = '';

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  const isClient = !agent || agent.role === 'readonly';

  if (isClient) {
    const { data: orgUser } = await client
      .from('organization_users')
      .select('organization:organizations(id, name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    const forced = (orgUser?.organization ?? null) as
      | { id: string; name: string }
      | null;
    if (!forced) redirect('/home');
    organizationId = forced.id;
    organizationName = forced.name;
  } else if (organizationId) {
    const { data: o } = await client
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle();
    organizationName = o?.name ?? '';
  } else {
    // Agent with no org selected: pick first Podenza or the only org available
    const { data: firstOrg } = await client
      .from('organizations')
      .select('id, name')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)
      .order('name')
      .limit(1)
      .maybeSingle();
    if (firstOrg) {
      organizationId = firstOrg.id;
      organizationName = firstOrg.name;
    }
  }

  if (!organizationId) redirect('/home');

  // Find Garantía + Soporte category IDs (scoped to the org's tenant).
  const { data: orgRow } = await client
    .from('organizations')
    .select('tenant_id')
    .eq('id', organizationId)
    .maybeSingle();

  const tenantId = orgRow?.tenant_id ?? null;

  const { data: cats } = await client
    .from('categories')
    .select('id, name')
    .eq('tenant_id', tenantId ?? '')
    .in('name', ['Garantía', 'Soporte']);

  const garantiaId = cats?.find((c) => c.name === 'Garantía')?.id ?? null;
  const soporteId = cats?.find((c) => c.name === 'Soporte')?.id ?? null;

  // Count helper: tickets in this org + given status + given category
  const countTickets = async (filters: {
    status?: string;
    categoryId?: string | null;
    customTestingResult?: string;
  }): Promise<number> => {
    let q = client
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId!);

    if (filters.status) q = q.eq('status', filters.status);
    if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
    if (filters.customTestingResult) {
      q = q.eq('custom_fields->>testing_result', filters.customTestingResult);
    }
    const { count } = await q;
    return count ?? 0;
  };

  const metrics = {
    cerradosGarantia: await countTickets({ status: 'closed', categoryId: garantiaId }),
    cerradosSoporte: await countTickets({ status: 'closed', categoryId: soporteId }),
    nuevoGarantia: await countTickets({ status: 'new', categoryId: garantiaId }),
    nuevoSoporte: await countTickets({ status: 'new', categoryId: soporteId }),
    progresoGarantia: await countTickets({ status: 'in_progress', categoryId: garantiaId }),
    progresoSoporte: await countTickets({ status: 'in_progress', categoryId: soporteId }),
    testingGarantia: await countTickets({ status: 'testing', categoryId: garantiaId }),
    testingSoporte: await countTickets({ status: 'testing', categoryId: soporteId }),
    pendientesGarantia: await countTickets({ status: 'pending', categoryId: garantiaId }),
    pendientesSoporte: await countTickets({ status: 'pending', categoryId: soporteId }),
    fracasoTesting: await countTickets({ customTestingResult: 'failed' }),
    pendientesTesting: await countTickets({ customTestingResult: 'pending' }),
  };

  return (
    <GestionSoporteClient
      reportDate={reportDate}
      organizationName={organizationName}
      metrics={metrics}
    />
  );
}

export default withI18n(GestionSoportePage);
