'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  LayoutList,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';

import {
  useTicketRealtime,
  type RealtimeTicketRow,
} from '../../tickets/_hooks/use-ticket-realtime';

import { Button } from '@kit/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { TooltipProvider } from '@kit/ui/tooltip';
import { cn } from '@kit/ui/utils';

import {
  groupTickets,
  type GroupingMode,
  type SortColumn,
  type SortOverride,
  type WorkspaceAdvancedFilters,
  type WorkspaceTicket,
} from '~/lib/services/workspace-grouping';

import { TicketFilters } from '../../tickets/_components/ticket-filters';
import { GroupSection } from './group-section';
import { TicketPreviewPanel } from './ticket-preview-panel';

interface AgentOption {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
}

interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceClientProps {
  currentAgentId: string;
  currentAgentName: string;
  tickets: WorkspaceTicket[];
  agents: AgentOption[];
  organizations: OrgOption[];
}

// `advancedFilters` uses the comma-separated string shape expected by
// <TicketFilters /> so we can reuse the component 1:1. We convert to the
// array-based WorkspaceAdvancedFilters shape at the grouping call site.
interface AdvancedFiltersUI {
  status: string;
  type: string;
  priority: string;
  category: string;
  agent: string;
  from: string;
  to: string;
}

interface Prefs {
  groupingMode: GroupingMode;
  collapsed: Record<string, boolean>;
  filterMine: boolean;
  filterCritical: boolean;
  advancedFilters: AdvancedFiltersUI;
  sort: SortOverride | null;
}

const STORAGE_KEY = 'workspace.prefs.v1';

const EMPTY_ADVANCED: AdvancedFiltersUI = {
  status: '',
  type: '',
  priority: '',
  category: '',
  agent: '',
  from: '',
  to: '',
};

const DEFAULT_PREFS: Prefs = {
  groupingMode: 'smart',
  collapsed: {},
  filterMine: false,
  filterCritical: false,
  advancedFilters: EMPTY_ADVANCED,
  sort: null,
};

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      advancedFilters: {
        ...EMPTY_ADVANCED,
        ...(parsed.advancedFilters ?? {}),
      },
      sort: parsed.sort ?? null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: Prefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

function toWorkspaceAdvanced(
  f: AdvancedFiltersUI,
): WorkspaceAdvancedFilters {
  return {
    status: f.status.split(',').filter(Boolean),
    type: f.type.split(',').filter(Boolean),
    priority: f.priority,
    category: f.category,
    agentIds: f.agent.split(',').filter(Boolean),
    from: f.from,
    to: f.to,
  };
}

function countActiveAdvanced(f: AdvancedFiltersUI): number {
  return (Object.values(f) as string[]).filter((v) => v !== '').length;
}

// ---------------------------------------------------------------------------
// Column header (sticky row above the groups, clickable to sort)
// ---------------------------------------------------------------------------

interface ColumnHeaderProps {
  sort: SortOverride | null;
  onToggle: (col: SortColumn) => void;
}

function ColumnHeader({ sort, onToggle }: ColumnHeaderProps) {
  return (
    <div className="flex h-9 w-full items-center gap-3 border-b border-border bg-muted/40 px-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <SortButton col="urgency" className="w-5 justify-center" sort={sort} onToggle={onToggle}>
        !
      </SortButton>
      <SortButton col="ticket_number" className="w-[120px]" sort={sort} onToggle={onToggle}>
        Ticket
      </SortButton>
      <SortButton col="rank" className="w-[48px]" sort={sort} onToggle={onToggle}>
        Rank
      </SortButton>
      <SortButton col="title" className="flex-1" sort={sort} onToggle={onToggle}>
        Título
      </SortButton>
      <SortButton col="type" className="w-[100px]" sort={sort} onToggle={onToggle}>
        Tipo
      </SortButton>
      <SortButton col="status" className="w-[110px]" sort={sort} onToggle={onToggle}>
        Estado
      </SortButton>
      <SortButton col="org" className="w-[140px]" sort={sort} onToggle={onToggle}>
        Cliente
      </SortButton>
      <SortButton col="requester" className="w-[40px] justify-center" sort={sort} onToggle={onToggle}>
        Sol.
      </SortButton>
      <SortButton col="assignee" className="w-[40px] justify-center" sort={sort} onToggle={onToggle}>
        Asig.
      </SortButton>
      <SortButton
        col="created"
        className="w-[50px] justify-end"
        sort={sort}
        onToggle={onToggle}
      >
        Creado
      </SortButton>
      <span className="w-6" />
    </div>
  );
}

interface SortButtonProps {
  col: SortColumn;
  className?: string;
  sort: SortOverride | null;
  onToggle: (col: SortColumn) => void;
  children: React.ReactNode;
}

function SortButton({
  col,
  className,
  sort,
  onToggle,
  children,
}: SortButtonProps) {
  const active = sort?.column === col;
  const dir = active ? sort!.direction : null;
  return (
    <button
      type="button"
      onClick={() => onToggle(col)}
      className={cn(
        'flex items-center gap-1 text-left transition-colors hover:text-foreground',
        active ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {active ? (
        dir === 'asc' ? (
          <ArrowUp className="h-3 w-3 shrink-0" />
        ) : (
          <ArrowDown className="h-3 w-3 shrink-0" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkspaceClient({
  currentAgentId,
  currentAgentName,
  tickets,
  agents,
  organizations,
}: WorkspaceClientProps) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [selectedTicket, setSelectedTicket] = useState<WorkspaceTicket | null>(
    null,
  );
  const [showFilters, setShowFilters] = useState(false);

  // Shadow the server-provided ticket list with local state so realtime
  // events can update it in place. Resets whenever the server re-fetches
  // (grouping / filter / sort changes don't hit the server, but navigating
  // back to workspace or refreshing does).
  const [liveTickets, setLiveTickets] = useState<WorkspaceTicket[]>(tickets);
  useEffect(() => {
    setLiveTickets(tickets);
  }, [tickets]);

  // Load saved prefs after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  // Persist on change
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations],
  );

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  // Map a raw realtime row → WorkspaceTicket. Keeps the previous row's
  // `requester` / `category` objects when the FK hasn't changed, so a
  // re-render doesn't briefly show "no requester" until revalidation.
  const resolveWorkspaceTicket = useCallback(
    (raw: RealtimeTicketRow, prev?: WorkspaceTicket): WorkspaceTicket => {
      const agentMatch = raw.assigned_agent_id
        ? agentMap.get(raw.assigned_agent_id)
        : null;
      const assigned_agent = agentMatch
        ? {
            id: agentMatch.id,
            name: agentMatch.name,
            avatar_url: agentMatch.avatar_url,
          }
        : prev?.assigned_agent ?? null;

      return {
        id: raw.id,
        ticket_number: raw.ticket_number,
        title: raw.title,
        status: raw.status,
        type: raw.type,
        urgency: raw.urgency,
        priority:
          typeof raw.priority === 'number'
            ? raw.priority
            : raw.priority === null || raw.priority === undefined
              ? null
              : Number(raw.priority),
        created_at: raw.created_at,
        closed_at: raw.closed_at,
        organization_id: raw.organization_id,
        assigned_agent_id: raw.assigned_agent_id,
        requester_email: raw.requester_email,
        custom_fields: raw.custom_fields,
        requester: prev?.requester ?? null,
        assigned_agent,
        category: prev?.category ?? null,
      };
    },
    [agentMap],
  );

  useTicketRealtime({
    // Different channel key than the list so the two views don't dedupe
    // into each other if a user opens both in separate tabs.
    channelKey: 'tickets-workspace',
    onInsert: (raw) => {
      // Skip soft-deleted rows (shouldn't arrive via INSERT but be safe).
      if (raw.deleted_at !== null) return;
      setLiveTickets((prev) => {
        if (prev.some((t) => t.id === raw.id)) return prev;
        return [resolveWorkspaceTicket(raw), ...prev];
      });
    },
    onUpdate: (raw) => {
      setLiveTickets((prev) => {
        const idx = prev.findIndex((t) => t.id === raw.id);
        if (raw.deleted_at !== null) {
          return idx >= 0 ? prev.filter((t) => t.id !== raw.id) : prev;
        }
        if (idx === -1) {
          // First time we see this ticket (wasn't in the initial 500/50
          // window). Let it in — grouping will place it correctly.
          return [resolveWorkspaceTicket(raw), ...prev];
        }
        const next = [...prev];
        next[idx] = resolveWorkspaceTicket(raw, prev[idx]);
        return next;
      });
    },
  });

  const advancedCount = countActiveAdvanced(prefs.advancedFilters);

  const groups = useMemo(
    () =>
      groupTickets(
        liveTickets,
        prefs.groupingMode,
        {
          currentAgentId,
          mine: prefs.filterMine,
          criticalOnly: prefs.filterCritical,
          advanced: toWorkspaceAdvanced(prefs.advancedFilters),
          sort: prefs.sort,
        },
        orgMap,
      ),
    [
      liveTickets,
      prefs.groupingMode,
      prefs.filterMine,
      prefs.filterCritical,
      prefs.advancedFilters,
      prefs.sort,
      currentAgentId,
      orgMap,
    ],
  );

  const totalVisible = groups.reduce((sum, g) => sum + g.tickets.length, 0);

  const toggleCollapse = (key: string, defaultCollapsed: boolean) => {
    setPrefs((p) => {
      const current = p.collapsed[key] ?? defaultCollapsed;
      return {
        ...p,
        collapsed: { ...p.collapsed, [key]: !current },
      };
    });
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    groups.forEach((g) => (next[g.key] = true));
    setPrefs((p) => ({ ...p, collapsed: next }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    groups.forEach((g) => (next[g.key] = false));
    setPrefs((p) => ({ ...p, collapsed: next }));
  };

  // Click header → asc; same col again → desc; different col → asc.
  const toggleSort = (col: SortColumn) => {
    setPrefs((p) => {
      const current = p.sort;
      if (!current || current.column !== col) {
        return { ...p, sort: { column: col, direction: 'asc' } };
      }
      return {
        ...p,
        sort: {
          column: col,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        },
      };
    });
  };

  const resetSort = () => setPrefs((p) => ({ ...p, sort: null }));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Mi Workspace
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentAgentName} · {totalVisible} tickets visibles
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/home/tickets">
              <Button variant="outline" size="sm" className="gap-2">
                <LayoutList className="h-4 w-4" />
                Vista Lista
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              className={cn(
                'gap-2',
                advancedCount > 0 &&
                  'border-primary bg-primary/10 text-primary hover:bg-primary/15',
              )}
              onClick={() => setShowFilters((s) => !s)}
            >
              <Filter className="h-4 w-4" />
              Filtros avanzados
              {advancedCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {advancedCount}
                </span>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Agrupar:</label>
              <Select
                value={prefs.groupingMode}
                onValueChange={(v) =>
                  setPrefs((p) => ({ ...p, groupingMode: v as GroupingMode }))
                }
              >
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smart">Inteligente</SelectItem>
                  <SelectItem value="client">Por cliente</SelectItem>
                  <SelectItem value="status">Por estado</SelectItem>
                  <SelectItem value="priority">Por prioridad</SelectItem>
                  <SelectItem value="none">Sin agrupar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 text-xs',
              prefs.filterMine &&
                'border-primary bg-primary/10 text-primary hover:bg-primary/15',
            )}
            onClick={() =>
              setPrefs((p) => ({ ...p, filterMine: !p.filterMine }))
            }
          >
            Mis tickets
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 text-xs',
              prefs.filterCritical &&
                'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15',
            )}
            onClick={() =>
              setPrefs((p) => ({ ...p, filterCritical: !p.filterCritical }))
            }
          >
            Solo críticos
          </Button>

          {prefs.sort && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={resetSort}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset orden
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAll}
              className="h-8 gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Expandir todo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              className="h-8 gap-1 text-xs"
            >
              <Minus className="h-3.5 w-3.5" />
              Colapsar todo
            </Button>
          </div>
        </div>
      </div>

      {/* Advanced Filters panel (reuses ticket list component) */}
      {showFilters && (
        <TicketFilters
          filters={prefs.advancedFilters}
          agents={agents}
          onApply={(next) => {
            const updated: AdvancedFiltersUI = {
              status: next.status ?? '',
              type: next.type ?? '',
              priority: next.priority ?? '',
              category: next.category ?? '',
              agent: next.agent ?? '',
              from: next.from ?? '',
              to: next.to ?? '',
            };
            setPrefs((p) => ({ ...p, advancedFilters: updated }));
            setShowFilters(false);
          }}
          onClear={() => {
            setPrefs((p) => ({ ...p, advancedFilters: EMPTY_ADVANCED }));
            setShowFilters(false);
          }}
        />
      )}

      {/* Groups */}
      <div className="flex-1 overflow-auto bg-muted/20">
        <div className="sticky top-0 z-10">
          <ColumnHeader sort={prefs.sort} onToggle={toggleSort} />
        </div>

        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <p className="text-base font-medium">Sin resultados</p>
            <p>
              No hay tickets que coincidan con los filtros activos. Quita los
              filtros o cambia el modo de agrupación.
            </p>
          </div>
        )}

        <div className="flex flex-col divide-y divide-border">
          {groups.map((group) => {
            const isCollapsed =
              prefs.collapsed[group.key] ?? group.defaultCollapsed;
            return (
              <GroupSection
                key={group.key}
                group={group}
                collapsed={isCollapsed}
                organizations={orgMap}
                currentAgentId={currentAgentId}
                selectedTicketId={selectedTicket?.id ?? null}
                onToggle={() => toggleCollapse(group.key, group.defaultCollapsed)}
                onSelectTicket={setSelectedTicket}
              />
            );
          })}
        </div>
      </div>

      {/* Preview panel */}
      {selectedTicket && (
        <TicketPreviewPanel
          ticket={selectedTicket}
          agents={agents}
          organizations={orgMap}
          onClose={() => setSelectedTicket(null)}
        />
      )}
      </div>
    </TooltipProvider>
  );
}
