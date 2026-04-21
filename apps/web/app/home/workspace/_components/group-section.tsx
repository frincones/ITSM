'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { cn } from '@kit/ui/utils';

import type { Group, WorkspaceTicket } from '~/lib/services/workspace-grouping';

import { TicketRow } from './ticket-row';

const ACCENT_CLASSES: Record<string, string> = {
  destructive: 'border-l-destructive bg-destructive/5',
  amber: 'border-l-amber-500 bg-amber-500/5',
  orange: 'border-l-orange-500 bg-orange-500/5',
  cyan: 'border-l-cyan-500 bg-cyan-500/5',
  emerald: 'border-l-emerald-500 bg-emerald-500/5',
  slate: 'border-l-slate-400 bg-slate-500/5',
  blue: 'border-l-blue-500 bg-blue-500/5',
  indigo: 'border-l-indigo-500 bg-indigo-500/5',
  muted: 'border-l-muted-foreground/40 bg-muted/40',
};

interface GroupSectionProps {
  group: Group;
  collapsed: boolean;
  organizations: Map<string, string>;
  currentAgentId: string;
  selectedTicketId: string | null;
  onToggle: () => void;
  onSelectTicket: (ticket: WorkspaceTicket) => void;
}

export function GroupSection({
  group,
  collapsed,
  organizations,
  currentAgentId,
  selectedTicketId,
  onToggle,
  onSelectTicket,
}: GroupSectionProps) {
  const accent = ACCENT_CLASSES[group.accent] ?? ACCENT_CLASSES.indigo;

  return (
    <section className={cn('border-l-[3px] bg-background', accent)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <span className="text-base">{group.emoji}</span>

        <div className="flex flex-1 items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            {group.title}
          </h2>
          {group.description && !collapsed && (
            <span className="text-xs text-muted-foreground">
              · {group.description}
            </span>
          )}
        </div>

        <Badge variant="secondary" className="ml-auto text-xs tabular-nums">
          {group.tickets.length}
        </Badge>
      </button>

      {!collapsed && (
        <div className="divide-y divide-border/60 border-t border-border/60 bg-card">
          {group.tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              organizations={organizations}
              currentAgentId={currentAgentId}
              selected={selectedTicketId === ticket.id}
              onSelect={() => onSelectTicket(ticket)}
            />
          ))}

          {group.tickets.length === 0 && (
            <div className="px-5 py-4 text-xs text-muted-foreground">
              Sin tickets en este grupo.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
