'use client';

import * as React from 'react';
import { Clock, AlertTriangle, XCircle } from 'lucide-react';

import { Badge } from '../shadcn/badge';
import { cn } from '../lib/utils';

interface SLAIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** ISO 8601 date string for when the SLA is due, or null if no SLA applies. */
  dueDate: string | null;
  /** Whether the SLA has already been breached. */
  breached: boolean;
}

/**
 * Computes the remaining time between now and the due date.
 * Returns a human-readable string and a status level.
 */
function computeTimeRemaining(dueDate: string): {
  label: string;
  level: 'ok' | 'warning' | 'breached';
} {
  const now = Date.now();
  const due = new Date(dueDate).getTime();
  const diffMs = due - now;

  if (diffMs <= 0) {
    return { label: 'Breached', level: 'breached' };
  }

  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Warning threshold: less than 30 minutes remaining
  const level = totalMinutes < 30 ? 'warning' : 'ok';

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return {
      label: remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`,
      level,
    };
  }

  if (hours > 0) {
    return { label: `${hours}h ${minutes}m`, level };
  }

  return { label: `${minutes}m`, level };
}

const LEVEL_STYLES = {
  ok: {
    bg: 'bg-green-50 dark:bg-green-500/20',
    color: 'text-green-700 dark:text-green-300',
    Icon: Clock,
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-500/20',
    color: 'text-yellow-700 dark:text-yellow-300',
    Icon: AlertTriangle,
  },
  breached: {
    bg: 'bg-red-50 dark:bg-red-500/20',
    color: 'text-red-700 dark:text-red-300',
    Icon: XCircle,
  },
} as const;

/**
 * SLAIndicator shows the SLA status of a ticket:
 * - Green (on track) with time remaining
 * - Yellow (warning) when less than 30 minutes remain
 * - Red (breached) when overdue or explicitly flagged
 */
export function SLAIndicator({
  dueDate,
  breached,
  className,
  ...props
}: SLAIndicatorProps) {
  if (!dueDate) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'border-transparent bg-gray-50 text-gray-500 dark:bg-gray-500/20 dark:text-gray-400',
          className,
        )}
        {...props}
      >
        <Clock className="mr-1 h-3 w-3" />
        No SLA
      </Badge>
    );
  }

  const computed = computeTimeRemaining(dueDate);
  const level = breached ? 'breached' : computed.level;
  const label = breached ? 'Breached' : computed.label;
  const style = LEVEL_STYLES[level];
  const { Icon } = style;

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-medium',
        style.bg,
        style.color,
        className,
      )}
      {...props}
    >
      <Icon className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}
