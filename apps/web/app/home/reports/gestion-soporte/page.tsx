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

  // The report covers a single day. "Cerrados" and "Nuevo" rows measure
  // transitions that happened in that window; every other row is a snapshot
  // of the current state regardless of date.
  const fromIso = `${reportDate}T00:00:00.000Z`;
  const toIso = `${reportDate}T23:59:59.999Z`;

  // Movement counter — tickets whose given date column falls inside the day.
  const countByDate = async (filters: {
    dateCol: 'created_at' | 'closed_at';
    status?: string;
    categoryId?: string | null;
  }): Promise<number> => {
    let q = client
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId!)
      .gte(filters.dateCol, fromIso)
      .lte(filters.dateCol, toIso);

    if (filters.status) q = q.eq('status', filters.status);
    if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
    const { count } = await q;
    return count ?? 0;
  };

  // Snapshot counter — current state, no date filter.
  const countSnapshot = async (filters: {
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

  // "Nuevos Testing" — tickets that transitioned INTO status='testing' on the
  // selected day. Relies on custom_fields.testing_entered_at (set by
  // changeTicketStatus when status becomes 'testing').
  const countNuevosTesting = async (categoryId: string | null): Promise<number> => {
    let q = client
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId!)
      .eq('status', 'testing')
      .gte('custom_fields->>testing_entered_at', fromIso)
      .lte('custom_fields->>testing_entered_at', toIso);
    if (categoryId) q = q.eq('category_id', categoryId);
    const { count } = await q;
    return count ?? 0;
  };

  const metrics = {
    // Cerrados = closed_at dentro del día, filtrado por categoría
    cerradosGarantia: await countByDate({ dateCol: 'closed_at', categoryId: garantiaId }),
    cerradosSoporte: await countByDate({ dateCol: 'closed_at', categoryId: soporteId }),
    // Nuevo = tickets cuya fecha de creación cae en el día
    nuevoGarantia: await countByDate({ dateCol: 'created_at', categoryId: garantiaId }),
    nuevoSoporte: await countByDate({ dateCol: 'created_at', categoryId: soporteId }),
    // Estados activos = snapshot (sin filtro de fecha)
    progresoGarantia: await countSnapshot({ status: 'in_progress', categoryId: garantiaId }),
    progresoSoporte: await countSnapshot({ status: 'in_progress', categoryId: soporteId }),
    // Nuevos Testing = transición a testing ocurrió hoy
    testingGarantia: await countNuevosTesting(garantiaId),
    testingSoporte: await countNuevosTesting(soporteId),
    // Pendientes = snapshot de status='pending'
    pendientesGarantia: await countSnapshot({ status: 'pending', categoryId: garantiaId }),
    pendientesSoporte: await countSnapshot({ status: 'pending', categoryId: soporteId }),
    // Fracaso / Pendientes de Testing = snapshot del sub-estado en testing
    fracasoTesting: await countSnapshot({ customTestingResult: 'fracaso' }),
    pendientesTesting: await countSnapshot({ customTestingResult: 'pendiente' }),
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
