'use client';

import * as React from 'react';

import { Badge } from '../shadcn/badge';
import { cn } from '../lib/utils';

/**
 * Ticket status values matching the database enum.
 */
export type TicketStatus =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'pending'
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
export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

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
        style={{ backgroundColor: `var(--status-${status.replace('_', '-')})` }}
      />
      {config.label}
    </Badge>
  );
}
