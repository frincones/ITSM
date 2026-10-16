// ---------------------------------------------------------------------------
// MCP — gestión de proyectos: backlog y esfuerzo (Fase 1)
// ---------------------------------------------------------------------------
// El backlog de un proyecto son tickets de tipo `backlog` y
// `desarrollo_pendiente`, no una entidad aparte. Estas herramientas los leen y
// los estiman; las de tickets siguen sirviendo para todo lo demás.
//
// Nota de vocabulario para quien lea las descripciones: "puntos de esfuerzo"
// NO son los "créditos" que aparecen en el reporte de ciclo. Aquellos
// (`credit_cop`, `credit_tickets`) son el descuento en pesos por incumplir el
// SLA. Si un agente mezcla ambos, reporta un descuento como si fuera trabajo.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  EFFORT_SIZES,
  assignToProject as domainAssign,
  estimateItem as domainEstimate,
  getEffortScale as domainGetScale,
  getProjectEffort as domainProjectEffort,
  listBacklog as domainListBacklog,
  assignToCycle as domainAssignToCycle,
  closeCycle as domainCloseCycle,
  createCycle as domainCreateCycle,
  getCycleHistory as domainCycleHistory,
  getCycleStatus as domainCycleStatus,
  listCycles as domainListCycles,
  TIME_OFF_KINDS,
  acceptProposal as domainAcceptProposal,
  addTimeOff as domainAddTimeOff,
  copyCapacity as domainCopyCapacity,
  getCapacity as domainGetCapacity,
  listProposals as domainListProposals,
  rejectProposal as domainRejectProposal,
  setCapacity as domainSetCapacity,
} from '~/lib/domain/delivery.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

registry.register({
  name: 'backlog_list',
  description:
    'Items de backlog de un proyecto, con su talla y puntos de esfuerzo. El backlog son tickets de tipo backlog o desarrollo_pendiente: trabajo capturado que todavía no consume cupo del contrato. Los items sin estimar se cuentan aparte en vez de sumar como cero, porque "faltan 8 por estimar" es una conversación distinta de "el proyecto pesa 40 puntos".',
  scope: 'projects:read',
  inputSchema: z.object({
    project_id: z.string().uuid().optional(),
    unassigned: z
      .boolean()
      .optional()
      .describe('Solo items que todavía no pertenecen a ningún proyecto'),
    organization_id: z.string().uuid().optional(),
    estimated: z
      .boolean()
      .optional()
      .describe('true = solo estimados, false = solo pendientes de estimar'),
    limit: z.number().int().min(1).max(500).default(100),
  }),
  meta: { since: '1.2.0', tags: ['projects', 'backlog', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainListBacklog(toDomainContext(ctx), {
        project_id: input.project_id ?? null,
        unassigned: input.unassigned,
        organization_id: input.organization_id ?? null,
        estimated: input.estimated ?? null,
        limit: input.limit,
      }),
    );
  },
});

registry.register({
  name: 'backlog_estimate',
  description:
    'Asigna una talla (S/M/L/XL) a un item y congela sus puntos de esfuerzo según la escala vigente. Los puntos se guardan, no se recalculan al leer: recalibrar la escala no debe alterar lo que ya se comprometió con un cliente.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    size: z.enum(EFFORT_SIZES),
  }),
  meta: { since: '1.2.0', tags: ['projects', 'backlog', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(await domainEstimate(toDomainContext(ctx), input.ticket_id, input.size)),
    };
  },
});

registry.register({
  name: 'backlog_assign_project',
  description:
    'Mueve un item dentro o fuera de un proyecto. Pasar project_id en null lo devuelve al backlog general — nunca lo borra. El item y el proyecto deben pertenecer al mismo cliente.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    project_id: z
      .string()
      .uuid()
      .nullable()
      .describe('null devuelve el item al backlog general'),
  }),
  meta: { since: '1.2.0', tags: ['projects', 'backlog', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(await domainAssign(toDomainContext(ctx), input.ticket_id, input.project_id)),
    };
  },
});

registry.register({
  name: 'projects_effort',
  description:
    'Esfuerzo acumulado de un proyecto: puntos totales, entregados y pendientes, más cuántos items faltan por estimar. La garantía se reporta aparte porque no consume cupo del contrato. No compara contra un cupo contratado: el cupo que existe hoy cuenta tickets, no puntos, y cruzarlos daría un porcentaje sin significado.',
  scope: 'projects:read',
  inputSchema: z.object({ project_id: z.string().uuid() }),
  meta: { since: '1.2.0', tags: ['projects', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainProjectEffort(toDomainContext(ctx), input.project_id));
  },
});

registry.register({
  name: 'effort_scale',
  description:
    'La escala vigente de conversión talla → puntos de esfuerzo del tenant. Útil antes de estimar, para saber cuánto pesa cada talla.',
  scope: 'projects:read',
  // Un inputSchema vacío hace que el cliente descarte el catálogo entero, así
  // que este parámetro no es decorativo: `include_examples` devuelve además
  // qué significa cada talla, que es la pregunta siguiente de quien estima.
  inputSchema: z.object({
    include_examples: z
      .boolean()
      .default(false)
      .describe('Añade una descripción de qué tipo de trabajo cabe en cada talla'),
  }),
  meta: { since: '1.2.0', tags: ['projects', 'read'] },
  async handler(ctx, input) {
    const scale = unwrap(await domainGetScale(toDomainContext(ctx)));
    if (!input.include_examples) return { scale };
    return {
      scale,
      guidance: {
        S: 'Un ajuste acotado: un campo, un texto, una corrección pequeña.',
        M: 'Una historia completa con su prueba. La talla más común.',
        L: 'Varias historias relacionadas, o una con integración externa.',
        XL: 'Suficientemente grande como para plantearse partirla antes de comprometerla.',
      },
    };
  },
});


// ---------------------------------------------------------------------------
// Ciclos de entrega (Fase 2)
// ---------------------------------------------------------------------------
// Aviso de vocabulario, porque aquí hay dos "ciclos" y confundirlos sale caro:
//
//   delivery_cycle  — lo que el equipo se compromete a entregar. Es esto.
//   support_cycle   — el ciclo de FACTURACIÓN del contrato, con corte el día
//                     22. Se consulta con las herramientas de reportes y NO
//                     se toca desde aquí.
//
// Un agente que confunda uno con otro reportará como entregado un periodo de
// facturación, o al revés.

registry.register({
  name: 'cycles_list',
  description:
    'Ciclos de entrega de un proyecto, del más reciente al más antiguo. Son los ciclos de COMPROMISO del equipo, no los de facturación del contrato: para el cupo mensual y el consumo usa las herramientas de reportes.',
  scope: 'projects:read',
  inputSchema: z.object({ project_id: z.string().uuid() }),
  meta: { since: '1.3.0', tags: ['projects', 'cycles', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainListCycles(toDomainContext(ctx), input.project_id));
  },
});

registry.register({
  name: 'cycles_create',
  description:
    'Crea un ciclo de entrega. committed_points es lo que el contrato compromete para ese ciclo en puntos de esfuerzo — no son los créditos de descuento por SLA incumplido. El número de ciclo es único dentro del proyecto.',
  scope: 'projects:write',
  inputSchema: z.object({
    project_id: z.string().uuid(),
    cycle_number: z.number().int().min(1),
    name: z.string().trim().max(120).optional(),
    starts_on: dateOnly,
    ends_on: dateOnly,
    committed_points: z.number().int().min(0).optional(),
  }),
  meta: { since: '1.3.0', tags: ['projects', 'cycles', 'write'] },
  async handler(ctx, input) {
    const { project_id, ...fields } = input;
    return {
      cycle: unwrap(await domainCreateCycle(toDomainContext(ctx), project_id, fields)),
    };
  },
});

registry.register({
  name: 'cycles_assign_item',
  description:
    'Compromete un item del backlog a un ciclo, o lo devuelve al backlog pasando cycle_id en null — nunca lo borra. El item y el ciclo deben ser del mismo proyecto, y un ciclo cerrado no admite movimientos. Cada movimiento queda registrado automáticamente.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    cycle_id: z
      .string()
      .uuid()
      .nullable()
      .describe('null devuelve el item al backlog general'),
  }),
  meta: { since: '1.3.0', tags: ['projects', 'cycles', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(
        await domainAssignToCycle(toDomainContext(ctx), input.ticket_id, input.cycle_id),
      ),
    };
  },
});

registry.register({
  name: 'cycles_status',
  description:
    'Estado de un ciclo: puntos comprometidos, asignados, entregados y pendientes, más cuántos items faltan por estimar. over_commitment en true significa que lo asignado supera lo comprometido. Entregado cuenta solo lo que llegó a resolved o closed: comprometer no es entregar.',
  scope: 'projects:read',
  inputSchema: z.object({ cycle_id: z.string().uuid() }),
  meta: { since: '1.3.0', tags: ['projects', 'cycles', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainCycleStatus(toDomainContext(ctx), input.cycle_id));
  },
});

registry.register({
  name: 'cycles_close',
  description:
    'Cierra un ciclo y sella lo entregado. Los puntos entregados se congelan en ese momento: un ciclo cerrado muestra lo que se entregó entonces, no lo que diría recalcularlo hoy. Después del cierre sus items ya no se mueven.',
  scope: 'projects:write',
  inputSchema: z.object({
    cycle_id: z.string().uuid(),
    notes: z.string().max(2000).optional(),
  }),
  meta: { since: '1.3.0', tags: ['projects', 'cycles', 'write'] },
  async handler(ctx, input) {
    return {
      cycle: unwrap(
        await domainCloseCycle(toDomainContext(ctx), input.cycle_id, input.notes ?? null),
      ),
    };
  },
});

registry.register({
  name: 'cycles_history',
  description:
    'Qué entró y qué salió de un ciclo, con quién y cuándo — la trazabilidad del refinamiento que pide el proceso. Lo escriben los triggers de la base, así que recoge los movimientos vengan de la interfaz, de un agente o de SQL directo.',
  scope: 'projects:read',
  inputSchema: z.object({ cycle_id: z.string().uuid() }),
  meta: { since: '1.3.0', tags: ['projects', 'cycles', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainCycleHistory(toDomainContext(ctx), input.cycle_id));
  },
});


// ---------------------------------------------------------------------------
// Capacidad del equipo (Fase 3)
// ---------------------------------------------------------------------------

registry.register({
  name: 'capacity_status',
  description:
    'Carga de cada persona en un ciclo: horas disponibles tras descontar festivos, ausencias y overhead, contra las horas ya asignadas. over_allocated marca a quien está por encima de su capacidad. No confundir con support_plan_band, que es la tolerancia comercial del plan contratado y no tiene que ver con horas de personas.',
  scope: 'projects:read',
  inputSchema: z.object({ cycle_id: z.string().uuid() }),
  meta: { since: '1.4.0', tags: ['projects', 'capacity', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainGetCapacity(toDomainContext(ctx), input.cycle_id));
  },
});

registry.register({
  name: 'capacity_set',
  description:
    'Fija la dedicación de una persona a un ciclo. hours_per_day son las horas diarias dedicadas a ESTE ciclo, no la jornada completa: alguien puede repartirse entre varios proyectos. overhead_hours son las horas del ciclo que se van en reuniones, levantamiento o soporte, y se restan de la capacidad.',
  scope: 'projects:write',
  inputSchema: z.object({
    cycle_id: z.string().uuid(),
    agent_id: z.string().uuid(),
    hours_per_day: z.number().min(0.5).max(24),
    overhead_hours: z.number().min(0).max(500).default(0),
  }),
  meta: { since: '1.4.0', tags: ['projects', 'capacity', 'write'] },
  async handler(ctx, input) {
    return {
      capacity: unwrap(
        await domainSetCapacity(
          toDomainContext(ctx),
          input.cycle_id,
          input.agent_id,
          input.hours_per_day,
          input.overhead_hours,
        ),
      ),
    };
  },
});

registry.register({
  name: 'capacity_copy',
  description:
    'Copia la plantilla de capacidad de un ciclo a otro, para no reconfigurar al equipo desde cero cada mes. No pisa lo que el ciclo destino ya tenga configurado.',
  scope: 'projects:write',
  inputSchema: z.object({
    from_cycle_id: z.string().uuid(),
    to_cycle_id: z.string().uuid(),
  }),
  meta: { since: '1.4.0', tags: ['projects', 'capacity', 'write'] },
  async handler(ctx, input) {
    return unwrap(
      await domainCopyCapacity(toDomainContext(ctx), input.from_cycle_id, input.to_cycle_id),
    );
  },
});

registry.register({
  name: 'time_off_add',
  description:
    'Registra una ausencia de una persona. Se descuenta automáticamente de su capacidad en los ciclos que solape, contando solo días hábiles: unas vacaciones que incluyen un fin de semana no restan capacidad por esos días. Los festivos del equipo ya están en el calendario y no hace falta registrarlos aquí.',
  scope: 'projects:write',
  inputSchema: z.object({
    agent_id: z.string().uuid(),
    starts_on: dateOnly,
    ends_on: dateOnly,
    kind: z.enum(TIME_OFF_KINDS).default('vacation'),
    notes: z.string().max(500).optional(),
  }),
  meta: { since: '1.4.0', tags: ['projects', 'capacity', 'write'] },
  async handler(ctx, input) {
    return {
      time_off: unwrap(
        await domainAddTimeOff(
          toDomainContext(ctx),
          input.agent_id,
          input.starts_on,
          input.ends_on,
          input.kind,
          input.notes ?? null,
        ),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// Intake del portal (Fase 4)
// ---------------------------------------------------------------------------

registry.register({
  name: 'proposals_list',
  description:
    'La cola de triage: lo que los clientes han propuesto desde el portal y nadie ha decidido todavía. Una propuesta NO consume cupo del contrato ni cuenta en el esfuerzo del ciclo hasta que se acepta — ese es el punto de que exista esta cola.',
  scope: 'projects:read',
  inputSchema: z.object({
    organization_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.4.0', tags: ['projects', 'intake', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainListProposals(toDomainContext(ctx), input.organization_id ?? null),
    );
  },
});

registry.register({
  name: 'proposals_accept',
  description:
    'Acepta una propuesta y la convierte en item del backlog, congelando sus puntos según la talla. Es la decisión económica del proceso: aquí se le pone precio a lo que el cliente pidió. Solo el equipo puede hacerlo, aunque la propuesta sea del propio cliente, porque aceptar compromete capacidad.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    size: z.enum(EFFORT_SIZES).optional(),
    cycle_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.4.0', tags: ['projects', 'intake', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(
        await domainAcceptProposal(toDomainContext(ctx), input.ticket_id, {
          size: input.size ?? null,
          cycle_id: input.cycle_id ?? null,
          project_id: input.project_id ?? null,
        }),
      ),
    };
  },
});

registry.register({
  name: 'proposals_reject',
  description:
    'Rechaza una propuesta dejándola cancelada con su motivo. No la borra: el cliente debe poder ver qué pasó con lo que pidió, y por qué.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    reason: z.string().max(1000).optional(),
  }),
  meta: { since: '1.4.0', tags: ['projects', 'intake', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(
        await domainRejectProposal(toDomainContext(ctx), input.ticket_id, input.reason ?? null),
      ),
    };
  },
});

/** Marcador observado por lib/mcp/server.ts para evitar el tree-shaking. */
export const __deliveryToolsLoaded = true;
