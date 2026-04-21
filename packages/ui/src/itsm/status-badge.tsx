'use client';

import * as React from 'react';

import { Badge } from '../shadcn/badge';
import { cn } from '../lib/utils';

/**
 * Ticket status values matching the database enum.
 */
export type TicketStatus =
  | 'new'
  | 'backlog'
  | 'assigned'
  | 'in_progress'
  | 'pending'
  | 'detenido'
  | 'testing'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: TicketStatus;
}

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; color: string; bg: string }
> = {
  new: {
    label: 'New',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-500/20',
  },
  backlog: {
    label: 'Backlog',
    color: 'text-slate-700 dark:text-slate-300',
    bg: 'bg-slate-50 dark:bg-slate-500/20',
  },
  assigned: {
    label: 'Assigned',
    color: 'text-violet-700 dark:text-violet-300',
    bg: 'bg-violet-50 dark:bg-violet-500/20',
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-500/20',
  },
  pending: {
    label: 'Pending',
    color: 'text-gray-700 dark:text-gray-300',
    bg: 'bg-gray-50 dark:bg-gray-500/20',
  },
  detenido: {
    label: 'Detenido',
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-500/20',
  },
  testing: {
    label: 'Testing',
    color: 'text-indigo-700 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-500/20',
  },
  resolved: {
    label: 'Resolved',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-500/20',
  },
  closed: {
    label: 'Closed',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-500/20',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-500/20',
  },
};

/**
 * StatusBadge renders a colored badge based on ticket status.
 * Uses CSS variable-aligned Tailwind colors for consistency with the design system.
 */
const FALLBACK_CONFIG = {
  label: 'Unknown',
  color: 'text-gray-700 dark:text-gray-300',
  bg: 'bg-gray-50 dark:bg-gray-500/20',
};

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  // Defensive: a new enum value added to the DB without a matching entry
  // here used to crash the whole ticket detail page with "Cannot read
  // properties of undefined (reading 'bg')". Falling back keeps the UI
  // rendering while we wire up the new status.
  const config = STATUS_CONFIG[status] ?? FALLBACK_CONFIG;
  const displayLabel =
    config === FALLBACK_CONFIG
      ? (status as string).replace(/_/g, ' ')
      : config.label;

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-medium',
        config.bg,
        config.color,
        className,
      )}
      {...props}
    >
      <span
        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(--status-${String(status).replace('_', '-')})` }}
      />
      {displayLabel}
    </Badge>
  );
}
