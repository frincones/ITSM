'use client';

import * as React from 'react';

import { Badge } from '../shadcn/badge';
import { cn } from '../lib/utils';

/**
 * Severity / priority levels matching the database enum.
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

interface PriorityBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  priority: SeverityLevel;
}

const PRIORITY_CONFIG: Record<
  SeverityLevel,
  { label: string; color: string; bg: string; icon: string }
> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-500/20',
    icon: '!!',
  },
  high: {
    label: 'High',
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-500/20',
    icon: '!',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-700 dark:text-yellow-300',
    bg: 'bg-yellow-50 dark:bg-yellow-500/20',
    icon: '-',
  },
  low: {
    label: 'Low',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-500/20',
    icon: '',
  },
};

/**
 * PriorityBadge renders a colored badge indicating ticket priority / severity.
 */
export function PriorityBadge({
  priority,
  className,
  ...props
}: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];

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
        style={{ backgroundColor: `var(--priority-${priority})` }}
      />
      {config.label}
    </Badge>
  );
}
