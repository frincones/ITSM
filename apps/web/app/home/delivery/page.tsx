// ---------------------------------------------------------------------------
// Gestión de proyectos — backlog, ciclos, capacidad y triage
// ---------------------------------------------------------------------------
// Una sola ruta con cuatro pestañas en vez de cuatro rutas, porque las cuatro
// miran al mismo proyecto y cambiar de una a otra sin recargar es lo que hace
// usable el refinamiento: se mueve un item y se ve el efecto en el ciclo.
//
// La página solo lee; todo lo que escribe pasa por las server actions de
// lib/actions/delivery.ts, que delegan en el dominio.
// ---------------------------------------------------------------------------

import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { DeliveryClient } from './_components/delivery-client';

export const metadata = {
  title: 'Proyectos',
};

export const dynamic = 'force-dynamic';

interface DeliveryPageProps {
  searchParams: Promise<{ project?: string; tab?: string; cycle?: string }>;
}

export default async function DeliveryPage({ searchParams }: DeliveryPageProps) {
  const params = await searchParams;
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: agentRow } = await client
    .from('agents')
    .select('id, tenant_id, role, is_active')
    .eq('user_id', user.id)
    .single();

  // Planificar compromete capacidad del equipo, así que esta pantalla es solo
  // para el personal. Un cliente ve su backlog desde el portal.
  const agent = agentRow as unknown as {
    id: string;
    tenant_id: string;
    role: string;
    is_active: boolean | null;
  } | null;

  if (!agent || agent.is_active === false) redirect('/home');
  if (!['admin', 'supervisor', 'agent'].includes(agent.role)) redirect('/home');

  const [{ data: projects }, { data: agents }] = await Promise.all([
    client
      .from('projects')
      .select('id, name, status, organization_id')
      .eq('tenant_id', agent.tenant_id)
      .order('created_at', { ascending: false }),
    client
      .from('agents')
      .select('id, name, role')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)
      .in('role', ['admin', 'supervisor', 'agent'])
      .order('name'),
  ]);

  // El nombre del cliente se resuelve aparte: PostgREST no tiene declarada
  // la relación projects -> organizations, y un join embebido falla.
  const rawProjects = (projects ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    organization_id: string | null;
  }>;

  const orgIds = [...new Set(rawProjects.map((p) => p.organization_id).filter(Boolean))];
  const { data: orgRows } = orgIds.length
    ? await client.from('organizations').select('id, name').in('id', orgIds as string[])
    : { data: [] };

  const orgName = new Map(
    ((orgRows ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
  );

  const projectList = rawProjects.map((p) => ({
    ...p,
    organizations: p.organization_id
      ? { name: orgName.get(p.organization_id) ?? '' }
      : null,
  }));

  const selectedProject =
    projectList.find((p) => p.id === params.project) ?? projectList[0] ?? null;

  // Los ciclos y la escala solo tienen sentido con un proyecto elegido.
  const [cyclesRes, scaleRes] = await Promise.all([
    selectedProject
      ? client
          .from('delivery_cycles')
          .select('*')
          .eq('tenant_id', agent.tenant_id)
          .eq('project_id', selectedProject.id)
          .order('cycle_number', { ascending: false })
      : Promise.resolve({ data: [] }),
    client
      .from('effort_conversion')
      .select('size, points')
      .eq('tenant_id', agent.tenant_id)
      .is('effective_to', null),
  ]);

  const cycles = (cyclesRes.data ?? []) as Array<{
    id: string;
    cycle_number: number;
    name: string | null;
    starts_on: string;
    ends_on: string;
    committed_points: number | null;
    status: string;
    delivered_points: number | null;
  }>;

  const scale: Record<string, number> = {};
  for (const row of (scaleRes.data ?? []) as Array<{ size: string; points: number }>) {
    scale[row.size] = row.points;
  }

  return (
    <DeliveryClient
      projects={projectList}
      agents={(agents ?? []) as Array<{ id: string; name: string; role: string }>}
      selectedProjectId={selectedProject?.id ?? null}
      cycles={cycles}
      scale={scale}
      initialTab={params.tab ?? 'backlog'}
      initialCycleId={params.cycle ?? cycles.find((c) => c.status !== 'closed')?.id ?? null}
      isAdmin={agent.role === 'admin'}
    />
  );
}
