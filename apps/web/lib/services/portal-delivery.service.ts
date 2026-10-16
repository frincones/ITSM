// ---------------------------------------------------------------------------
// Portal del cliente — backlog y consumo del ciclo
// ---------------------------------------------------------------------------
// Lo que un cliente ve de su propio proyecto.
//
// Por qué exige sesión y no basta el token de la URL
// --------------------------------------------------
// El resto del portal (chat, base de conocimiento, "mis tickets") funciona
// con el token de organización, y está bien: es información que el cliente ya
// conoce. El backlog y el consumo del ciclo no: dicen cuánto se le factura a
// ese cliente y qué tiene pendiente. Quien reenvíe el enlace compartiría eso
// sin saberlo.
//
// Así que estas vistas comprueban que hay una sesión y que esa persona
// pertenece a la organización del token. Camilo, Bibiana, Daniel y Andrés ya
// existen como `organization_users` con login, así que no hace falta crear
// nada para usarlo.
// ---------------------------------------------------------------------------

import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * Cliente con service_role.
 *
 * El portal no puede apoyarse en el RLS porque la sesión de un
 * `organization_user` no siempre resuelve `get_current_tenant_id()` — esa
 * función busca en `agents`, y un usuario de cliente no es un agente. La
 * pertenencia se comprueba aquí arriba, explícitamente, antes de leer nada.
 */
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface PortalAccess {
  userId: string;
  name: string | null;
  email: string | null;
}

/**
 * Comprueba que quien pide pertenece a la organización del token.
 *
 * Devuelve null —y no lanza— cuando no hay sesión o la persona pertenece a
 * otro cliente: la página lo traduce en una invitación a iniciar sesión, que
 * es más útil que un error.
 */
export async function resolvePortalAccess(
  organizationId: string,
): Promise<PortalAccess | null> {
  const ssr = getSupabaseServerClient();

  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return null;

  const svc = serviceClient();

  const { data } = await svc
    .from('organization_users')
    .select('user_id, name, email, is_active')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle();

  if (data) {
    const row = data as { name: string | null; email: string | null };
    return { userId: user.id, name: row.name, email: row.email };
  }

  // El personal de TDX también puede abrir el portal de un cliente, que es
  // como se comprueba lo que el cliente está viendo.
  const { data: agent } = await svc
    .from('agents')
    .select('id, name, email, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (agent) {
    const a = agent as { name: string; email: string; role: string };
    if (['admin', 'supervisor', 'agent'].includes(a.role)) {
      return { userId: user.id, name: a.name, email: a.email };
    }
  }

  return null;
}

export interface CreditMeter {
  /** null cuando la organización no tiene contrato de soporte. */
  quota: number | null;
  consumed: number | null;
  remaining: number | null;
  overage: number | null;
  pct_used: number | null;
  cycle_label: string | null;
}

/**
 * El medidor de consumo del ciclo vigente.
 *
 * Devuelve todo en null cuando la organización no tiene contrato. Eso es
 * deliberado: Prosuministros hoy no lo tiene, y mostrar "0 de 0" o "100%
 * usado" serían dos formas distintas de mentir. La pantalla dice que no hay
 * contrato y ya está.
 *
 * Nota de vocabulario: lo que cuenta este medidor son TICKETS contra el cupo
 * mensual, que es lo que gobierna la facturación. No son los puntos de
 * esfuerzo del backlog, que miden tamaño de trabajo. Son dos escalas
 * distintas y la pantalla no las mezcla.
 */
export async function getCreditMeter(organizationId: string): Promise<CreditMeter> {
  const svc = serviceClient();

  const { data: contract } = await svc
    .from('organization_support_contracts')
    .select('id')
    .eq('organization_id', organizationId)
    .is('effective_to', null)
    .maybeSingle();

  const vacio: CreditMeter = {
    quota: null,
    consumed: null,
    remaining: null,
    overage: null,
    pct_used: null,
    cycle_label: null,
  };

  if (!contract) return vacio;

  const { data, error } = await svc.rpc('support_cycle_usage', {
    p_contract_id: (contract as { id: string }).id,
  });

  if (error) return vacio;

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        quota: number;
        consumed: number;
        remaining: number;
        overage: number;
        pct_used: number;
        cycle_label: string;
      }
    | undefined;

  if (!row) return vacio;

  return {
    quota: row.quota,
    consumed: row.consumed,
    remaining: row.remaining,
    overage: row.overage,
    pct_used: Number(row.pct_used),
    cycle_label: row.cycle_label,
  };
}

export interface PortalBacklogItem {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  effort_points: number | null;
  effort_size: string | null;
  cycle_number: number | null;
  created_at: string;
}

/**
 * El backlog del cliente, con el ciclo al que está comprometido cada item.
 *
 * No expone el precio ni el coste interno: el cliente ve el tamaño en puntos,
 * que es lo que negocia, no lo que TDX factura por él.
 */
export async function getPortalBacklog(
  organizationId: string,
): Promise<{ items: PortalBacklogItem[]; totals: Record<string, number> }> {
  const svc = serviceClient();

  const { data } = await svc
    .from('tickets')
    .select(
      'id, ticket_number, title, status, effort_points, effort_size, created_at, delivery_cycle_id',
    )
    .eq('organization_id', organizationId)
    .in('type', ['backlog', 'desarrollo_pendiente'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Array<{
    id: string;
    ticket_number: string;
    title: string;
    status: string;
    effort_points: number | null;
    effort_size: string | null;
    created_at: string;
    delivery_cycle_id: string | null;
  }>;

  // El número de ciclo se resuelve aparte: PostgREST no tiene declarada la
  // relación tickets -> delivery_cycles y un join embebido falla.
  const cycleIds = [...new Set(rows.map((r) => r.delivery_cycle_id).filter(Boolean))];
  const cycleNumber = new Map<string, number>();

  if (cycleIds.length) {
    const { data: cycles } = await svc
      .from('delivery_cycles')
      .select('id, cycle_number')
      .in('id', cycleIds as string[]);
    for (const c of (cycles ?? []) as Array<{ id: string; cycle_number: number }>) {
      cycleNumber.set(c.id, c.cycle_number);
    }
  }

  const items = rows.map((r) => ({
    id: r.id,
    ticket_number: r.ticket_number,
    title: r.title,
    status: r.status,
    effort_points: r.effort_points,
    effort_size: r.effort_size,
    cycle_number: r.delivery_cycle_id
      ? (cycleNumber.get(r.delivery_cycle_id) ?? null)
      : null,
    created_at: r.created_at,
  }));

  const ENTREGADO = ['resolved', 'closed'];
  const estimados = items.filter((i) => i.effort_points !== null);

  return {
    items,
    totals: {
      items: items.length,
      // Lo propuesto se cuenta aparte: todavía no es trabajo comprometido, y
      // sumarlo al backlog haría creer al cliente que ya está aceptado.
      proposed: items.filter((i) => i.status === 'proposed').length,
      delivered: items.filter((i) => ENTREGADO.includes(i.status)).length,
      in_progress: items.filter(
        (i) => !ENTREGADO.includes(i.status) && i.status !== 'proposed',
      ).length,
      points: estimados.reduce((s, i) => s + (i.effort_points ?? 0), 0),
      unestimated: items.length - estimados.length,
    },
  };
}

export interface PortalCycle {
  id: string;
  cycle_number: number;
  name: string | null;
  starts_on: string;
  ends_on: string;
  status: string;
  committed_points: number | null;
  delivered_points: number | null;
  assigned_points: number;
  items_total: number;
}

/** Los ciclos de entrega de los proyectos de este cliente. */
export async function getPortalCycles(organizationId: string): Promise<PortalCycle[]> {
  const svc = serviceClient();

  const { data: projects } = await svc
    .from('projects')
    .select('id')
    .eq('organization_id', organizationId);

  const projectIds = ((projects ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!projectIds.length) return [];

  const { data: cycles } = await svc
    .from('delivery_cycles')
    .select('*')
    .in('project_id', projectIds)
    .order('cycle_number', { ascending: false })
    .limit(12);

  const rows = (cycles ?? []) as Array<{
    id: string;
    cycle_number: number;
    name: string | null;
    starts_on: string;
    ends_on: string;
    status: string;
    committed_points: number | null;
    delivered_points: number | null;
  }>;

  // El estado real se calcula con la misma función que usa el equipo, para
  // que cliente y equipo no vean números distintos del mismo ciclo.
  const estados = await Promise.all(
    rows.map(async (c) => {
      const { data } = await svc.rpc('delivery_cycle_status', { p_cycle_id: c.id });
      const r = (Array.isArray(data) ? data[0] : data) as
        | { assigned_points: number; items_total: number }
        | undefined;
      return {
        ...c,
        assigned_points: r?.assigned_points ?? 0,
        items_total: r?.items_total ?? 0,
      };
    }),
  );

  return estados;
}
