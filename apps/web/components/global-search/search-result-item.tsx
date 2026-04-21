'use client';

import { CornerDownLeft } from 'lucide-react';

import { CommandItem } from '@kit/ui/command';
import { cn } from '@kit/ui/utils';

import type { SearchHit } from '~/lib/actions/search';

import {
  SEARCH_GROUPS,
  highlightMatch,
  matchedFieldLabel,
} from './search-groups';

interface SearchResultItemProps {
  hit: SearchHit;
  query: string;
  onSelect: () => void;
  /** Compact variant for the inline topbar dropdown (slightly shorter rows). */
  compact?: boolean;
}

/**
 * Single row used by both the Cmd+K palette and the inline topbar dropdown.
 * Renders: icon (Lucide) · highlighted title · subtitle · matched-field pill
 * · Enter hint (palette only).
 *
 * We keep rows dense (40/48px) so multiple groups fit without scrolling.
 */
export function SearchResultItem({ hit, query, onSelect, compact }: SearchResultItemProps) {
  const meta = SEARCH_GROUPS[hit.entityType];
  const Icon = meta.icon;

  return (
    <CommandItem
      value={`${hit.entityType}:${hit.id}:${hit.title}`}
      onSelect={onSelect}
      className={cn(
        'group flex items-center gap-3 rounded-md',
        compact ? 'h-10 px-2' : 'h-12 px-3',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[13px] font-medium text-foreground',
            '[&_mark]:rounded-sm [&_mark]:bg-primary/15 [&_mark]:px-0.5 [&_mark]:font-semibold [&_mark]:text-primary [&_mark]:dark:bg-primary/25',
          )}
          // Highlighted substrings — input sanitised by a fixed regex, query
          // is the user's own search text (never from another user).
          dangerouslySetInnerHTML={{ __html: highlightMatch(hit.title, query) }}
        />
        {hit.subtitle && (
          <p
            className={cn(
              'truncate text-[11px] text-muted-foreground',
              '[&_mark]:bg-primary/10 [&_mark]:text-primary',
            )}
            dangerouslySetInnerHTML={{ __html: highlightMatch(hit.subtitle, query) }}
          />
        )}
      </div>

      {/* Matched field hint — subtle chip so user knows why it matched. */}
      <span className="hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
        {matchedFieldLabel(hit.matchedField)}
      </span>

      {!compact && (
        <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
      )}
    </CommandItem>
  );
}
