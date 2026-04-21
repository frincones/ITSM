'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutList, Minus, Plus } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { cn } from '@kit/ui/utils';

import {
  groupTickets,
  type GroupingMode,
  type WorkspaceTicket,
} from '~/lib/services/workspace-grouping';

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

interface Prefs {
  groupingMode: GroupingMode;
  collapsed: Record<string, boolean>;
  filterMine: boolean;
  filterCritical: boolean;
}

const STORAGE_KEY = 'workspace.prefs.v1';

const DEFAULT_PREFS: Prefs = {
  groupingMode: 'smart',
  collapsed: {},
  filterMine: false,
  filterCritical: false,
};

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed };
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

export function WorkspaceClient({
  currentAgentId,
  currentAgentName,
  tickets,
  agents,
  organizations,
}: WorkspaceClientProps) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [selectedTicket, setSelectedTicket] = useState<WorkspaceTicket | null>(null);

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

  const groups = useMemo(
    () =>
      groupTickets(
        tickets,
        prefs.groupingMode,
        {
          currentAgentId,
          mine: prefs.filterMine,
          criticalOnly: prefs.filterCritical,
        },
        orgMap,
      ),
    [tickets, prefs.groupingMode, prefs.filterMine, prefs.filterCritical, currentAgentId, orgMap],
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

  return (
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

      {/* Groups */}
      <div className="flex-1 overflow-auto bg-muted/20">
        {groups.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted-foreground">
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
  );
}
