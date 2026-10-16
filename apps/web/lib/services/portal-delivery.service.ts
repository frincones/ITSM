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

// ---------------------------------------------------------------------------
// Fases del contrato (Anexo C)
// ---------------------------------------------------------------------------
// Lo que el equipo pidió que viera el cliente:
//
//   "el dolor mayor que tenemos es que Podenza se demora mucho en aprobar un
//    documento funcional (...) y el PM asignado debe lograr revisarlos,
//    gestionarlos y usar la herramienta para decir ya recibimos"
//
// Así que el portal muestra las dos mitades: en qué fase va cada
// requerimiento, y QUÉ ESTAMOS ESPERANDO DE ELLOS con los días acumulados.
// Una pantalla que solo mostrara los atrasos de TDX cuenta media historia y
// convierte cada revisión de ciclo en una discusión sin datos.
//
// IMPORTANTE SOBRE EL AISLAMIENTO. Este servicio usa service_role, que se
// salta el RLS, así que las políticas de 00077/00078 no protegen aquí. Cada
// consulta de abajo filtra por organización EXPLÍCITAMENTE, y los ids de
// ticket se validan contra la organización antes de pedir su detalle. Si
// alguna vez se añade una consulta sin ese filtro, el cliente vería trabajo
// ajeno.

export interface PortalPhaseSpan {
  phase: string;
  owner: string;
  entered_at: string;
  exited_at: string | null;
  is_open: boolean;
  business_days: number | null;
  paused_days: number;
  net_days: number | null;
  target_days: number | null;
  over_days: number | null;
  breached: boolean | null;
}

export interface PortalRequirement {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  phase: string | null;
  effort_size: string | null;
  effort_points: number | null;
  /** Días netos de cada parte. Separados a propósito: son dos historias. */
  tdx_days: number;
  client_days: number;
  third_party_days: number;
  /** Atraso imputable a TDX en una fase que genera descuento. */
  tdx_over: number;
  client_over: number;
  spans: PortalPhaseSpan[];
}

export interface PortalWait {
  wait_id: string;
  ticket_number: string;
  ticket_title: string;
  phase: string;
  what: string;
  owed_by: string;
  requested_at: string;
  waiting_days: number;
  target_days: number | null;
  over_days: number | null;
  turn_number: number;
}

export interface PortalDelaySummary {
  open_requirements: number;
  tdx_delay_days: number;
  client_delay_days: number;
  third_party_days: number;
  exposed_credits: number;
  items_at_risk: number;
  open_waits: number;
  oldest_wait_days: number;
}

/**
 * Los requerimientos del cliente con su fase y el reparto de días.
 *
 * Filtra por `organization_id` en la consulta, no después: el portal no pasa
 * por RLS y un filtro en memoria dejaría los datos ajenos viajando hasta
 * aquí.
 */
export async function getPortalRequirements(
  organizationId: string,
): Promise<PortalRequirement[]> {
  const svc = serviceClient();

  const { data } = await svc
    .from('tickets')
    .select(
      'id, ticket_number, title, status, requirement_phase, effort_size, effort_points',
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not('requirement_phase', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    ticket_number: string;
    title: string;
    status: string;
    requirement_phase: string | null;
    effort_size: string | null;
    effort_points: number | null;
  }>;

  if (!rows.length) return [];

  return Promise.all(
    rows.map(async (t) => {
      const [delayRes, spanRes] = await Promise.all([
        svc.rpc('requirement_delay', { p_ticket_id: t.id }),
        svc.rpc('ticket_phase_sla', { p_ticket_id: t.id }),
      ]);

      const d = (Array.isArray(delayRes.data) ? delayRes.data[0] : delayRes.data) as
        | Record<string, number>
        | undefined;

      const spans = ((spanRes.data ?? []) as unknown as PortalPhaseSpan[]).map((s) => ({
        ...s,
        paused_days: Number(s.paused_days ?? 0),
      }));

      return {
        id: t.id,
        ticket_number: t.ticket_number,
        title: t.title,
        status: t.status,
        phase: t.requirement_phase,
        effort_size: t.effort_size,
        effort_points: t.effort_points,
        tdx_days: Number(d?.tdx_days ?? 0),
        client_days: Number(d?.cliente_days ?? 0),
        third_party_days: Number(d?.tercero_days ?? 0),
        tdx_over: Number(d?.tdx_over ?? 0),
        client_over: Number(d?.cliente_over ?? 0),
        spans,
      };
    }),
  );
}

/**
 * Lo que esperamos del cliente, con los días que lleva esperando.
 *
 * La función de SQL ya filtra por organización cuando se le pasa el
 * parámetro, así que no hace falta filtrar aquí otra vez — pero el parámetro
 * NO es opcional en esta llamada, precisamente porque omitirlo devolvería las
 * esperas de todos los clientes.
 *
 * Se muestran también las esperas a cargo de TDX: esconder las nuestras
 * mientras se muestran las suyas sería una pantalla deshonesta, y el equipo
 * pidió explícitamente lo contrario.
 */
export async function getPortalWaits(organizationId: string): Promise<PortalWait[]> {
  const svc = serviceClient();

  const { data } = await svc.rpc('open_phase_waits', {
    p_organization_id: organizationId,
  });

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

  return rows.map((w) => ({
    wait_id: String(w.wait_id),
    ticket_number: String(w.ticket_number),
    ticket_title: String(w.ticket_title),
    phase: String(w.phase),
    what: String(w.what),
    owed_by: String(w.owed_by),
    requested_at: String(w.requested_at),
    waiting_days: Number(w.waiting_days ?? 0),
    target_days: w.target_days === null ? null : Number(w.target_days),
    over_days: w.over_days === null ? null : Number(w.over_days),
    turn_number: Number(w.turn_number ?? 1),
  }));
}

/** Las cifras de cabecera: días de cada parte y esperas abiertas. */
export async function getPortalDelaySummary(
  organizationId: string,
): Promise<PortalDelaySummary> {
  const svc = serviceClient();

  const { data } = await svc.rpc('organization_delay_summary', {
    p_organization_id: organizationId,
  });

  const r = (Array.isArray(data) ? data[0] : data) as
    | Record<string, number>
    | undefined;

  return {
    open_requirements: Number(r?.open_requirements ?? 0),
    tdx_delay_days: Number(r?.tdx_delay_days ?? 0),
    client_delay_days: Number(r?.client_delay_days ?? 0),
    third_party_days: Number(r?.third_party_days ?? 0),
    exposed_credits: Number(r?.exposed_credits ?? 0),
    items_at_risk: Number(r?.items_at_risk ?? 0),
    open_waits: Number(r?.open_waits ?? 0),
    oldest_wait_days: Number(r?.oldest_wait_days ?? 0),
  };
}

/**
 * El cumplimiento del ciclo tal como lo ve el equipo.
 *
 * Es LA MISMA función que lee la pantalla interna: si el portal calculara por
 * su cuenta, el día que una de las dos cambiara habría dos verdades sobre la
 * misma factura.
 *
 * El ciclo se valida contra la organización antes de leerlo: un id de ciclo
 * ajeno no devuelve nada en vez de devolver el cumplimiento de otro cliente.
 */
export async function getPortalCompliance(
  organizationId: string,
  cycleId: string,
): Promise<Record<string, unknown> | null> {
  const svc = serviceClient();

  const { data: cyc } = await svc
    .from('delivery_cycles')
    .select('id, project_id')
    .eq('id', cycleId)
    .maybeSingle();

  const c = cyc as { project_id: string } | null;
  if (!c) return null;

  const { data: proj } = await svc
    .from('projects')
    .select('id, organization_id')
    .eq('id', c.project_id)
    .maybeSingle();

  // La comprobación que sustituye al RLS en este camino.
  if ((proj as { organization_id: string | null } | null)?.organization_id !== organizationId) {
    return null;
  }

  const { data } = await svc.rpc('cycle_delivery_compliance', { p_cycle_id: cycleId });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Record<string, unknown>) ?? null;
}

export interface PortalMember {
  requirement_id: string;
  member_number: string;
  member_title: string;
  member_status: string;
  member_done: boolean;
}

/**
 * Los tickets que componen cada requerimiento agrupado de este cliente.
 *
 * El cliente creó esos tickets y quiere saber en qué van, aunque el crédito
 * y el plazo sean del entregable. Se muestran plegados debajo, sin días ni
 * plazo propios: esos se enseñan una sola vez, en el requerimiento.
 *
 * El filtro por organización va en la consulta, no en memoria: este servicio
 * usa service_role y no pasa por RLS.
 */
export async function getPortalMembers(
  organizationId: string,
): Promise<Record<string, PortalMember[]>> {
  const svc = serviceClient();

  const { data } = await svc
    .from('requirement_members')
    .select(
      'requirement_id, member_number, member_title, member_status, member_done',
    )
    .eq('organization_id', organizationId)
    .order('member_number');

  const porReq: Record<string, PortalMember[]> = {};
  for (const row of (data ?? []) as unknown as PortalMember[]) {
    (porReq[row.requirement_id] ??= []).push(row);
  }
  return porReq;
}

/** El catálogo de fases, para rotular el avance en el portal. */
export async function getPhaseCatalog(): Promise<
  Array<{ phase: string; name: string; owner: string; sort_order: number }>
> {
  const svc = serviceClient();

  const { data } = await svc
    .from('delivery_phases')
    .select('phase, name, owner, sort_order')
    .order('sort_order');

  return (data ?? []) as unknown as Array<{
    phase: string;
    name: string;
    owner: string;
    sort_order: number;
  }>;
}
