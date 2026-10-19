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
  PAUSE_REASONS,
  REQUIREMENT_PHASES,
  closeWait as domainCloseWait,
  getCycleBreaches as domainCycleBreaches,
  getDelaySummary as domainDelaySummary,
  getDeliveryCompliance as domainDeliveryCompliance,
  getPhaseSla as domainGetPhaseSla,
  getRequirementDelay as domainRequirementDelay,
  listOpenWaits as domainListOpenWaits,
  listPhases as domainListPhases,
  listRequirements as domainListRequirements,
  openWait as domainOpenWait,
  setPhase as domainSetPhase,
  groupTickets as domainGroupTickets,
  listMembers as domainListMembers,
  quotaImpactOf as domainQuotaImpact,
  resizeRequirement as domainResize,
  ungroupRequirement as domainUngroup,
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
    organization_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        'La escala pactada con esta organización, si tiene una. Sin este parámetro se devuelve la escala general del tenant, que NO es la que se factura a un cliente con escala propia.',
      ),
  }),
  meta: { since: '1.2.0', tags: ['projects', 'read'] },
  async handler(ctx, input) {
    const scale = unwrap(
      await domainGetScale(toDomainContext(ctx), input.organization_id ?? null),
    );
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

// ---------------------------------------------------------------------------
// Fases del contrato (Anexo C)
// ---------------------------------------------------------------------------
// El SLA por fases es un mecanismo DISTINTO del SLA de respuesta de soporte.
// Para un agente que lea estas descripciones, la diferencia importa:
//
//   sla_* / reports_*          SLA de RESPUESTA de soporte. Mide cuánto se
//                              tarda en contestar un ticket. Su incumplimiento
//                              genera `credit_cop`.
//   phases_* / requirements_*  SLA de ENTREGA por fases de un requerimiento
//                              de proyecto. Su incumplimiento genera un
//                              descuento sobre los créditos del plan.
//
// Confundirlos hace que un agente reporte un descuento de entrega como si
// fuera un crédito de soporte, que son dos cifras distintas de dos contratos
// distintos.
//
// Las fases SOLO existen en tickets de tipo backlog o desarrollo_pendiente: un
// CHECK en la base lo impide para soporte, garantías e incidentes.

registry.register({
  name: 'phases_catalog',
  description:
    'Las fases del contrato con su orden, de quién es el reloj en cada una y si su incumplimiento genera descuento. Solo la fase de desarrollo lo genera: es la única de la que TDX responde contractualmente. Las demás miden el tiempo del cliente o de terceros, que extiende el plazo sin penalización.',
  scope: 'projects:read',
  inputSchema: z.object({}).describe('Sin parámetros: el catálogo es del tenant'),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'read'] },
  async handler(ctx) {
    return { items: unwrap(await domainListPhases(toDomainContext(ctx))) };
  },
});

registry.register({
  name: 'requirements_list',
  description:
    'Requerimientos de proyecto con su fase actual y el reparto de días de atraso por responsable. Devuelve `tdx_minutes`, `cliente_minutes` y `tercero_days` separados a propósito: un item con 11 de espera del cliente y 1 nuestro no está "12 días tarde", y mezclarlos impide saber de quién es el atraso. `exposed_over` es lo único que puede costar dinero.',
  scope: 'projects:read',
  inputSchema: z.object({
    project_id: z.string().uuid().optional(),
    organization_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'read'] },
  async handler(ctx, input) {
    return {
      items: unwrap(
        await domainListRequirements(toDomainContext(ctx), {
          project_id: input.project_id ?? null,
          organization_id: input.organization_id ?? null,
        }),
      ),
    };
  },
});

registry.register({
  name: 'requirements_set_phase',
  description:
    'Mueve un requerimiento a otra fase. No se valida la secuencia a propósito: un item puede volver de UAT a desarrollo (una devolución), saltarse accesos si no hacen falta, o descartarse desde cualquier punto. Cada paso abre un tramo nuevo, así que una devolución SUMA tiempo en vez de sobrescribir el anterior — el contrato mide el total consumido. Pasar la fase a null saca el item del medidor.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    phase: z
      .enum(REQUIREMENT_PHASES)
      .nullable()
      .describe('La fase destino, o null para sacar el item del medidor de fases'),
  }),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(
        await domainSetPhase(toDomainContext(ctx), input.ticket_id, input.phase),
      ),
    };
  },
});

registry.register({
  name: 'requirements_phase_sla',
  description:
    'Los tramos de fase de un requerimiento con sus días contra el plazo. `net_minutes` descuenta el tiempo en espera, y es la cifra que se compara con el objetivo: es la implementación de la cláusula "los atrasos del cliente extienden el plazo de TDX día por día". Un `target_minutes` nulo significa que esa fase no tiene plazo definido (por ejemplo un despliegue, que depende del calendario de freeze), no que se cumpliera en cero días.',
  scope: 'projects:read',
  inputSchema: z.object({ ticket_id: z.string().uuid() }),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'read'] },
  async handler(ctx, input) {
    return { items: unwrap(await domainGetPhaseSla(toDomainContext(ctx), input.ticket_id)) };
  },
});

registry.register({
  name: 'requirements_delay',
  description:
    'El atraso de un requerimiento separado por responsable, en una sola fila. `exposed_over` es el único campo con consecuencia económica: días de atraso de TDX en una fase que genera descuento. El atraso del cliente aparece en `cliente_over` y no cuesta nada, porque ya extendió nuestro plazo.',
  scope: 'projects:read',
  inputSchema: z.object({ ticket_id: z.string().uuid() }),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'read'] },
  async handler(ctx, input) {
    return {
      item: unwrap(await domainRequirementDelay(toDomainContext(ctx), input.ticket_id)),
    };
  },
});

registry.register({
  name: 'cycles_breaches',
  description:
    'Qué items de un ciclo rompieron plazo y de quién es cada atraso, ordenados por lo que más expone a descuento. Excluye lo propuesto (aún no comprometido) y lo cancelado (fuera de alcance), igual que el resto del cálculo del ciclo.',
  scope: 'projects:read',
  inputSchema: z.object({ cycle_id: z.string().uuid() }),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'read'] },
  async handler(ctx, input) {
    return { items: unwrap(await domainCycleBreaches(toDomainContext(ctx), input.cycle_id)) };
  },
});

registry.register({
  name: 'cycles_delivery_compliance',
  description:
    'Cumplimiento de ENTREGA de un ciclo y el descuento aplicable según el contrato: (valor mensual ÷ créditos del plan) × créditos incumplidos, topado al valor del ciclo. OJO: esto NO es support_cycle_compliance, que mide el SLA de respuesta de soporte y cuyo crédito es otra cifra de otro contrato. Si no hay plan de entrega cargado, `discount_cop` viene nulo y `basis` explica qué falta, en vez de calcular con un valor inventado. `basis` trae en una frase de dónde sale la cifra.',
  scope: 'projects:read',
  inputSchema: z.object({ cycle_id: z.string().uuid() }),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'billing', 'read'] },
  async handler(ctx, input) {
    return {
      item: unwrap(await domainDeliveryCompliance(toDomainContext(ctx), input.cycle_id)),
    };
  },
});

registry.register({
  name: 'organizations_delay_summary',
  description:
    'Las cifras de cabecera del atraso de un cliente: días de cada parte, créditos expuestos y esperas abiertas. Cuenta solo requerimientos vivos — lo entregado y lo descartado ya no consumen reloj.',
  scope: 'projects:read',
  inputSchema: z.object({ organization_id: z.string().uuid() }),
  meta: { since: '1.5.0', tags: ['projects', 'phases', 'read'] },
  async handler(ctx, input) {
    return {
      item: unwrap(await domainDelaySummary(toDomainContext(ctx), input.organization_id)),
    };
  },
});

registry.register({
  name: 'waits_list',
  description:
    'Las esperas sin cerrar, ordenadas por antigüedad: qué se pidió, a quién y cuántos días hábiles lleva. Es la bandeja del PM. `pauses_clock` en false significa que la espera se registró pero NO descuenta días, lo que ocurre con el motivo priorizacion_interna: aparcar algo por decisión propia no es atraso de nadie más.',
  scope: 'projects:read',
  inputSchema: z.object({
    organization_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.5.0', tags: ['projects', 'waits', 'read'] },
  async handler(ctx, input) {
    return {
      items: unwrap(
        await domainListOpenWaits(toDomainContext(ctx), {
          organization_id: input.organization_id ?? null,
          project_id: input.project_id ?? null,
        }),
      ),
    };
  },
});

registry.register({
  name: 'waits_open',
  description:
    'Registra que se pidió algo y se está esperando. Mientras la espera siga abierta, los días corren a cargo de quien se indique en owed_by y, salvo con el motivo priorizacion_interna, se descuentan del plazo de TDX al cerrarla. El texto de `what` lo lee el cliente en su portal, así que conviene escribirlo en sus palabras ("las credenciales del API del banco"), no en jerga interna.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    what: z.string().min(1).max(500).describe('Qué se pidió, en palabras que el cliente entienda'),
    owed_by: z
      .enum(['cliente', 'tercero', 'tdx'])
      .describe('De quién se espera: determina a quién se imputan los días'),
    reason: z
      .enum(PAUSE_REASONS)
      .describe(
        'El motivo contractual. Obligatorio: sin él la pausa no se puede defender ante el cliente. priorizacion_interna registra la espera sin descontar días.',
      ),
    owed_by_name: z
      .string()
      .max(200)
      .optional()
      .describe('A quién concretamente, cuando se sabe (una persona, un banco, un proveedor)'),
    target_minutes: z
      .number()
      .positive()
      .max(365)
      .optional()
      .describe('Plazo del turno en MINUTOS hábiles. Por defecto 480, que es una jornada de 8 horas'),
    previous_wait_id: z
      .string()
      .uuid()
      .optional()
      .describe('La espera anterior de la misma conversación, para encadenar los turnos'),
  }),
  meta: { since: '1.5.0', tags: ['projects', 'waits', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(
        await domainOpenWait(toDomainContext(ctx), {
          ticket_id: input.ticket_id,
          what: input.what,
          owed_by: input.owed_by,
          reason: input.reason,
          owed_by_name: input.owed_by_name ?? null,
          target_minutes: input.target_minutes ?? null,
          previous_wait_id: input.previous_wait_id ?? null,
        }),
      ),
    };
  },
});

registry.register({
  name: 'waits_close',
  description:
    'El "ya llegó": cierra la espera, calcula los días hábiles que costó y los descuenta del plazo de la fase. Con `return_what` abre el turno de vuelta en la misma operación invirtiendo quién debe, que es lo que ocurre de verdad cuando llegan los comentarios del cliente: la pelota vuelve a nuestro campo. `received_at` admite una fecha pasada, porque la llegada se suele registrar después de ocurrir; nunca antes de haberse pedido.',
  scope: 'projects:write',
  inputSchema: z.object({
    wait_id: z.string().uuid(),
    note: z.string().max(1000).optional().describe('Qué llegó exactamente'),
    received_at: z
      .string()
      .datetime()
      .optional()
      .describe('Cuándo llegó de verdad, si no fue ahora'),
    return_what: z
      .string()
      .max(500)
      .optional()
      .describe('Si se rellena, abre el turno de vuelta con la espera a cargo de la otra parte'),
  }),
  meta: { since: '1.5.0', tags: ['projects', 'waits', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(
        await domainCloseWait(toDomainContext(ctx), {
          wait_id: input.wait_id,
          note: input.note ?? null,
          received_at: input.received_at ?? null,
          return_what: input.return_what ?? null,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// Agrupación en requerimientos facturables
// ---------------------------------------------------------------------------

registry.register({
  name: 'requirements_group',
  description:
    'Agrupa varios tickets bajo un requerimiento facturable nuevo. El contrato factura por entregable, no por ticket: siete filtros pueden valer 2 créditos entre todos. El padre se crea como desarrollo_pendiente con la talla indicada, y los miembros pasan a 0 créditos y sin fase, porque el crédito y el plazo son del entregable. OJO: los miembros CONSERVAN su tipo, así que uno de tipo support, incident o request seguirá consumiendo cuota de soporte además de los créditos del padre — usa requirements_quota_impact antes para saber cuántos.',
  scope: 'projects:write',
  inputSchema: z.object({
    child_ids: z
      .array(z.string().uuid())
      .min(1)
      .max(50)
      .describe('Los tickets que componen el entregable. Todos de la misma organización'),
    title: z.string().min(1).max(300).describe('Nombre del entregable, no de uno de sus tickets'),
    size: z
      .enum(EFFORT_SIZES)
      .describe('La talla del ENTREGABLE completo, no la suma de sus partes'),
    cycle_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.6.0', tags: ['projects', 'grouping', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(
        await domainGroupTickets(toDomainContext(ctx), {
          child_ids: input.child_ids,
          title: input.title,
          size: input.size,
          cycle_id: input.cycle_id ?? null,
          project_id: input.project_id ?? null,
        }),
      ),
    };
  },
});

registry.register({
  name: 'requirements_ungroup',
  description:
    'Deshace un requerimiento agrupado. Los miembros vuelven al backlog sin crédito ni fase, y habrá que re-estimarlos si salen por su cuenta. NO borra ningún ticket: el padre queda vacío y es el equipo quien decide si lo cancela, porque si ya pasó por fases su histórico de tramos y esperas es la trazabilidad del entregable.',
  scope: 'projects:write',
  inputSchema: z.object({ parent_id: z.string().uuid() }),
  meta: { since: '1.6.0', tags: ['projects', 'grouping', 'write'] },
  async handler(ctx, input) {
    return { item: unwrap(await domainUngroup(toDomainContext(ctx), input.parent_id)) };
  },
});

registry.register({
  name: 'requirements_members',
  description:
    'Los tickets que componen un requerimiento, con si ya están listos y si consumen cuota de soporte. `member_done` explica por qué un entregable sigue abierto: mientras falte uno, el entregable no está entregado y su plazo corre.',
  scope: 'projects:read',
  inputSchema: z.object({ parent_id: z.string().uuid() }),
  meta: { since: '1.6.0', tags: ['projects', 'grouping', 'read'] },
  async handler(ctx, input) {
    return { items: unwrap(await domainListMembers(toDomainContext(ctx), input.parent_id)) };
  },
});

registry.register({
  name: 'requirements_resize',
  description:
    'Cambia la talla de un requerimiento y con ella sus créditos. SOLO un administrador puede hacerlo, porque afecta a lo que se factura, y solo mientras el ciclo esté abierto: una cifra ya facturada no se recalcula. No sirve para un miembro de un grupo — el crédito es del padre.',
  scope: 'projects:write',
  inputSchema: z.object({
    ticket_id: z.string().uuid(),
    size: z.enum(EFFORT_SIZES),
  }),
  meta: { since: '1.6.0', tags: ['projects', 'grouping', 'billing', 'write'] },
  async handler(ctx, input) {
    return {
      item: unwrap(await domainResize(toDomainContext(ctx), input.ticket_id, input.size)),
    };
  },
});

registry.register({
  name: 'requirements_quota_impact',
  description:
    'Cuántos de los tickets indicados seguirán consumiendo cuota de soporte si se agrupan. Conviene llamarla ANTES de requirements_group: un miembro de tipo support, incident o request cuenta en los dos contadores —la cuota mensual de soporte y los créditos del entregable—, y eso es un peso en la factura que quien agrupa debería conocer.',
  scope: 'projects:read',
  inputSchema: z.object({
    ticket_ids: z.array(z.string().uuid()).min(1).max(50),
  }),
  meta: { since: '1.6.0', tags: ['projects', 'grouping', 'billing', 'read'] },
  async handler(ctx, input) {
    return { item: unwrap(await domainQuotaImpact(toDomainContext(ctx), input.ticket_ids)) };
  },
});

/** Marcador observado por lib/mcp/server.ts para evitar el tree-shaking. */
export const __deliveryToolsLoaded = true;
