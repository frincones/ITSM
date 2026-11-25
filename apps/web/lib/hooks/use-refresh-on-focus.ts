'use client';

import { useEffect, useRef } from 'react';

import { useRouter } from 'next/navigation';

/**
 * Re-run the page's server components when the user comes back to the tab.
 *
 * This replaces live postgres_changes subscriptions for views where "fresh
 * when I look at it" is enough. Those subscriptions kept a Realtime worker
 * polling the WAL around the clock, the single largest load on the DB.
 *
 * Throttled so tab-switching back and forth doesn't hammer the server.
 */
export function useRefreshOnFocus(minIntervalMs = 30_000): void {
  const router = useRouter();
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh.current < minIntervalMs) return;
      lastRefresh.current = now;
      router.refresh();
    };

    // `focus` covers switching windows; `visibilitychange` covers tabs.
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, minIntervalMs]);
}
