// ---------------------------------------------------------------------------
// Server Actions — gestión de proyectos (backlog, ciclos, capacidad, intake)
// ---------------------------------------------------------------------------
// Delegan en lib/domain/delivery.domain.ts, igual que hacen las de tickets.
// La lógica no se duplica aquí: la interfaz, el MCP y un agente interno
// ejecutan exactamente el mismo camino, que es el motivo de que exista la
// capa de dominio.
//
// Lo único propio de este archivo es resolver quién llama y con qué permisos,
// porque eso sí depende del canal.
// ---------------------------------------------------------------------------

'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  type EffortSize,
  type TimeOffKind,
  acceptProposal as domainAcceptProposal,
  addTimeOff as domainAddTimeOff,
  assignToCycle as domainAssignToCycle,
  assignToProject as domainAssignToProject,
  closeCycle as domainCloseCycle,
  copyCapacity as domainCopyCapacity,
  createCycle as domainCreateCycle,
  estimateItem as domainEstimate,
  getCapacity as domainGetCapacity,
  getCycleStatus as domainCycleStatus,
  listBacklog as domainListBacklog,
  listProposals as domainListProposals,
  rejectProposal as domainRejectProposal,
  setCapacity as domainSetCapacity,
} from '~/lib/domain/delivery.domain';
import type { DomainContext } from '~/lib/domain/types';

type ActionResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: string };

/**
 * Resuelve el contexto de dominio desde la sesión del navegador.
 *
 * Solo personal: planificar y estimar compromete capacidad del equipo. Un
 * usuario de cliente propone desde el portal, que es otro camino.
 */
async function staffContext(): Promise<
  { ctx: DomainContext; error: null } | { ctx: null; error: string }
> {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ctx: null, error: 'No autenticado' };

  const { data: agentRow } = await client
    .from('agents')
    .select('id, tenant_id, role, name, email, is_active')
    .eq('user_id', user.id)
    .single();

  if (!agentRow) return { ctx: null, error: 'No hay un agente asociado a esta cuenta' };

  const agent = agentRow as unknown as {
    id: string;
    tenant_id: string;
    role: string;
    email: string | null;
    is_active: boolean | null;
  };

  if (agent.is_active === false) return { ctx: null, error: 'Agente inactivo' };
  if (!['admin', 'supervisor', 'agent'].includes(agent.role)) {
    return { ctx: null, error: 'Solo el equipo puede gestionar proyectos' };
  }

  return {
    ctx: {
      actor: {
        tenantId: agent.tenant_id,
        agentId: agent.id,
        userId: user.id,
        role: agent.role,
        email: agent.email,
        // El personal no se restringe por organización: la función
        // is_staff_agent() del RLS ya les da acceso a todos los clientes.
        organizationIds: null,
        channel: 'ui',
      },
      client,
    },
    error: null,
  };
}

/** Envuelve una llamada al dominio en el formato que espera la interfaz. */
async function run<T>(
  fn: (ctx: DomainContext) => Promise<{ data: T; error: null } | { data: null; error: string }>,
  revalidate?: string,
): Promise<ActionResult<T>> {
  const auth = await staffContext();
  if (auth.error !== null) return { data: null, error: auth.error };

  const result = await fn(auth.ctx);
  if (result.error !== null) return { data: null, error: result.error };

  if (revalidate) revalidatePath(revalidate);
  return { data: result.data, error: null };
}

const RUTA = '/home/delivery';

// ---------------------------------------------------------------------------
// Backlog
// ---------------------------------------------------------------------------

export async function listBacklogAction(filters: {
  project_id?: string | null;
  unassigned?: boolean;
  estimated?: boolean | null;
  limit?: number;
}) {
  return run((ctx) => domainListBacklog(ctx, filters));
}

export async function estimateItemAction(ticketId: string, size: EffortSize) {
  return run((ctx) => domainEstimate(ctx, ticketId, size), RUTA);
}

export async function assignToProjectAction(ticketId: string, projectId: string | null) {
  return run((ctx) => domainAssignToProject(ctx, ticketId, projectId), RUTA);
}

// ---------------------------------------------------------------------------
// Ciclos
// ---------------------------------------------------------------------------

export async function createCycleAction(
  projectId: string,
  fields: {
    cycle_number: number;
    name?: string | null;
    starts_on: string;
    ends_on: string;
    committed_points?: number | null;
  },
) {
  return run((ctx) => domainCreateCycle(ctx, projectId, fields), RUTA);
}

export async function assignToCycleAction(ticketId: string, cycleId: string | null) {
  return run((ctx) => domainAssignToCycle(ctx, ticketId, cycleId), RUTA);
}

export async function cycleStatusAction(cycleId: string) {
  return run((ctx) => domainCycleStatus(ctx, cycleId));
}

export async function closeCycleAction(cycleId: string, notes?: string | null) {
  return run((ctx) => domainCloseCycle(ctx, cycleId, notes ?? null), RUTA);
}

// ---------------------------------------------------------------------------
// Capacidad
// ---------------------------------------------------------------------------

export async function capacityAction(cycleId: string) {
  return run((ctx) => domainGetCapacity(ctx, cycleId));
}

export async function setCapacityAction(
  cycleId: string,
  agentId: string,
  hoursPerDay: number,
  overheadHours = 0,
) {
  return run(
    (ctx) => domainSetCapacity(ctx, cycleId, agentId, hoursPerDay, overheadHours),
    RUTA,
  );
}

export async function copyCapacityAction(fromCycleId: string, toCycleId: string) {
  return run((ctx) => domainCopyCapacity(ctx, fromCycleId, toCycleId), RUTA);
}

export async function addTimeOffAction(
  agentId: string,
  startsOn: string,
  endsOn: string,
  kind: TimeOffKind = 'vacation',
  notes?: string | null,
) {
  return run(
    (ctx) => domainAddTimeOff(ctx, agentId, startsOn, endsOn, kind, notes ?? null),
    RUTA,
  );
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export async function listProposalsAction(organizationId?: string | null) {
  return run((ctx) => domainListProposals(ctx, organizationId ?? null));
}

export async function acceptProposalAction(
  ticketId: string,
  options: { size?: EffortSize | null; cycle_id?: string | null; project_id?: string | null } = {},
) {
  return run((ctx) => domainAcceptProposal(ctx, ticketId, options), RUTA);
}

export async function rejectProposalAction(ticketId: string, reason?: string | null) {
  return run((ctx) => domainRejectProposal(ctx, ticketId, reason ?? null), RUTA);
}
