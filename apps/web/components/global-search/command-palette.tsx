'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandSeparator,
} from '@kit/ui/command';

import { Clock, Loader2, Search } from 'lucide-react';

import { useGlobalSearch, SEARCH_GROUPS } from './use-global-search';
import { SearchResultItem } from './search-result-item';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Cmd+K global palette. Renders over a backdrop; shares state via the
 * `useGlobalSearch` hook with the inline topbar dropdown so both surfaces
 * present the same results.
 *
 * Layout kept deliberately minimal: single column, dense rows, subtle
 * muted group headers. Modern but quiet — the visual weight stays on the
 * user's content.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const {
    query,
    setQuery,
    loading,
    response,
    nonEmptyGroups,
    recents,
    pushRecent,
  } = useGlobalSearch();

  // Reset query every time the palette closes so the user starts fresh.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) setQuery('');
    wasOpen.current = open;
  }, [open, setQuery]);

  const handleSelect = useCallback(
    (url: string) => {
      pushRecent(query);
      onOpenChange(false);
      router.push(url);
    },
    [onOpenChange, pushRecent, query, router],
  );

  const handleRecentPick = useCallback(
    (q: string) => {
      setQuery(q);
    },
    [setQuery],
  );

  const showRecents = query.trim().length < 2 && recents.length > 0;
  const showEmptyState =
    query.trim().length >= 2 && !loading && response && response.total === 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* Input with trailing loading spinner */}
      <div className="relative">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Busca cualquier cosa — ticket, cliente, agente, artículo..."
          autoFocus
        />
        {loading && (
          <Loader2 className="pointer-events-none absolute right-10 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <CommandList className="max-h-[60vh]">
        {/* Hint when input is empty */}
        {query.trim().length < 2 && !showRecents && (
          <div className="px-4 py-10 text-center">
            <Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
            <p className="text-sm text-foreground">Escribe al menos 2 caracteres</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Busca por número, título, email, nombre, etiqueta o contenido
            </p>
          </div>
        )}

        {/* Recent searches when input is empty */}
        {showRecents && (
          <CommandGroup heading="Búsquedas recientes">
            {recents.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRecentPick(r)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{r}</span>
              </button>
            ))}
          </CommandGroup>
        )}

        {/* No matches */}
        {showEmptyState && (
          <CommandEmpty>
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-foreground">
                Sin resultados para <span className="font-medium">"{query}"</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Prueba otras palabras o menos caracteres.
              </p>
            </div>
          </CommandEmpty>
        )}

        {/* Grouped results */}
        {!showEmptyState &&
          response &&
          nonEmptyGroups.map((type, idx) => {
            const meta = SEARCH_GROUPS[type];
            const hits = response.groups[type] ?? [];
            const GroupIcon = meta.icon;
            return (
              <div key={type}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup
                  heading={
                    (
                      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <GroupIcon className="h-3 w-3" />
                        {meta.label}
                        <span className="ml-1 text-muted-foreground/60">· {hits.length}</span>
                      </span>
                    ) as unknown as string
                  }
                >
                  {hits.map((hit) => (
                    <SearchResultItem
                      key={`${hit.entityType}-${hit.id}`}
                      hit={hit}
                      query={query}
                      onSelect={() => handleSelect(hit.url)}
                    />
                  ))}

                  {meta.viewAllUrl && (
                    <button
                      type="button"
                      onClick={() => handleSelect(meta.viewAllUrl!(query))}
                      className="mx-2 my-1 flex h-8 w-[calc(100%-1rem)] items-center justify-center rounded-md text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Ver todos los resultados en {meta.label.toLowerCase()} →
                    </button>
                  )}
                </CommandGroup>
              </div>
            );
          })}
      </CommandList>

      {/* Footer keyboard legend */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">↑</kbd>
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">↓</kbd>
            Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">⏎</kbd>
            Abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">Esc</kbd>
            Cerrar
          </span>
        </div>
        {response && response.elapsedMs > 0 && (
          <span className="tabular-nums">
            {response.total} resultados · {response.elapsedMs}ms
          </span>
        )}
      </div>
    </CommandDialog>
  );
}
