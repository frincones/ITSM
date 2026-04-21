'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Command,
  CommandGroup,
  CommandList,
} from '@kit/ui/command';
import { cn } from '@kit/ui/utils';

import { Loader2, Search } from 'lucide-react';

import { useGlobalSearch, SEARCH_GROUPS } from './use-global-search';
import { SearchResultItem } from './search-result-item';

interface TopbarSearchProps {
  /** Invoked when the user wants the full Cmd+K experience. */
  onOpenPalette: () => void;
  className?: string;
}

/**
 * Inline search dropdown rendered beneath the topbar input (Office 365 /
 * Gmail style). Shares the `useGlobalSearch` hook with the CommandPalette
 * so results are identical.
 *
 * Closes on Escape, on outside click, or when the user selects a result.
 * A "Abrir buscador completo" row at the bottom escalates the user into
 * the Cmd+K modal for a bigger surface.
 */
export function TopbarSearch({ onOpenPalette, className }: TopbarSearchProps) {
  const router = useRouter();
  const {
    query,
    setQuery,
    loading,
    response,
    nonEmptyGroups,
  } = useGlobalSearch();

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleSelect = useCallback(
    (url: string) => {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
      router.push(url);
    },
    [router, setQuery],
  );

  const showPanel = open && query.trim().length >= 2;
  const showEmpty =
    showPanel && !loading && response && response.total === 0;

  return (
    <div ref={wrapperRef} className={cn('relative w-full max-w-xl', className)}>
      {/* We skip the built-in shadcn CommandInput so we can add the kbd hint
          and custom styling. Server-side does the filtering so we disable
          cmdk's built-in matcher with `shouldFilter={false}`. */}
      <Command shouldFilter={false} loop label="Buscar">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="global-search-dropdown"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            placeholder="Busca tickets, clientes, agentes, artículos..."
            className={cn(
              'h-9 w-full rounded-md border border-input bg-input-background pl-9 pr-16 text-sm',
              'placeholder:text-muted-foreground',
              'focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20',
              'transition-[border,box-shadow]',
            )}
          />
          {loading ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <kbd
              className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline"
              title="Abrir buscador completo"
            >
              ⌘K
            </kbd>
          )}
        </div>

        {showPanel && (
          <div
            id="global-search-dropdown"
            className={cn(
              'absolute left-0 right-0 top-[calc(100%+6px)] z-50',
              'overflow-hidden rounded-lg border border-border bg-popover shadow-lg',
              'animate-in fade-in-0 slide-in-from-top-2 duration-150',
            )}
          >
            <CommandList className="max-h-[min(70vh,30rem)] overflow-y-auto p-1">
              {showEmpty && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-foreground">
                    Sin resultados para <span className="font-medium">"{query}"</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prueba otras palabras o menos caracteres.
                  </p>
                </div>
              )}

              {response &&
                nonEmptyGroups.map((type) => {
                  const meta = SEARCH_GROUPS[type];
                  const hits = response.groups[type] ?? [];
                  const GroupIcon = meta.icon;
                  return (
                    <CommandGroup
                      key={type}
                      heading={
                        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          <GroupIcon className="h-3 w-3" />
                          {meta.label}
                          <span className="ml-auto text-muted-foreground/60">{hits.length}</span>
                        </span>
                      }
                    >
                      {hits.map((hit) => (
                        <SearchResultItem
                          key={`${hit.entityType}-${hit.id}`}
                          hit={hit}
                          query={query}
                          onSelect={() => handleSelect(hit.url)}
                          compact
                        />
                      ))}
                    </CommandGroup>
                  );
                })}

              <div className="border-t border-border px-2 py-1.5">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    onOpenPalette();
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span>Abrir buscador completo</span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border bg-background px-1 font-mono">⌘</kbd>
                    <kbd className="rounded border border-border bg-background px-1 font-mono">K</kbd>
                  </span>
                </button>
              </div>
            </CommandList>
          </div>
        )}
      </Command>
    </div>
  );
}
