// ---------------------------------------------------------------------------
// Gestión de proyectos — entrega y esfuerzo (Fase 1)
// ---------------------------------------------------------------------------
// Une el backlog, que ya vive como tickets, con los proyectos, que ya viven
// como `projects`. Lo único nuevo es la unidad de esfuerzo.
//
// Por qué el backlog son tickets y no una tabla aparte
// ----------------------------------------------------
// Ya existen 16 items reales de Podenza y Prosuministros como tickets de tipo
// `backlog` y `desarrollo_pendiente`, y la exclusión de cuota de `warranty`
// —"la garantía no suma créditos" del PRD— ya está implementada en SQL y
// gobierna la facturación de 323 tickets. Una tabla paralela obligaría a
// reconciliar dos backlogs a mano y a reimplementar esa regla.
//
// Vocabulario: "puntos", nunca "créditos"
// ---------------------------------------
// En esta base `credit_cop` y `credit_tickets` significan el descuento en
// pesos por incumplir el SLA, y esa palabra ya salió en reportes entregados al
// cliente. El esfuerzo del PRD es otra cosa. La interfaz puede rotularlo
// "Créditos" de cara al cliente; aquí se llama `effort_points`.
// ---------------------------------------------------------------------------

import 'server-only';

import {
  fail,
  ok,
  resolveOrgScope,
  type DomainContext,
  type DomainResult,
} from './types';

/** Tallas del PRD. El orden es el de magnitud, no alfabético. */
export const EFFORT_SIZES = ['S', 'M', 'L', 'XL'] as const;
export type EffortSize = (typeof EFFORT_SIZES)[number];

/**
 * Tipos de ticket que forman el backlog de un proyecto.
 *
 * Son los que `ticket_type_consumes_quota()` deja fuera del cupo: trabajo que
 * todavía no se comprometió a un ciclo. Añadir aquí un tipo que SÍ consume
 * cuota metería soporte corriente en el backlog del proyecto.
 */
export const BACKLOG_TYPES = ['backlog', 'desarrollo_pendiente'] as const;

// ---------------------------------------------------------------------------
// Conversión talla → puntos
// ---------------------------------------------------------------------------

/**
 * Lee la escala vigente del tenant.
 *
 * Se consulta en cada estimación en vez de cachearse: cambiarla es una
 * decisión comercial poco frecuente, y una caché serviría puntos obsoletos
 * justo después de recalibrar, que es cuando más importa acertar.
 */
export async function getEffortScale(
  ctx: DomainContext,
): Promise<DomainResult<Record<EffortSize, number>>> {
  const { actor, client } = ctx;

  const { data, error } = await client
    .from('effort_conversion')
    .select('size, points')
    .eq('tenant_id', actor.tenantId)
    .is('effective_to', null);

  if (error) return fail(error.message, 'internal');

  const rows = (data ?? []) as Array<{ size: EffortSize; points: number }>;
  if (!rows.length) {
    return fail(
      'No hay escala de esfuerzo configurada para este tenant',
      'not_found',
    );
  }

  const scale = {} as Record<EffortSize, number>;
  for (const row of rows) scale[row.size] = row.points;

  const missing = EFFORT_SIZES.filter((s) => scale[s] === undefined);
  if (missing.length) {
    return fail(
      `La escala de esfuerzo está incompleta: falta ${missing.join(', ')}`,
      'internal',
    );
  }

  return ok(scale);
}

// ---------------------------------------------------------------------------
// Estimación
// ---------------------------------------------------------------------------

/**
 * Asigna talla a un item y congela sus puntos.
 *
 * Los puntos se guardan, no se derivan al leer. El PRD lo pide explícitamente
 * y la razón es contractual: recalibrar la escala no puede cambiar lo que ya
 * se comprometió con un cliente. Es el mismo principio por el que
 * `support_cycle_closures` congela un ciclo cerrado en vez de recalcularlo.
 */
export async function estimateItem(
  ctx: DomainContext,
  ticketId: string,
  size: EffortSize,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const scaleResult = await getEffortScale(ctx);
  if (scaleResult.error !== null) return fail(scaleResult.error, scaleResult.code);

  const points = scaleResult.data[size];

  const { data: ticket } = await client
    .from('tickets')
    .select('id, type, organization_id')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!ticket) return fail('Ticket no encontrado', 'not_found');

  const orgScope = resolveOrgScope(actor, null);
  const row = ticket as { organization_id: string | null };
  if (orgScope && row.organization_id && !orgScope.includes(row.organization_id)) {
    return fail('Sin acceso a este ticket', 'forbidden');
  }

  const { data, error } = await client
    .from('tickets')
    .update({ effort_size: size, effort_points: points })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select('id, ticket_number, title, type, effort_size, effort_points, project_id')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/**
 * Mueve un item dentro o fuera de un proyecto.
 *
 * `projectId: null` lo devuelve al backlog general — nunca lo borra, que es
 * un criterio de aceptación explícito del PRD ("un item que sale de un ciclo
 * regresa al backlog general").
 */
export async function assignToProject(
  ctx: DomainContext,
  ticketId: string,
  projectId: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: ticket } = await client
    .from('tickets')
    .select('id, organization_id')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!ticket) return fail('Ticket no encontrado', 'not_found');

  if (projectId !== null) {
    const { data: project } = await client
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
      .eq('tenant_id', actor.tenantId)
      .maybeSingle();

    if (!project) return fail('Proyecto no encontrado', 'not_found');

    // Un item y su proyecto tienen que ser del mismo cliente. Sin esta
    // comprobación, el backlog de Podenza podría acabar colgando de un
    // proyecto de Prosuministros y contaminando sus números.
    const t = ticket as { organization_id: string | null };
    const p = project as { organization_id: string | null };
    if (t.organization_id && p.organization_id && t.organization_id !== p.organization_id) {
      return fail(
        'El ticket y el proyecto pertenecen a organizaciones distintas',
        'invalid_input',
      );
    }
  }

  const { data, error } = await client
    .from('tickets')
    .update({ project_id: projectId })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select('id, ticket_number, title, project_id, effort_size, effort_points')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Backlog de un proyecto
// ---------------------------------------------------------------------------

export interface BacklogFilters {
  project_id?: string | null;
  /** Sin proyecto asignado todavía. Excluyente con project_id. */
  unassigned?: boolean;
  organization_id?: string | null;
  estimated?: boolean | null;
  limit?: number;
}

/**
 * Items de backlog, con su estimación.
 *
 * Filtra por los tipos del backlog, no por estado: un item puede estar en
 * progreso y seguir siendo parte del alcance del proyecto.
 */
export async function listBacklog(
  ctx: DomainContext,
  filters: BacklogFilters = {},
): Promise<DomainResult<{ items: unknown[]; totals: Record<string, number> }>> {
  const { actor, client } = ctx;

  let query = client
    .from('tickets')
    .select(
      'id, ticket_number, title, type, status, urgency, priority, organization_id, project_id, effort_size, effort_points, assigned_agent_id, created_at, updated_at',
    )
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .in('type', BACKLOG_TYPES)
    .order('created_at', { ascending: false })
    .limit(Math.min(filters.limit ?? 100, 500));

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) query = query.in('organization_id', orgScope);

  if (filters.project_id) {
    query = query.eq('project_id', filters.project_id);
  } else if (filters.unassigned) {
    query = query.is('project_id', null);
  }

  if (filters.estimated === true) query = query.not('effort_points', 'is', null);
  if (filters.estimated === false) query = query.is('effort_points', null);

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');

  const items = (data ?? []) as Array<{
    effort_points: number | null;
    effort_size: string | null;
  }>;

  // Los no estimados se cuentan aparte en vez de sumar como cero: "faltan 8
  // por estimar" es una conversación distinta de "el proyecto pesa 40 puntos".
  const estimated = items.filter((i) => i.effort_points !== null);

  return ok({
    items: data ?? [],
    totals: {
      items: items.length,
      estimated: estimated.length,
      unestimated: items.length - estimated.length,
      points: estimated.reduce((sum, i) => sum + (i.effort_points ?? 0), 0),
    },
  });
}

/**
 * Resumen de esfuerzo de un proyecto.
 *
 * Lo que NO hace: comparar contra un cupo contratado. El cupo que existe hoy
 * (`monthly_ticket_quota`) cuenta TICKETS, no puntos, así que cruzarlos daría
 * un porcentaje sin significado. Ese cruce es de la Fase 2, cuando el ciclo
 * tenga pertenencia explícita y un cupo en puntos.
 */
export async function getProjectEffort(
  ctx: DomainContext,
  projectId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: project } = await client
    .from('projects')
    .select('id, name, status, organization_id, contract_id')
    .eq('id', projectId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!project) return fail('Proyecto no encontrado', 'not_found');

  const { data, error } = await client
    .from('tickets')
    .select('id, type, status, effort_size, effort_points')
    .eq('tenant_id', actor.tenantId)
    .eq('project_id', projectId)
    .is('deleted_at', null);

  if (error) return fail(error.message, 'internal');

  const rows = (data ?? []) as Array<{
    type: string;
    status: string;
    effort_points: number | null;
  }>;

  const sum = (f: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(f).reduce((acc, r) => acc + (r.effort_points ?? 0), 0);

  const DONE = ['resolved', 'closed'];

  return ok({
    project,
    items: rows.length,
    points_total: sum(() => true),
    points_done: sum((r) => DONE.includes(r.status)),
    points_pending: sum((r) => !DONE.includes(r.status)),
    // La garantía se reporta aparte porque no consume cupo: mezclarla con el
    // resto inflaría el esfuerzo facturable del proyecto.
    points_warranty: sum((r) => r.type === 'warranty'),
    unestimated: rows.filter((r) => r.effort_points === null).length,
  });
}


// ---------------------------------------------------------------------------
// Ciclos de entrega (Fase 2)
// ---------------------------------------------------------------------------
// El ciclo de ENTREGA es lo que el equipo se compromete a entregar. No es el
// ciclo de FACTURACIÓN de `support_cycle_for()`, que se ancla al contrato con
// corte el día 22 y no se toca desde aquí.
//
// Antes de esto la pertenencia a un ciclo se derivaba de `created_at`, así que
// un item no se podía mover sin falsear su fecha de creación. Ahora es una
// columna explícita, y cada movimiento queda registrado por un trigger.
// ---------------------------------------------------------------------------

export const CYCLE_STATUSES = ['planned', 'active', 'closed'] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export interface CycleFields {
  cycle_number: number;
  name?: string | null;
  starts_on: string;
  ends_on: string;
  committed_points?: number | null;
}

/** Ciclos de un proyecto, del más reciente al más antiguo. */
export async function listCycles(
  ctx: DomainContext,
  projectId: string,
): Promise<DomainResult<{ cycles: unknown[] }>> {
  const { actor, client } = ctx;

  const { data, error } = await client
    .from('delivery_cycles')
    .select('*')
    .eq('tenant_id', actor.tenantId)
    .eq('project_id', projectId)
    .order('cycle_number', { ascending: false });

  if (error) return fail(error.message, 'internal');
  return ok({ cycles: data ?? [] });
}

export async function createCycle(
  ctx: DomainContext,
  projectId: string,
  fields: CycleFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (fields.ends_on < fields.starts_on) {
    return fail('La fecha de fin no puede ser anterior a la de inicio', 'invalid_input');
  }

  const { data: project } = await client
    .from('projects')
    .select('id, tenant_id')
    .eq('id', projectId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!project) return fail('Proyecto no encontrado', 'not_found');

  const { data, error } = await client
    .from('delivery_cycles')
    .insert({
      tenant_id: actor.tenantId,
      project_id: projectId,
      cycle_number: fields.cycle_number,
      name: fields.name ?? null,
      starts_on: fields.starts_on,
      ends_on: fields.ends_on,
      committed_points: fields.committed_points ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // El índice único (project_id, cycle_number) es lo que impide dos
    // "Ciclo 3" en el mismo proyecto; el mensaje de Postgres no se entiende.
    if (error.code === '23505') {
      return fail(`Ya existe el ciclo ${fields.cycle_number} en este proyecto`, 'conflict');
    }
    return fail(error.message, 'internal');
  }

  return ok(data as Record<string, unknown>);
}

/**
 * Mueve un item dentro o fuera de un ciclo.
 *
 * `cycleId: null` lo devuelve al backlog general — nunca lo borra, que es
 * criterio de aceptación del PRD.
 *
 * Un ciclo cerrado no admite movimientos: el PRD pide que lo ya entregado
 * quede inamovible, igual que un ciclo de facturación cerrado.
 */
export async function assignToCycle(
  ctx: DomainContext,
  ticketId: string,
  cycleId: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: ticket } = await client
    .from('tickets')
    .select('id, organization_id, project_id, delivery_cycle_id, effort_points')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!ticket) return fail('Ticket no encontrado', 'not_found');

  const t = ticket as {
    project_id: string | null;
    delivery_cycle_id: string | null;
  };

  // Sacar de un ciclo cerrado tampoco: el histórico no se reescribe.
  if (t.delivery_cycle_id) {
    const { data: actual } = await client
      .from('delivery_cycles')
      .select('status, cycle_number')
      .eq('id', t.delivery_cycle_id)
      .maybeSingle();
    const a = actual as { status: string; cycle_number: number } | null;
    if (a?.status === 'closed') {
      return fail(
        `El ciclo ${a.cycle_number} está cerrado; sus items no se mueven`,
        'conflict',
      );
    }
  }

  if (cycleId !== null) {
    const { data: cycle } = await client
      .from('delivery_cycles')
      .select('id, project_id, status, cycle_number')
      .eq('id', cycleId)
      .eq('tenant_id', actor.tenantId)
      .maybeSingle();

    if (!cycle) return fail('Ciclo no encontrado', 'not_found');

    const c = cycle as { project_id: string; status: string; cycle_number: number };

    if (c.status === 'closed') {
      return fail(`El ciclo ${c.cycle_number} está cerrado`, 'conflict');
    }

    // Un item solo entra en un ciclo de su propio proyecto. Sin esto, el
    // backlog de un cliente podría acabar contando en el ciclo de otro.
    if (t.project_id !== c.project_id) {
      return fail('El item y el ciclo pertenecen a proyectos distintos', 'invalid_input');
    }
  }

  const { data, error } = await client
    .from('tickets')
    .update({ delivery_cycle_id: cycleId })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select('id, ticket_number, title, delivery_cycle_id, effort_points')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** El semáforo del PRD: comprometido contra asignado. */
export async function getCycleStatus(
  ctx: DomainContext,
  cycleId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('delivery_cycle_status', {
    p_cycle_id: cycleId,
  });

  if (error) return fail(error.message, 'internal');

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('Ciclo no encontrado', 'not_found');

  return ok(row as Record<string, unknown>);
}

/**
 * Cierra un ciclo, sellando lo entregado.
 *
 * Los puntos entregados se congelan en la fila, como hace
 * `support_cycle_closures` con la facturación: un ciclo cerrado muestra lo
 * que se entregó entonces, no lo que diría recalcularlo hoy.
 */
export async function closeCycle(
  ctx: DomainContext,
  cycleId: string,
  notes?: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: cycle } = await client
    .from('delivery_cycles')
    .select('id, status, cycle_number')
    .eq('id', cycleId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!cycle) return fail('Ciclo no encontrado', 'not_found');

  const c = cycle as { status: string; cycle_number: number };
  if (c.status === 'closed') {
    return fail(`El ciclo ${c.cycle_number} ya estaba cerrado`, 'conflict');
  }

  const status = await getCycleStatus(ctx, cycleId);
  if (status.error !== null) return fail(status.error, status.code);

  const entregados = Number(status.data.delivered_points ?? 0);

  const { data, error } = await client
    .from('delivery_cycles')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: actor.agentId,
      delivered_points: entregados,
      notes: notes ?? null,
    })
    .eq('id', cycleId)
    .eq('tenant_id', actor.tenantId)
    .select('*')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** Historial de altas y bajas de un ciclo, para el refinamiento. */
export async function getCycleHistory(
  ctx: DomainContext,
  cycleId: string,
): Promise<DomainResult<{ movements: unknown[] }>> {
  const { actor, client } = ctx;

  const { data, error } = await client
    .from('delivery_cycle_history')
    .select('*')
    .eq('tenant_id', actor.tenantId)
    .or(`to_cycle_id.eq.${cycleId},from_cycle_id.eq.${cycleId}`)
    .order('changed_at', { ascending: false })
    .limit(200);

  if (error) return fail(error.message, 'internal');
  return ok({ movements: data ?? [] });
}


// ---------------------------------------------------------------------------
// Capacidad del equipo (Fase 3)
// ---------------------------------------------------------------------------
// Cuidado con un falso amigo: `support_plan_band()` se documenta como
// "capacity band", pero eso es la tolerancia comercial del plan contratado
// —cuándo subir o bajar de tier— y no tiene nada que ver con horas de
// personas. Lo de aquí es la capacidad real del equipo.
// ---------------------------------------------------------------------------

export const TIME_OFF_KINDS = ['vacation', 'sick', 'training', 'other'] as const;
export type TimeOffKind = (typeof TIME_OFF_KINDS)[number];

/** Carga por persona en un ciclo, con festivos y ausencias ya descontados. */
export async function getCapacity(
  ctx: DomainContext,
  cycleId: string,
): Promise<DomainResult<{ agents: unknown[]; totals: Record<string, number> }>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('agent_capacity_status', {
    p_cycle_id: cycleId,
  });

  if (error) return fail(error.message, 'internal');

  const rows = (data ?? []) as Array<{
    available_hours: number | string;
    assigned_hours: number | string;
    over_allocated: boolean;
  }>;

  const num = (v: number | string | null) => Number(v ?? 0);

  return ok({
    agents: rows,
    totals: {
      people: rows.length,
      available_hours: rows.reduce((s, r) => s + num(r.available_hours), 0),
      assigned_hours: rows.reduce((s, r) => s + num(r.assigned_hours), 0),
      over_allocated: rows.filter((r) => r.over_allocated).length,
    },
  });
}

/** Fija la dedicación de una persona a un ciclo. */
export async function setCapacity(
  ctx: DomainContext,
  cycleId: string,
  agentId: string,
  hoursPerDay: number,
  overheadHours = 0,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (hoursPerDay <= 0 || hoursPerDay > 24) {
    return fail('Las horas por día deben estar entre 0 y 24', 'invalid_input');
  }

  const { data: cycle } = await client
    .from('delivery_cycles')
    .select('id, status')
    .eq('id', cycleId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!cycle) return fail('Ciclo no encontrado', 'not_found');
  if ((cycle as { status: string }).status === 'closed') {
    return fail('El ciclo está cerrado', 'conflict');
  }

  const { data, error } = await client
    .from('agent_capacity')
    .upsert(
      {
        tenant_id: actor.tenantId,
        cycle_id: cycleId,
        agent_id: agentId,
        hours_per_day: hoursPerDay,
        overhead_hours: overheadHours,
      },
      { onConflict: 'cycle_id,agent_id' },
    )
    .select('*')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** Copia la plantilla de capacidad de un ciclo al siguiente. */
export async function copyCapacity(
  ctx: DomainContext,
  fromCycleId: string,
  toCycleId: string,
): Promise<DomainResult<{ copied: number }>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('copy_cycle_capacity', {
    p_from_cycle: fromCycleId,
    p_to_cycle: toCycleId,
  });

  if (error) return fail(error.message, 'internal');
  return ok({ copied: Number(data ?? 0) });
}

/** Registra una ausencia. Se descuenta de la capacidad de los ciclos que solape. */
export async function addTimeOff(
  ctx: DomainContext,
  agentId: string,
  startsOn: string,
  endsOn: string,
  kind: TimeOffKind = 'vacation',
  notes?: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (endsOn < startsOn) {
    return fail('La fecha de fin no puede ser anterior a la de inicio', 'invalid_input');
  }

  const { data, error } = await client
    .from('agent_time_off')
    .insert({
      tenant_id: actor.tenantId,
      agent_id: agentId,
      starts_on: startsOn,
      ends_on: endsOn,
      kind,
      notes: notes ?? null,
      created_by: actor.agentId,
    })
    .select('*')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Intake del portal (Fase 4)
// ---------------------------------------------------------------------------
// Las tres capas del PRD: el cliente propone, el equipo decide, y solo lo
// aceptado llega al backlog y consume cupo.
//
// Antes de esto lo que el cliente escribía en el chat del portal entraba
// directo al ciclo: 374 tickets consumieron cuota sin que nadie lo decidiera.
// ---------------------------------------------------------------------------

/** La cola de triage: lo que los clientes han propuesto y nadie ha decidido. */
export async function listProposals(
  ctx: DomainContext,
  organizationId?: string | null,
): Promise<DomainResult<{ proposals: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('tickets')
    .select(
      'id, ticket_number, title, description, type, organization_id, effort_size, effort_points, proposed_at, proposed_by_user_id, created_at',
    )
    .eq('tenant_id', actor.tenantId)
    .eq('status', 'proposed')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);

  const orgScope = resolveOrgScope(actor, organizationId ? [organizationId] : null);
  if (orgScope) query = query.in('organization_id', orgScope);

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');

  return ok({ proposals: data ?? [], total: (data ?? []).length });
}

/**
 * Acepta una propuesta: pasa a backlog con su talla y, opcionalmente, su ciclo.
 *
 * La comprobación de rol vive dentro de la función SQL, que es SECURITY
 * DEFINER: aceptar compromete capacidad del equipo, así que no basta con
 * confiar en que la interfaz no ofrezca el botón.
 */
export async function acceptProposal(
  ctx: DomainContext,
  ticketId: string,
  options: {
    size?: EffortSize | null;
    cycle_id?: string | null;
    project_id?: string | null;
  } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  // El agente va explícito porque por MCP la conexión usa service_role y
  // auth.uid() es NULL: sin esto, un agente con API key nunca podría aceptar.
  // La función sigue comprobando que ese agente tenga rol de equipo.
  const { data, error } = await client.rpc('accept_proposal', {
    p_ticket_id: ticketId,
    p_size: options.size ?? undefined,
    p_cycle_id: options.cycle_id ?? undefined,
    p_project_id: options.project_id ?? undefined,
    p_actor_agent_id: ctx.actor.agentId ?? undefined,
  });

  if (error) {
    // 42501 es el error que lanza la función cuando quien pide no es del
    // equipo; traducirlo evita que suba como un fallo interno.
    if (error.code === '42501') return fail(error.message, 'forbidden');
    if (error.code === 'P0002') return fail('Propuesta no encontrada', 'not_found');
    return fail(error.message, 'invalid_input');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('No se pudo aceptar la propuesta', 'internal');
  return ok(row as Record<string, unknown>);
}

/** Rechaza una propuesta. La cancela con su motivo; nunca la borra. */
export async function rejectProposal(
  ctx: DomainContext,
  ticketId: string,
  reason?: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('reject_proposal', {
    p_ticket_id: ticketId,
    p_reason: reason ?? undefined,
    p_actor_agent_id: ctx.actor.agentId ?? undefined,
  });

  if (error) {
    if (error.code === '42501') return fail(error.message, 'forbidden');
    return fail(error.message, 'internal');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('Propuesta no encontrada o ya decidida', 'not_found');
  return ok(row as Record<string, unknown>);
}

/** Marcador observado por lib/mcp/server.ts para evitar el tree-shaking. */
export const __deliveryDomainLoaded = true;
