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
} from '~/lib/domain/delivery.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';

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

/** Marcador observado por lib/mcp/server.ts para evitar el tree-shaking. */
export const __deliveryToolsLoaded = true;
