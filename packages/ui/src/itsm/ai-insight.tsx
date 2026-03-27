'use client';

import * as React from 'react';
import {
  Bot,
  Sparkles,
  Brain,
  CheckCircle2,
  type LucideProps,
} from 'lucide-react';

import { Badge } from '../shadcn/badge';
import { cn } from '../lib/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type AIInsightType =
  | 'classification'
  | 'suggestion'
  | 'analysis'
  | 'completed';

export interface AIInsightProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The type of AI insight, which determines icon and color scheme. */
  type: AIInsightType;
  /** Short title displayed next to the icon. */
  title: string;
  /** Main body text of the insight. */
  content: string;
  /** Optional confidence score (0-100). Renders a progress bar when provided. */
  confidence?: number;
  /** Model name shown alongside the confidence bar. */
  model?: string;
}

/* -------------------------------------------------------------------------- */
/*  Config map                                                                 */
/* -------------------------------------------------------------------------- */

interface TypeConfig {
  icon: React.FC<LucideProps>;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  badgeColor: string;
}

const TYPE_CONFIG: Record<AIInsightType, TypeConfig> = {
  classification: {
    icon: Brain,
    bgColor: 'bg-purple-50 dark:bg-purple-500/10',
    borderColor: 'border-purple-200 dark:border-purple-500/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  },
  suggestion: {
    icon: Sparkles,
    bgColor: 'bg-indigo-50 dark:bg-indigo-500/10',
    borderColor: 'border-indigo-200 dark:border-indigo-500/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  },
  analysis: {
    icon: Bot,
    bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    borderColor: 'border-blue-200 dark:border-blue-500/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  },
  completed: {
    icon: CheckCircle2,
    bgColor: 'bg-green-50 dark:bg-green-500/10',
    borderColor: 'border-green-200 dark:border-green-500/30',
    iconColor: 'text-green-600 dark:text-green-400',
    badgeColor: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  },
};

/* -------------------------------------------------------------------------- */
/*  Components                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * AIInsight displays an AI-generated insight card with icon, title, description,
 * and optional confidence score with a progress bar.
 *
 * Migrated from `Contexto/TemplateFigma/Untitled/src/app/components/ui/ai-insight.tsx`
 * with dark mode support, accessible markup, and design-system alignment.
 */
export function AIInsight({
  type,
  title,
  content,
  confidence,
  model = 'Claude Sonnet 4',
  className,
  ...props
}: AIInsightProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        config.bgColor,
        config.borderColor,
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border',
              config.bgColor,
              config.borderColor,
            )}
          >
            <Icon className={cn('h-4 w-4', config.iconColor)} />
          </div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">{title}</h4>
            <Badge
              className={cn('border-0 text-xs', config.badgeColor)}
            >
              AI {type}
            </Badge>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {content}
          </p>

          {/* Confidence bar */}
          {confidence !== undefined && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Confidence
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {confidence}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={cn('h-full rounded-full transition-all', {
                      'bg-green-500': confidence >= 80,
                      'bg-yellow-500': confidence >= 60 && confidence < 80,
                      'bg-orange-500': confidence < 60,
                    })}
                    style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
                    role="progressbar"
                    aria-valuenow={confidence}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{model}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Small badge indicating that an AI process is running.
 */
export function AIProcessingBadge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Badge
      className={cn(
        'gap-1 border-0 bg-gradient-to-r from-purple-500 to-indigo-500 text-white',
        className,
      )}
      {...props}
    >
      <Sparkles className="h-3 w-3 animate-pulse" />
      AI Processing
    </Badge>
  );
}

/**
 * Clickable chip to invoke the AI assistant.
 */
export function AIAssistChip({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-1.5 text-sm font-medium text-purple-700 transition-all hover:from-purple-100 hover:to-indigo-100 dark:border-purple-500/30 dark:from-purple-500/10 dark:to-indigo-500/10 dark:text-purple-300 dark:hover:from-purple-500/20 dark:hover:to-indigo-500/20',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
      Ask AI Assistant
    </button>
  );
}
