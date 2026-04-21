import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { withI18n } from '~/lib/i18n/with-i18n';

import { GestionSoporteClient } from './gestion-soporte/_components/gestion-soporte-client';

export const metadata = {
  title: 'Reporte Gestión Soporte',
};

interface PageProps {
  searchParams: Promise<{ date?: string; org?: string }>;
}

async function ReportsPage({ searchParams }: PageProps) {
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
    // Agent with no org selected: pick first org in tenant
    const { data: firstOrg } = await client
      .from('organizations')
      .select('id, name')
      .eq('tenant_id', agent!.tenant_id)
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

  // Garantía / Soporte are driven by ticket_type now — not by category_id.
  // The redundant Garantía/Soporte categories were removed in the Apr-21
  // cleanup so queries below filter by type.
  const fromIso = `${reportDate}T00:00:00.000Z`;
  const toIso = `${reportDate}T23:59:59.999Z`;

  const TICKET_SELECT =
    'id, ticket_number, title, status, type, urgency, created_at, closed_at, assigned_agent_id';

  const listByDate = async (filters: {
    dateCol: 'created_at' | 'closed_at';
    type?: string;
  }): Promise<TicketSummary[]> => {
    let q = client
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('organization_id', organizationId!)
      .gte(filters.dateCol, fromIso)
      .lte(filters.dateCol, toIso)
      .order(filters.dateCol, { ascending: true });
    if (filters.type) q = q.eq('type', filters.type);
    const { data } = await q;
    return (data ?? []) as unknown as TicketSummary[];
  };

  const listSnapshot = async (filters: {
    status?: string;
    type?: string;
    customTestingResult?: string;
  }): Promise<TicketSummary[]> => {
    let q = client
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('organization_id', organizationId!)
      .order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.customTestingResult) {
      q = q.eq('custom_fields->>testing_result', filters.customTestingResult);
    }
    const { data } = await q;
    return (data ?? []) as unknown as TicketSummary[];
  };

  const listNuevosTesting = async (
    type: string,
  ): Promise<TicketSummary[]> => {
    const { data } = await client
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('organization_id', organizationId!)
      .eq('status', 'testing')
      .eq('type', type)
      .gte('custom_fields->>testing_entered_at', fromIso)
      .lte('custom_fields->>testing_entered_at', toIso)
      .order('updated_at', { ascending: false });
    return (data ?? []) as unknown as TicketSummary[];
  };

  const lists = {
    cerradosGarantia: await listByDate({ dateCol: 'closed_at', type: 'warranty' }),
    cerradosSoporte: await listByDate({ dateCol: 'closed_at', type: 'support' }),
    nuevoGarantia: await listByDate({ dateCol: 'created_at', type: 'warranty' }),
    nuevoSoporte: await listByDate({ dateCol: 'created_at', type: 'support' }),
    progresoGarantia: await listSnapshot({ status: 'in_progress', type: 'warranty' }),
    progresoSoporte: await listSnapshot({ status: 'in_progress', type: 'support' }),
    testingGarantia: await listNuevosTesting('warranty'),
    testingSoporte: await listNuevosTesting('support'),
    pendientesGarantia: await listSnapshot({ status: 'pending', type: 'warranty' }),
    pendientesSoporte: await listSnapshot({ status: 'pending', type: 'support' }),
    fracasoTesting: await listSnapshot({ customTestingResult: 'fracaso' }),
    pendientesTesting: await listSnapshot({ customTestingResult: 'pendiente' }),
  };

  const metrics = Object.fromEntries(
    Object.entries(lists).map(([k, v]) => [k, v.length]),
  ) as Record<keyof typeof lists, number>;

  return (
    <GestionSoporteClient
      reportDate={reportDate}
      organizationName={organizationName}
      metrics={metrics}
      lists={lists}
    />
  );
}

export interface TicketSummary {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  type: string;
  urgency: string;
  created_at: string;
  closed_at: string | null;
  assigned_agent_id: string | null;
}

export default withI18n(ReportsPage);
