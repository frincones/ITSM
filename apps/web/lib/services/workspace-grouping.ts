/**
 * Workspace grouping — pure logic.
 *
 * Takes a flat list of tickets + a grouping mode + filters and returns an
 * ordered list of groups (each with its items). Used by the /home/workspace
 * page to render Linear-style collapsible sections.
 *
 * No IO, no React — so this can be unit-tested and reused.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type GroupingMode = 'smart' | 'client' | 'status' | 'priority' | 'none';

export interface WorkspaceTicket {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  type: string;
  urgency: string;
  priority: number | null;
  created_at: string;
  closed_at: string | null;
  organization_id: string | null;
  assigned_agent_id: string | null;
  requester_email: string | null;
  custom_fields: Record<string, unknown> | null;
  requester: { id: string; name: string; email: string | null } | null;
  assigned_agent: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
  category: { id: string; name: string } | null;
}

export interface Group {
  key: string; // stable id, used for localStorage (collapsed state)
  title: string;
  emoji: string;
  accent: string; // CSS class suffix: 'destructive' | 'amber' | 'emerald' | etc.
  tickets: WorkspaceTicket[];
  defaultCollapsed: boolean;
  description?: string;
}

export interface WorkspaceFilters {
  currentAgentId: string;
  mine: boolean;
  criticalOnly: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HIGH_URGENCY = new Set(['critical', 'high']);
const TERMINAL = new Set(['closed', 'resolved', 'cancelled']);

const URGENCY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Nuevos',
  backlog: 'Backlog',
  assigned: 'Asignados',
  in_progress: 'En Progreso',
  pending: 'Pendientes',
  detenido: 'Detenidos',
  testing: 'Testing',
  resolved: 'Resueltos',
  closed: 'Cerrados',
  cancelled: 'Cancelados',
};

const STATUS_EMOJI: Record<string, string> = {
  new: '🆕',
  backlog: '📦',
  assigned: '👤',
  in_progress: '🟠',
  pending: '🟢',
  detenido: '⏸',
  testing: '🔵',
  resolved: '✅',
  closed: '🔒',
  cancelled: '🚫',
};

const URGENCY_LABEL: Record<string, string> = {
  critical: 'Críticos',
  high: 'Altos',
  medium: 'Medios',
  low: 'Bajos',
};

// ─── Sorters ────────────────────────────────────────────────────────────────

function getClientRank(t: WorkspaceTicket): number {
  const raw = (t.custom_fields ?? {})['client_rank'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Ordering within each group:
 *   1. Tickets with client_rank first (ascending).
 *   2. Then by urgency desc (critical > high > medium > low).
 *   3. Then by created_at desc (newest first).
 */
function compareTickets(a: WorkspaceTicket, b: WorkspaceTicket): number {
  const ra = getClientRank(a);
  const rb = getClientRank(b);
  if (ra !== rb) return ra - rb;
  const ua = URGENCY_WEIGHT[a.urgency] ?? 0;
  const ub = URGENCY_WEIGHT[b.urgency] ?? 0;
  if (ua !== ub) return ub - ua;
  return (b.created_at ?? '').localeCompare(a.created_at ?? '');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the set of organization_ids where the current agent has at least
 * one ticket assigned. Used by the smart "Sin asignar en mis clientes" group
 * so the agent only sees unassigned work in orgs they already manage.
 */
function orgsForAgent(
  tickets: WorkspaceTicket[],
  currentAgentId: string,
): Set<string> {
  const out = new Set<string>();
  for (const t of tickets) {
    if (t.assigned_agent_id === currentAgentId && t.organization_id) {
      out.add(t.organization_id);
    }
  }
  return out;
}

function applyFilters(
  tickets: WorkspaceTicket[],
  filters: WorkspaceFilters,
): WorkspaceTicket[] {
  return tickets.filter((t) => {
    if (filters.mine && t.assigned_agent_id !== filters.currentAgentId) {
      return false;
    }
    if (filters.criticalOnly && !HIGH_URGENCY.has(t.urgency)) return false;
    return true;
  });
}

// ─── Group builders ─────────────────────────────────────────────────────────

function buildSmartGroups(
  tickets: WorkspaceTicket[],
  filters: WorkspaceFilters,
): Group[] {
  const myOrgs = orgsForAgent(tickets, filters.currentAgentId);

  // A ticket goes into the FIRST group it matches. Evaluation order is the
  // order of this array — don't reorder casually.
  const rules: Array<{
    key: string;
    title: string;
    emoji: string;
    accent: string;
    description?: string;
    defaultCollapsed: boolean;
    match: (t: WorkspaceTicket) => boolean;
  }> = [
    {
      key: 'critical',
      title: 'Críticos / Alta prioridad',
      emoji: '🔴',
      accent: 'destructive',
      description: 'Urgencia alta o crítica aún abierta',
      defaultCollapsed: false,
      match: (t) => HIGH_URGENCY.has(t.urgency) && !TERMINAL.has(t.status),
    },
    {
      key: 'unassigned-my-clients',
      title: 'Sin asignar en mis clientes',
      emoji: '🟡',
      accent: 'amber',
      description: 'Pendientes de tomar en los clientes que ya manejas',
      defaultCollapsed: false,
      match: (t) =>
        !t.assigned_agent_id &&
        !TERMINAL.has(t.status) &&
        (t.organization_id ? myOrgs.has(t.organization_id) : false),
    },
    {
      key: 'in-progress',
      title: 'En progreso',
      emoji: '🟠',
      accent: 'orange',
      defaultCollapsed: false,
      match: (t) => t.status === 'in_progress',
    },
    {
      key: 'testing',
      title: 'Listo para Testing',
      emoji: '🔵',
      accent: 'cyan',
      defaultCollapsed: false,
      match: (t) => t.status === 'testing',
    },
    {
      key: 'detenido',
      title: 'Detenidos',
      emoji: '⏸',
      accent: 'amber',
      description: 'Pausados por decisión',
      defaultCollapsed: false,
      match: (t) => t.status === 'detenido',
    },
    {
      key: 'pending',
      title: 'Pendientes del cliente',
      emoji: '🟢',
      accent: 'emerald',
      description: 'Esperando input del solicitante',
      defaultCollapsed: false,
      match: (t) => t.status === 'pending',
    },
    {
      key: 'backlog',
      title: 'Backlog / Desarrollo Pendiente',
      emoji: '📦',
      accent: 'slate',
      description: 'Diferidos para un ciclo posterior',
      defaultCollapsed: true,
      match: (t) =>
        t.status === 'backlog' || t.status === 'desarrollo_pendiente',
    },
    {
      key: 'new',
      title: 'Nuevos sin tomar',
      emoji: '🆕',
      accent: 'blue',
      defaultCollapsed: false,
      match: (t) => t.status === 'new',
    },
    {
      key: 'closed',
      title: 'Cerrados (últimos 50)',
      emoji: '✅',
      accent: 'muted',
      defaultCollapsed: true,
      match: (t) => TERMINAL.has(t.status),
    },
  ];

  const groups: Group[] = rules.map((r) => ({
    key: r.key,
    title: r.title,
    emoji: r.emoji,
    accent: r.accent,
    tickets: [],
    defaultCollapsed: r.defaultCollapsed,
    description: r.description,
  }));

  outer: for (const t of tickets) {
    for (let i = 0; i < rules.length; i++) {
      if (rules[i]!.match(t)) {
        groups[i]!.tickets.push(t);
        continue outer;
      }
    }
    // Didn't match any rule — drop quietly (shouldn't happen).
  }

  // Sort within each group
  for (const g of groups) g.tickets.sort(compareTickets);

  // Drop empty groups
  return groups.filter((g) => g.tickets.length > 0);
}

function buildByClientGroups(
  tickets: WorkspaceTicket[],
  orgMap: Map<string, string>,
): Group[] {
  const bucket = new Map<string, WorkspaceTicket[]>();
  for (const t of tickets) {
    const k = t.organization_id ?? '__none__';
    const arr = bucket.get(k) ?? [];
    arr.push(t);
    bucket.set(k, arr);
  }
  const groups: Group[] = [];
  for (const [orgId, list] of bucket.entries()) {
    const name = orgId === '__none__' ? 'Sin cliente' : orgMap.get(orgId) ?? orgId;
    groups.push({
      key: `client:${orgId}`,
      title: name,
      emoji: '🏢',
      accent: 'indigo',
      tickets: list.sort(compareTickets),
      defaultCollapsed: false,
    });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}

function buildByStatusGroups(tickets: WorkspaceTicket[]): Group[] {
  const bucket = new Map<string, WorkspaceTicket[]>();
  for (const t of tickets) {
    const arr = bucket.get(t.status) ?? [];
    arr.push(t);
    bucket.set(t.status, arr);
  }
  const order = [
    'new',
    'backlog',
    'assigned',
    'in_progress',
    'pending',
    'detenido',
    'testing',
    'resolved',
    'closed',
    'cancelled',
  ];
  return order
    .filter((s) => bucket.has(s))
    .map((s) => ({
      key: `status:${s}`,
      title: STATUS_LABEL[s] ?? s,
      emoji: STATUS_EMOJI[s] ?? '•',
      accent: TERMINAL.has(s) ? 'muted' : 'indigo',
      tickets: (bucket.get(s) ?? []).sort(compareTickets),
      defaultCollapsed: TERMINAL.has(s),
    }));
}

function buildByPriorityGroups(tickets: WorkspaceTicket[]): Group[] {
  const bucket = new Map<string, WorkspaceTicket[]>();
  for (const t of tickets) {
    const arr = bucket.get(t.urgency) ?? [];
    arr.push(t);
    bucket.set(t.urgency, arr);
  }
  const order = ['critical', 'high', 'medium', 'low'];
  const accents: Record<string, string> = {
    critical: 'destructive',
    high: 'orange',
    medium: 'amber',
    low: 'emerald',
  };
  return order
    .filter((u) => bucket.has(u))
    .map((u) => ({
      key: `priority:${u}`,
      title: URGENCY_LABEL[u] ?? u,
      emoji: u === 'critical' ? '🔴' : u === 'high' ? '🟠' : u === 'medium' ? '🟡' : '🟢',
      accent: accents[u] ?? 'indigo',
      tickets: (bucket.get(u) ?? []).sort(compareTickets),
      defaultCollapsed: false,
    }));
}

// ─── Public entry point ────────────────────────────────────────────────────

export function groupTickets(
  tickets: WorkspaceTicket[],
  mode: GroupingMode,
  filters: WorkspaceFilters,
  orgMap: Map<string, string>,
): Group[] {
  const filtered = applyFilters(tickets, filters);

  switch (mode) {
    case 'smart':
      return buildSmartGroups(filtered, filters);
    case 'client':
      return buildByClientGroups(filtered, orgMap);
    case 'status':
      return buildByStatusGroups(filtered);
    case 'priority':
      return buildByPriorityGroups(filtered);
    case 'none':
    default:
      return [
        {
          key: 'all',
          title: 'Todos los tickets',
          emoji: '📋',
          accent: 'indigo',
          tickets: [...filtered].sort(compareTickets),
          defaultCollapsed: false,
        },
      ];
  }
}
