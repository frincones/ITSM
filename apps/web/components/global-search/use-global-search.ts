'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  globalSearch,
  type GlobalSearchResponse,
  type SearchEntityType,
  type SearchHit,
} from '~/lib/actions/search';

import {
  ORDERED_ENTITY_TYPES,
  SEARCH_GROUPS,
} from './search-groups';

const RECENT_KEY = 'novadesk.search.recent';
const RECENT_MAX = 5;
const DEBOUNCE_MS = 250;

export interface UseGlobalSearchResult {
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
  error: string | null;
  response: GlobalSearchResponse | null;
  /** Entity types (ordered) that actually had at least one hit. */
  nonEmptyGroups: SearchEntityType[];
  recents: string[];
  pushRecent: (q: string) => void;
  clearRecents: () => void;
}

function readRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/**
 * Debounced global search hook with in-flight cancellation and localStorage
 * "recent searches" cache. Shared by the Cmd+K palette and the topbar
 * inline dropdown so both surfaces feel identical.
 */
export function useGlobalSearch(initialQuery = ''): UseGlobalSearchResult {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<GlobalSearchResponse | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const runIdRef = useRef(0);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResponse(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const runId = ++runIdRef.current;

    const handle = window.setTimeout(async () => {
      const res = await globalSearch(q);
      // Stale result guard — if another keystroke bumped runId, drop this.
      if (runId !== runIdRef.current) return;
      if (res.error) {
        setError(res.error);
        setResponse(null);
      } else {
        setResponse(res.data);
      }
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [query]);

  const nonEmptyGroups = response
    ? ORDERED_ENTITY_TYPES.filter((t) => (response.groups[t]?.length ?? 0) > 0)
    : [];

  const pushRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, RECENT_MAX);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    try {
      window.localStorage.removeItem(RECENT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    query,
    setQuery,
    loading,
    error,
    response,
    nonEmptyGroups,
    recents,
    pushRecent,
    clearRecents,
  };
}

/** Convenience re-exports so callers import from one place. */
export type { SearchHit, SearchEntityType, GlobalSearchResponse };
export { SEARCH_GROUPS };
