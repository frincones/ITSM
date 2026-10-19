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
  organizationId?: string | null,
): Promise<DomainResult<Record<EffortSize, number>>> {
  const { actor, client } = ctx;

  const { data, error } = await client
    .from('effort_conversion')
    .select('size, points, organization_id')
    .eq('tenant_id', actor.tenantId)
    .is('effective_to', null);

  if (error) return fail(error.message, 'internal');

  const rows = (data ?? []) as unknown as Array<{
    size: EffortSize;
    points: number;
    organization_id: string | null;
  }>;

  if (!rows.length) {
    return fail(
      'No hay escala de esfuerzo configurada para este tenant',
      'not_found',
    );
  }

  // PRECEDENCIA EXPLÍCITA. Desde 00080 pueden coexistir la escala general del
  // tenant (organization_id NULL) y la pactada con una organización, porque
  // las tres organizaciones comparten tenant y el Anexo C solo rige para
  // Podenza.
  //
  // Un bucle que asignara sin mirar el origen dependería del orden que
  // devuelva la base, que no está garantizado: el mismo ítem podría
  // estimarse con una escala u otra entre dos llamadas. Y estimar un ítem de
  // un cliente con la tabla pactada con otro es facturar de más o de menos.
  const scale = {} as Record<EffortSize, number>;

  for (const row of rows) {
    if (row.organization_id === null) scale[row.size] = row.points;
  }
  // Lo pactado con la organización gana, y se aplica después para sobrescribir
  // la escala general solo en las tallas que el contrato define.
  if (organizationId) {
    for (const row of rows) {
      if (row.organization_id === organizationId) scale[row.size] = row.points;
    }
  }

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

  // El ticket se carga ANTES de la escala, al contrario que antes de 00080:
  // desde esa migración la escala depende de la organización del ítem, así
  // que hay que saber de quién es antes de poder convertir la talla.
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

  // La escala de SU organización: Podenza factura por el Anexo C (S=1 M=2
  // L=4) y el resto por la escala general del tenant.
  const scaleResult = await getEffortScale(ctx, row.organization_id);
  if (scaleResult.error !== null) return fail(scaleResult.error, scaleResult.code);

  const points = scaleResult.data[size];

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

// ---------------------------------------------------------------------------
// Fases del contrato (Anexo C)
// ---------------------------------------------------------------------------
// El SLA por fases es un mecanismo distinto del SLA de respuesta de soporte,
// sobre otro tipo de trabajo. Las funciones de abajo leen las de 00076-00079 y
// no tocan nada de support_cycle_* (00047-00063), que mide la respuesta de
// soporte y cuyo crédito ya se factura.
//
// El CHECK `tickets_phase_only_project` (00076) garantiza que una fase solo
// puede existir en un ticket de tipo backlog/desarrollo_pendiente, así que
// nada de aquí puede alcanzar una fila de soporte.

/** Las diez fases del Anexo C, en orden de recorrido. */
export const REQUIREMENT_PHASES = [
  'propuesto',
  'levantamiento',
  'documentacion',
  // El cliente aprueba el documento. Separada de `documentacion` porque son
  // dos relojes de dueños distintos: lo que TDX tarda en redactar y lo que el
  // cliente tarda en aprobar. Antes iban juntas y no se podía demostrar de
  // quién fue la demora.
  'aprobacion',
  'accesos',
  'desarrollo',
  'uat',
  'despliegue',
  'entregado',
  'descartado',
] as const;
export type RequirementPhase = (typeof REQUIREMENT_PHASES)[number];

/** De quién es el reloj mientras un ítem está en una fase. */
export const PHASE_OWNERS = ['tdx', 'cliente', 'tercero', 'ninguno'] as const;
export type PhaseOwner = (typeof PHASE_OWNERS)[number];

/**
 * Motivos de pausa. Reutiliza el catálogo de 00048 en vez de crear otro: sus
 * seis valores ya mapean a cláusulas del contrato.
 *
 * `priorizacion_interna` registra la espera pero NO descuenta días, porque
 * aparcar algo por decisión propia no es atraso de nadie más.
 */
export const PAUSE_REASONS = [
  'espera_cliente_info',
  'espera_cliente_validacion',
  'dependencia_tercero',
  'ventana_mantenimiento',
  'fuerza_mayor',
  'priorizacion_interna',
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

/** El catálogo de fases: orden, responsable y si su atraso cuesta dinero. */
export async function listPhases(
  ctx: DomainContext,
): Promise<DomainResult<Array<Record<string, unknown>>>> {
  const { client, actor } = ctx;

  const { data, error } = await client
    .from('delivery_phases')
    .select('phase, sort_order, name, owner, generates_credit, is_terminal')
    .eq('tenant_id', actor.tenantId)
    .order('sort_order');

  if (error) return fail(error.message, 'internal');
  return ok((data ?? []) as Array<Record<string, unknown>>);
}

/**
 * Mueve un requerimiento de fase.
 *
 * No se valida la secuencia a propósito: un ítem puede volver de UAT a
 * desarrollo (una devolución), saltarse accesos si no hacen falta, o
 * descartarse desde cualquier punto. El trigger de 00077 registra el tramo
 * pase lo que pase, y el histórico es el que manda.
 */
export async function setPhase(
  ctx: DomainContext,
  ticketId: string,
  phase: RequirementPhase | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client, actor } = ctx;

  const { data: existing } = await client
    .from('tickets')
    .select('id, type, requirement_phase, organization_id')
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!existing) return fail('Requerimiento no encontrado', 'not_found');

  const t = existing as { type: string; requirement_phase: string | null };

  // El CHECK de la base lo impediría igual, pero un mensaje que dice qué pasó
  // es mejor que uno que cita una restricción.
  if (phase !== null && !BACKLOG_TYPES.includes(t.type as never)) {
    return fail(
      `Las fases son del trabajo de proyecto; este ticket es de tipo '${t.type}'`,
      'invalid_input',
    );
  }

  const { data, error } = await client
    .from('tickets')
    .update({ requirement_phase: phase })
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .select('id, ticket_number, requirement_phase')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** Los tramos de fase de un requerimiento, con sus días netos y su plazo. */
export async function getPhaseSla(
  ctx: DomainContext,
  ticketId: string,
): Promise<DomainResult<Array<Record<string, unknown>>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('ticket_phase_sla', {
    p_ticket_id: ticketId,
  });

  if (error) return fail(error.message, 'internal');
  return ok((data ?? []) as Array<Record<string, unknown>>);
}

/** El atraso de un requerimiento, separado por responsable. */
export async function getRequirementDelay(
  ctx: DomainContext,
  ticketId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('requirement_delay', {
    p_ticket_id: ticketId,
  });

  if (error) return fail(error.message, 'internal');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('Requerimiento no encontrado', 'not_found');
  return ok(row as Record<string, unknown>);
}

/** Qué rompió plazo en un ciclo y de quién es, ordenado por exposición. */
export async function getCycleBreaches(
  ctx: DomainContext,
  cycleId: string,
): Promise<DomainResult<Array<Record<string, unknown>>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('cycle_sla_breaches', {
    p_cycle_id: cycleId,
  });

  if (error) return fail(error.message, 'internal');
  return ok((data ?? []) as Array<Record<string, unknown>>);
}

/**
 * El cumplimiento de entrega del ciclo y el descuento aplicable.
 *
 * La misma función que lee el portal del cliente, para que los números no
 * puedan discrepar. Sin plan de entrega vigente devuelve `discount_cop` en
 * null y lo explica en `basis`, en vez de calcular con un valor inventado.
 */
export async function getDeliveryCompliance(
  ctx: DomainContext,
  cycleId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('cycle_delivery_compliance', {
    p_cycle_id: cycleId,
  });

  if (error) return fail(error.message, 'internal');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('Ciclo no encontrado', 'not_found');
  return ok(row as Record<string, unknown>);
}

/** Las cifras de cabecera de una organización: días por responsable. */
export async function getDelaySummary(
  ctx: DomainContext,
  organizationId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('organization_delay_summary', {
    p_organization_id: organizationId,
  });

  if (error) return fail(error.message, 'internal');
  const row = Array.isArray(data) ? data[0] : data;
  return ok((row ?? {}) as Record<string, unknown>);
}

/** Las esperas sin cerrar: la bandeja del PM. */
export async function listOpenWaits(
  ctx: DomainContext,
  options: { organization_id?: string | null; project_id?: string | null } = {},
): Promise<DomainResult<Array<Record<string, unknown>>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('open_phase_waits', {
    p_organization_id: options.organization_id ?? undefined,
    p_project_id: options.project_id ?? undefined,
  });

  if (error) return fail(error.message, 'internal');
  return ok((data ?? []) as Array<Record<string, unknown>>);
}

/** Registra que se pidió algo y se está esperando. */
export async function openWait(
  ctx: DomainContext,
  input: {
    ticket_id: string;
    what: string;
    owed_by: 'cliente' | 'tercero' | 'tdx';
    reason: PauseReason;
    owed_by_name?: string | null;
    target_minutes?: number | null;
    previous_wait_id?: string | null;
  },
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  if (!input.what?.trim()) {
    return fail('Hay que decir qué se está esperando', 'invalid_input');
  }

  const { data, error } = await client.rpc('open_phase_wait', {
    p_ticket_id: input.ticket_id,
    p_what: input.what.trim(),
    p_owed_by: input.owed_by,
    p_reason: input.reason,
    p_owed_by_name: input.owed_by_name ?? undefined,
    p_target_minutes: input.target_minutes ?? undefined,
    p_previous_wait_id: input.previous_wait_id ?? undefined,
    p_actor_agent_id: ctx.actor.agentId ?? undefined,
  });

  if (error) {
    // La función lanza con mensajes en español ya listos para mostrar.
    if (error.code === 'P0001') return fail(error.message, 'invalid_input');
    return fail(error.message, 'internal');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('No se pudo registrar la espera', 'internal');
  return ok(row as Record<string, unknown>);
}

/**
 * El botón "ya llegó": cierra la espera y descuenta sus días del reloj.
 *
 * `return_what` abre el turno de vuelta en la misma operación, invirtiendo
 * quién debe. Es el ida y vuelta de la fase de documentación: al recibir los
 * comentarios del cliente, la pelota vuelve a nuestro campo.
 */
export async function closeWait(
  ctx: DomainContext,
  input: {
    wait_id: string;
    note?: string | null;
    received_at?: string | null;
    return_what?: string | null;
  },
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('close_phase_wait', {
    p_wait_id: input.wait_id,
    p_note: input.note ?? undefined,
    p_received_at: input.received_at ?? undefined,
    p_open_return_wait: input.return_what ?? undefined,
    p_actor_agent_id: ctx.actor.agentId ?? undefined,
  });

  if (error) {
    if (error.code === 'P0001') return fail(error.message, 'invalid_input');
    return fail(error.message, 'internal');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('No se pudo cerrar la espera', 'internal');
  return ok(row as Record<string, unknown>);
}

/**
 * Los requerimientos de un proyecto con su fase y su atraso.
 *
 * Una sola consulta en vez de N llamadas a requirement_delay: la pantalla
 * lista decenas de ítems y hacer una ida y vuelta por cada uno se nota.
 */
export async function listRequirements(
  ctx: DomainContext,
  options: { project_id?: string | null; organization_id?: string | null } = {},
): Promise<DomainResult<Array<Record<string, unknown>>>> {
  const { client, actor } = ctx;

  let q = client
    .from('tickets')
    .select(
      'id, ticket_number, title, status, type, requirement_phase, effort_size, ' +
        'effort_points, delivery_cycle_id, project_id, organization_id, created_at',
    )
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .not('requirement_phase', 'is', null);

  if (options.project_id) q = q.eq('project_id', options.project_id);
  if (options.organization_id) q = q.eq('organization_id', options.organization_id);

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return fail(error.message, 'internal');

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return ok([]);

  // El atraso de cada uno. Se piden en paralelo porque son lecturas
  // independientes y el número de ítems de un proyecto es manejable.
  const delays = await Promise.all(
    rows.map(async (r) => {
      const { data: d } = await client.rpc('requirement_delay', {
        p_ticket_id: r.id as string,
      });
      const row = Array.isArray(d) ? d[0] : d;
      return { id: r.id as string, delay: (row ?? {}) as Record<string, unknown> };
    }),
  );

  const byId = new Map(delays.map((d) => [d.id, d.delay]));
  return ok(rows.map((r) => ({ ...r, delay: byId.get(r.id as string) ?? {} })));
}

// ---------------------------------------------------------------------------
// Agrupación en requerimientos facturables
// ---------------------------------------------------------------------------
// El contrato factura por entregable; el trabajo entra como tickets. Siete
// filtros pueden valer 2 créditos entre todos, y un ítem valer 2 él solo.
//
// Tres reglas (00081):
//   1. El crédito y la fase viven en el padre; los miembros van a 0.
//   2. El padre es un ticket nuevo de tipo desarrollo_pendiente.
//   3. Un ticket sin padre es su propio entregable.
//
// La tercera es la que hace que agrupar sea opcional: lo individual sigue
// funcionando sin tocar nada.

/** Un miembro de un requerimiento agrupado. */
export interface RequirementMember {
  member_id: string;
  member_number: string;
  member_title: string;
  member_type: string;
  member_status: string;
  member_done: boolean;
  /** Este miembro consume cuota de soporte además de los créditos del padre. */
  member_consumes_quota: boolean;
}

/**
 * Agrupa tickets bajo un requerimiento nuevo.
 *
 * Los miembros CONSERVAN su tipo, así que uno de tipo support seguirá
 * consumiendo cuota de soporte además de los créditos del padre. Es una
 * decisión deliberada del equipo —para que planificar no sea reclasificar—
 * y la interfaz lo advierte antes de confirmar.
 */
export async function groupTickets(
  ctx: DomainContext,
  input: {
    child_ids: string[];
    title: string;
    size: EffortSize;
    cycle_id?: string | null;
    project_id?: string | null;
  },
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  if (!input.child_ids?.length) {
    return fail('Hay que elegir al menos un ticket para agrupar', 'invalid_input');
  }
  if (!input.title?.trim()) {
    return fail('El requerimiento necesita un nombre', 'invalid_input');
  }

  const { data, error } = await client.rpc('group_tickets_into_requirement', {
    p_child_ids: input.child_ids,
    p_title: input.title.trim(),
    p_size: input.size,
    p_cycle_id: input.cycle_id ?? undefined,
    p_project_id: input.project_id ?? undefined,
    p_actor_agent_id: ctx.actor.agentId ?? undefined,
  });

  if (error) {
    // La función lanza con mensajes en español, ya listos para mostrar.
    if (error.code === 'P0001') return fail(error.message, 'invalid_input');
    return fail(error.message, 'internal');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('No se pudo crear el requerimiento', 'internal');
  return ok(row as Record<string, unknown>);
}

/**
 * Deshace un requerimiento agrupado.
 *
 * Los miembros vuelven al backlog sin crédito ni fase. El padre NO se borra:
 * si ya pasó por fases, su histórico de tramos y esperas es la trazabilidad
 * del entregable.
 */
export async function ungroupRequirement(
  ctx: DomainContext,
  parentId: string,
): Promise<DomainResult<{ released: number }>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('ungroup_requirement', {
    p_parent_id: parentId,
    p_actor_agent_id: ctx.actor.agentId ?? undefined,
  });

  if (error) {
    if (error.code === 'P0001') return fail(error.message, 'invalid_input');
    return fail(error.message, 'internal');
  }

  return ok({ released: Number(data ?? 0) });
}

/**
 * Cambia la talla de un requerimiento, y con ella sus créditos.
 *
 * Solo admin: afecta a lo que se factura. Y solo con el ciclo abierto — una
 * cifra ya facturada no se recalcula. Las dos reglas las impone la base, no
 * esta capa.
 */
export async function resizeRequirement(
  ctx: DomainContext,
  ticketId: string,
  size: EffortSize,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client } = ctx;

  const { data, error } = await client.rpc('resize_requirement', {
    p_ticket_id: ticketId,
    p_size: size,
    p_actor_agent_id: ctx.actor.agentId ?? undefined,
  });

  if (error) {
    if (error.code === 'P0001') return fail(error.message, 'forbidden');
    return fail(error.message, 'internal');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail('No se pudo re-estimar el requerimiento', 'internal');
  return ok(row as Record<string, unknown>);
}

/** Los tickets que componen un requerimiento, con su avance. */
export async function listMembers(
  ctx: DomainContext,
  parentId: string,
): Promise<DomainResult<RequirementMember[]>> {
  const { client } = ctx;

  const { data, error } = await client
    .from('requirement_members')
    .select(
      'member_id, member_number, member_title, member_type, member_status, ' +
        'member_done, member_consumes_quota',
    )
    .eq('requirement_id', parentId)
    .order('member_number');

  if (error) return fail(error.message, 'internal');
  return ok((data ?? []) as unknown as RequirementMember[]);
}

/**
 * Los miembros de varios requerimientos de una vez.
 *
 * La pantalla lista decenas de entregables; pedir los miembros de cada uno
 * por separado sería una consulta por fila.
 */
export async function listMembersBulk(
  ctx: DomainContext,
  parentIds: string[],
): Promise<DomainResult<Record<string, RequirementMember[]>>> {
  const { client } = ctx;
  if (!parentIds.length) return ok({});

  const { data, error } = await client
    .from('requirement_members')
    .select(
      'requirement_id, member_id, member_number, member_title, member_type, ' +
        'member_status, member_done, member_consumes_quota',
    )
    .in('requirement_id', parentIds)
    .order('member_number');

  if (error) return fail(error.message, 'internal');

  const porPadre: Record<string, RequirementMember[]> = {};
  for (const row of (data ?? []) as unknown as Array<
    RequirementMember & { requirement_id: string }
  >) {
    (porPadre[row.requirement_id] ??= []).push(row);
  }
  return ok(porPadre);
}

/**
 * Cuántos tickets de una selección consumen cuota de soporte.
 *
 * Alimenta el aviso del diálogo de agrupar: un miembro de tipo support,
 * incident o request seguirá contando en la cuota mensual además de los
 * créditos del entregable. El PM debería verlo antes de confirmar, porque es
 * un peso en la factura.
 */
export async function quotaImpactOf(
  ctx: DomainContext,
  ticketIds: string[],
): Promise<DomainResult<{ total: number; consumes: number; types: string[] }>> {
  const { client, actor } = ctx;
  if (!ticketIds.length) return ok({ total: 0, consumes: 0, types: [] });

  const { data, error } = await client
    .from('tickets')
    .select('id, type')
    .in('id', ticketIds)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);

  if (error) return fail(error.message, 'internal');

  const rows = (data ?? []) as unknown as Array<{ type: string }>;
  // Los mismos tres tipos que ticket_type_consumes_quota() en 00048. Se
  // repiten aquí para no pagar una llamada por ticket; si esa lista cambia
  // en la base, hay que cambiarla también aquí.
  const CONSUMEN = ['support', 'incident', 'request'];
  const consumen = rows.filter((r) => CONSUMEN.includes(r.type));

  return ok({
    total: rows.length,
    consumes: consumen.length,
    types: [...new Set(consumen.map((r) => r.type))],
  });
}

/**
 * Los ENTREGABLES de un ciclo, con su fase, su avance y su atraso.
 *
 * No sirve `listBacklog` para esto, y de ahí venía el defecto de que el
 * planning dijera "Asignado 17" sobre una lista vacía:
 *
 *   · filtra por BACKLOG_TYPES, así que un entregable de tipo `warranty`
 *     —reusado del soporte— quedaba fuera;
 *   · devuelve los tickets planos, así que un grupo de 7 salía como 7 filas
 *     en vez de un entregable.
 *
 * Aquí se excluyen los miembros de un grupo y se trae lo que la pantalla
 * necesita para pintar una tarjeta: cuántos de sus tickets van listos, en
 * qué fase está y cuántos días debe cada parte.
 */
export async function listCycleItems(
  ctx: DomainContext,
  cycleId: string,
): Promise<DomainResult<Array<Record<string, unknown>>>> {
  const { client, actor } = ctx;

  const { data, error } = await client
    .from('tickets')
    .select(
      // tags alimenta el filtro de etiqueta del tablero. Es una columna más
      // del mismo SELECT, así que no cuesta una consulta.
      'id, ticket_number, title, status, type, requirement_phase, effort_size, ' +
        'effort_points, organization_id, assigned_agent_id, tags, created_at',
    )
    .eq('tenant_id', actor.tenantId)
    .eq('delivery_cycle_id', cycleId)
    .is('deleted_at', null)
    .not('status', 'in', '(proposed,cancelled)')
    .order('effort_points', { ascending: false });

  if (error) return fail(error.message, 'internal');
  const filas = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (!filas.length) return ok([]);

  const ids = filas.map((f) => f.id as string);

  // Antes esto servía para ESCONDER a los miembros de un grupo, y ese
  // filtro rompía la gestión: 13 de los 21 tickets del ciclo no eran
  // tarjetas, así que no se podían abrir, comentar ni asignar.
  //
  // El motivo de traerlos todos es operativo: dentro de un entregable cada
  // ticket puede estar asignado a un desarrollador distinto, y cada uno
  // tiene que poder moverlo por su cuenta.
  //
  // EL RELOJ NO SE REPARTE. Un miembro tiene fase para saber dónde está y
  // quién lo lleva, pero el plazo contractual es del ENTREGABLE: el Anexo C
  // pacta días por entregable, no por ticket. Verificado que un miembro con
  // 40 días de atraso no mueve un peso del descuento, porque
  // cycle_sla_breaches los excluye y sus effort_points son 0.
  const { data: rel } = await client
    .from('ticket_relations')
    .select('ticket_id, related_ticket_id')
    .eq('relation_type', 'child')
    .in('related_ticket_id', ids);

  const padreDe = new Map<string, string>();
  for (const r of (rel ?? []) as Array<{ ticket_id: string; related_ticket_id: string }>) {
    padreDe.set(r.related_ticket_id, r.ticket_id);
  }

  const entregables = ids.filter((id) => !padreDe.has(id));

  const [miembrosRes, retrasos, agentes] = await Promise.all([
    listMembersBulk(ctx, entregables),
    // Solo se pide el atraso de los ENTREGABLES: son los únicos con plazo
    // contractual, y pedirlo para los 21 serían 13 llamadas inútiles.
    Promise.all(
      entregables.map(async (id) => {
        const { data: d } = await client.rpc('requirement_delay', { p_ticket_id: id });
        const row = Array.isArray(d) ? d[0] : d;
        return { id, delay: (row ?? {}) as Record<string, unknown> };
      }),
    ),
    client
      .from('agents')
      .select('id, name, avatar_url')
      .eq('tenant_id', actor.tenantId)
      .eq('is_active', true),
  ]);

  const miembros = miembrosRes.error === null ? miembrosRes.data : {};
  const porId = new Map(retrasos.map((r) => [r.id, r.delay]));
  const agente = new Map(
    ((agentes.data ?? []) as Array<{ id: string; name: string; avatar_url: string | null }>).map(
      (a) => [a.id, { name: a.name, avatar_url: a.avatar_url }],
    ),
  );
  const titulos = new Map(filas.map((f) => [f.id as string, f.title as string]));

  return ok(
    filas.map((f) => {
      const id = f.id as string;
      const padre = padreDe.get(id) ?? null;
      const ms = miembros[id] ?? [];
      const ag = f.assigned_agent_id ? agente.get(f.assigned_agent_id as string) : null;
      return {
        ...f,
        // null = es un entregable y lleva el reloj; con valor = es miembro
        // de ese grupo y el reloj lo lleva su padre.
        parent_id: padre,
        parent_title: padre ? (titulos.get(padre) ?? null) : null,
        is_deliverable: padre === null,
        members: ms,
        member_count: ms.length,
        members_done: ms.filter((m) => m.member_done).length,
        // Vacío en los miembros, a propósito: su tarjeta no pinta semáforo.
        delay: porId.get(id) ?? {},
        assignee_name: ag?.name ?? null,
        assignee_avatar: ag?.avatar_url ?? null,
      };
    }),
  );
}

/**
 * Todo lo que el panel lateral necesita de un ticket, en una llamada.
 *
 * Cinco consultas en paralelo en vez de cinco idas y vueltas desde el
 * navegador: el panel se abre al hacer clic y la latencia se nota.
 *
 * Sirve igual para un entregable que para uno de sus miembros, porque el
 * checklist y los comentarios son DEL TICKET: cada miembro lleva los suyos.
 */
export async function getCardDetail(
  ctx: DomainContext,
  ticketId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client, actor } = ctx;

  const { data: t } = await client
    .from('tickets')
    .select(
      'id, ticket_number, title, description, status, type, requirement_phase, ' +
        'effort_size, effort_points, organization_id, project_id, delivery_cycle_id, ' +
        'assigned_agent_id, created_at',
    )
    .eq('id', ticketId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!t) return fail('Requerimiento no encontrado', 'not_found');

  const [tareas, comentarios, miembros, tramos, esperas, seguidores, plantel, padre] =
    await Promise.all([
    // El checklist: pasos internos que no necesitan su propio ticket.
    client
      .from('ticket_tasks')
      .select('id, title, status, assigned_agent_id, due_date, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at'),

    // La conversación. Son los MISMOS followups que muestra
    // /home/tickets/[id]: una sola conversación, dos ventanas.
    client
      .from('ticket_followups')
      .select('id, content, is_private, author_type, author_id, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(50),

    listMembers(ctx, ticketId),
    getPhaseSla(ctx, ticketId),

    client
      .from('phase_waits')
      .select('id, what, owed_by, owed_by_name, reason, requested_at, received_at, target_minutes')
      .eq('ticket_id', ticketId)
      .order('requested_at', { ascending: false }),

    // Seguidores y plantel, para asignar y notificar sin salir del panel.
    // Se consultan con el cliente del usuario, no con el de servicio: el
    // panel no debe ver más de lo que vería en /home/tickets/[id].
    client
      .from('ticket_followers')
      .select('agent_id, added_reason, is_auto, agent:agents(id, name, email, avatar_url, user_id)')
      .eq('ticket_id', ticketId)
      .order('added_at'),

    client
      .from('agents')
      .select('id, name, email, avatar_url, role')
      .eq('tenant_id', actor.tenantId)
      .eq('is_active', true)
      .order('name'),

    // Si es miembro de un grupo, el panel lo dice: el plazo es del padre.
    client
      .from('ticket_relations')
      .select('ticket_id')
      .eq('related_ticket_id', ticketId)
      .eq('relation_type', 'child')
      .maybeSingle(),
  ]);

  let padreInfo: Record<string, unknown> | null = null;
  if (padre.data?.ticket_id) {
    const { data: pt } = await client
      .from('tickets')
      .select('id, ticket_number, title, effort_size, effort_points')
      .eq('id', padre.data.ticket_id)
      .maybeSingle();
    padreInfo = (pt as Record<string, unknown>) ?? null;
  }

  // El nombre de quien escribió cada comentario. author_id apunta a
  // auth.users, no a agents, así que se resuelve por user_id.
  const autores = [
    ...new Set(
      ((comentarios.data ?? []) as Array<{ author_id: string | null }>)
        .map((f) => f.author_id)
        .filter(Boolean) as string[],
    ),
  ];

  const nombres = new Map<string, string>();
  if (autores.length) {
    const { data: ags } = await client
      .from('agents')
      .select('user_id, name')
      .in('user_id', autores);
    for (const a of (ags ?? []) as Array<{ user_id: string; name: string }>) {
      nombres.set(a.user_id, a.name);
    }
  }

  return ok({
    ticket: t,
    tasks: tareas.data ?? [],
    comments: ((comentarios.data ?? []) as Array<Record<string, unknown>>).map((f) => ({
      ...f,
      author_name: nombres.get(String(f.author_id)) ?? null,
    })),
    members: miembros.error === null ? miembros.data : [],
    phases: tramos.error === null ? tramos.data : [],
    waits: esperas.data ?? [],
    followers: ((seguidores.data ?? []) as Array<Record<string, unknown>>).map((f) => {
      const a = (f.agent ?? {}) as Record<string, unknown>;
      return {
        agent_id: f.agent_id,
        name: a.name ?? null,
        email: a.email ?? null,
        avatar_url: a.avatar_url ?? null,
        user_id: a.user_id ?? null,
        added_reason: f.added_reason ?? null,
        is_auto: f.is_auto ?? false,
      };
    }),
    agents: plantel.data ?? [],
    current_agent_id: actor.agentId ?? null,
    parent: padreInfo,
  });
}

/** Marca una tarea del checklist como hecha o pendiente. */
export async function toggleTask(
  ctx: DomainContext,
  taskId: string,
  done: boolean,
): Promise<DomainResult<Record<string, unknown>>> {
  const { client, actor } = ctx;

  // `status` es texto libre en ticket_tasks (00004), y el resto de la
  // aplicación usa 'done' / 'pending'.
  const { data, error } = await client
    .from('ticket_tasks')
    .update({ status: done ? 'done' : 'pending' })
    .eq('id', taskId)
    .eq('tenant_id', actor.tenantId)
    .select('id, title, status')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** Borra una tarea del checklist. */
export async function deleteTask(
  ctx: DomainContext,
  taskId: string,
): Promise<DomainResult<{ deleted: boolean }>> {
  const { client, actor } = ctx;

  const { error } = await client
    .from('ticket_tasks')
    .delete()
    .eq('id', taskId)
    .eq('tenant_id', actor.tenantId);

  if (error) return fail(error.message, 'internal');
  return ok({ deleted: true });
}

/** Marcador observado por lib/mcp/server.ts para evitar el tree-shaking. */
export const __deliveryDomainLoaded = true;
