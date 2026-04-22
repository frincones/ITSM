'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Info,
  Settings,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
  client_name?: string | null;
}

type GroupingMode = 'none' | 'client';

interface NotificationsPanelProps {
  userId: string | undefined;
}

type TabValue = 'all' | 'unread' | 'tickets' | 'changes' | 'sla';

function getVisualConfig(n: Notification) {
  const title = n.title.toLowerCase();
  if (title.includes('sla') || title.includes('vencid')) {
    return { icon: Clock, iconColor: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950/40' };
  }
  if (n.resource_type === 'change' || title.includes('cambio') || title.includes('aprob')) {
    return { icon: CheckCircle2, iconColor: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950/40' };
  }
  if (title.includes('comentario') || title.includes('respondi')) {
    return { icon: Info, iconColor: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/40' };
  }
  if (n.resource_type === 'ticket' || title.includes('ticket')) {
    return { icon: AlertTriangle, iconColor: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950/40' };
  }
  return { icon: Bell, iconColor: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800' };
}

function matchesTab(n: Notification, tab: TabValue): boolean {
  if (tab === 'all') return true;
  if (tab === 'unread') return !n.is_read;
  if (tab === 'tickets') return n.resource_type === 'ticket';
  if (tab === 'changes') return n.resource_type === 'change';
  if (tab === 'sla') {
    const t = n.title.toLowerCase();
    return t.includes('sla') || t.includes('vencid');
  }
  return false;
}

// Shared AudioContext — created lazily and unlocked on first user gesture
// so subsequent realtime events can play sound without a fresh interaction.
let sharedAudioCtx: AudioContext | null = null;

function getOrCreateAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx) return sharedAudioCtx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    sharedAudioCtx = new AC();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function unlockAudio() {
  const ctx = getOrCreateAudioCtx();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

function playNotificationSound() {
  try {
    const ctx = getOrCreateAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.45; // louder than the original 0.15
    master.connect(ctx.destination);

    // Three-note arpeggio C6 → E6 → G6 with triangle oscillator (more present
    // than a pure sine), each note 160ms with overlapping decay for a clearer
    // 'ding-ding' that cuts through OS audio.
    [
      { f: 1046.5, t: now },
      { f: 1318.5, t: now + 0.09 },
      { f: 1567.98, t: now + 0.18 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {
    // Unsupported — silently ignore
  }
}

function showBrowserNotification(
  title: string,
  body: string | null,
  link: string | null,
  tag: string,
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // Skip duplicate desktop alert when the tab is actually in focus —
  // the in-app toast + sound are enough there.
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const n = new Notification(title, {
      body: body ?? undefined,
      icon: '/favicon.ico',
      tag,
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      if (link) window.location.href = link;
      n.close();
    };
  } catch {
    /* ignore */
  }
}

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Justo ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} d`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationsPanel({ userId }: NotificationsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [grouping, setGrouping] = useState<GroupingMode>('none');
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Enrich notifications with the client name of their linked ticket.
  // resource_type='ticket' → tickets.organization_id → organizations.name.
  // Separate query because notifications.resource_id is a generic uuid
  // without a PostgREST relationship to tickets.
  const enrichWithClient = useCallback(
    async (rows: Notification[]) => {
      const ticketIds = Array.from(
        new Set(
          rows
            .filter((r) => r.resource_type === 'ticket' && r.resource_id)
            .map((r) => r.resource_id as string),
        ),
      );
      if (ticketIds.length === 0) return rows;
      const supabase = getSupabaseBrowserClient();
      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, organization:organizations(name)')
        .in('id', ticketIds);
      const nameById = new Map<string, string | null>();
      (tickets ?? []).forEach((t: { id: string; organization: { name: string } | { name: string }[] | null }) => {
        const org = Array.isArray(t.organization) ? t.organization[0] : t.organization;
        nameById.set(t.id, org?.name ?? null);
      });
      return rows.map((r) =>
        r.resource_id && nameById.has(r.resource_id)
          ? { ...r, client_name: nameById.get(r.resource_id) ?? null }
          : r,
      );
    },
    [],
  );

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items],
  );

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, is_read, resource_type, resource_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data as Notification[] | null) ?? [];
    const enriched = await enrichWithClient(rows);
    setItems(enriched);
    setLoaded(true);
  }, [userId, enrichWithClient]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const n = payload.new as Notification;
          const [enriched] = await enrichWithClient([n]);
          const toInsert = enriched ?? n;
          setItems((prev) => (prev.some((p) => p.id === toInsert.id) ? prev : [toInsert, ...prev]));
          playNotificationSound();
          showBrowserNotification(toInsert.title, toInsert.body, toInsert.link, toInsert.id);
          const cfg = getVisualConfig(toInsert);
          const ToastIcon = cfg.icon;
          toast.custom(
            (id) => (
              <div className="pointer-events-auto flex w-[380px] items-start gap-3 overflow-hidden rounded-xl border border-indigo-300/60 bg-gradient-to-br from-indigo-50 via-white to-indigo-50/60 p-3 shadow-[0_10px_40px_-10px_rgba(79,70,229,0.5)] ring-1 ring-indigo-500/20 dark:border-indigo-500/40 dark:from-indigo-950/60 dark:via-card dark:to-indigo-950/40 animate-in slide-in-from-right-4 fade-in duration-300">
                <span className="absolute inset-y-0 left-0 w-1 bg-indigo-600" aria-hidden />
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${cfg.bgColor} ring-2 ring-white/80 dark:ring-background`}>
                  <ToastIcon className={`h-4.5 w-4.5 ${cfg.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold leading-tight text-foreground">
                      {toInsert.title}
                    </h4>
                    <button
                      type="button"
                      onClick={() => toast.dismiss(id)}
                      className="-mr-1 -mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Cerrar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {toInsert.body && (
                    <p className="mb-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {toInsert.body}
                    </p>
                  )}
                  {toInsert.link && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (toInsert.link) router.push(toInsert.link);
                          toast.dismiss(id);
                        }}
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => toast.dismiss(id)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Ignorar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ),
            {
              duration: 12000,
              position: 'bottom-right',
            },
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (deletedId) {
            setItems((prev) => prev.filter((p) => p.id !== deletedId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications, router, enrichWithClient]);

  // One-time audio unlock on first user gesture + ask for Notification permission
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Request desktop notification permission (default prompt once)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const handler = () => {
      unlockAudio();
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, []);

  // Close on Escape + click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const markAsRead = useCallback(async (id: string) => {
    const supabase = getSupabaseBrowserClient();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }, []);

  const markAsUnread = useCallback(async (id: string) => {
    const supabase = getSupabaseBrowserClient();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
    await supabase.from('notifications').update({ is_read: false }).eq('id', id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const supabase = getSupabaseBrowserClient();
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  }, [items]);

  const dismiss = useCallback(async (id: string) => {
    const supabase = getSupabaseBrowserClient();
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }, []);

  const handleItemClick = useCallback(
    (n: Notification) => {
      if (!n.is_read) markAsRead(n.id);
      if (n.link) {
        setOpen(false);
        router.push(n.link);
      }
    },
    [markAsRead, router],
  );

  const filtered = items.filter((n) => matchesTab(n, activeTab));

  const renderRow = useCallback(
    (n: Notification) => {
      const cfg = getVisualConfig(n);
      const Icon = cfg.icon;
      return (
        <div
          key={n.id}
          onClick={() => handleItemClick(n)}
          className={`group relative flex cursor-pointer items-start gap-2.5 border-b border-border/60 px-2 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50 ${
            !n.is_read ? '' : 'opacity-70'
          }`}
        >
          <div
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${cfg.bgColor}`}
          >
            <Icon className={`h-3 w-3 ${cfg.iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate text-[13px] font-medium leading-tight text-foreground">
                {n.title}
              </h3>
              <span className="ml-auto flex-shrink-0 text-[11px] text-muted-foreground">
                {timeAgo(n.created_at)}
              </span>
            </div>
            {n.body && (
              <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">
                {n.body}
              </p>
            )}
          </div>
          {!n.is_read && (
            <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-indigo-600" />
          )}
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-background/95 p-0.5 opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              title={n.is_read ? 'Marcar sin leer' : 'Marcar leída'}
              onClick={(e) => {
                e.stopPropagation();
                if (n.is_read) markAsUnread(n.id);
                else markAsRead(n.id);
              }}
            >
              {n.is_read ? <Bell className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              title="Descartar"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(n.id);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      );
    },
    [handleItemClick, markAsRead, markAsUnread, dismiss],
  );

  // Group filtered items by client when grouping = 'client'
  const groups = useMemo(() => {
    if (grouping !== 'client') return null;
    const byClient = new Map<string, Notification[]>();
    filtered.forEach((n) => {
      const key = n.client_name ?? 'Sin cliente';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(n);
    });
    // Stable sort: clients with unread first, then alphabetical
    return Array.from(byClient.entries()).sort((a, b) => {
      const aUnread = a[1].some((n) => !n.is_read);
      const bUnread = b[1].some((n) => !n.is_read);
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });
  }, [filtered, grouping]);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="relative"
        title="Notificaciones"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Panel de notificaciones"
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/40">
              <Bell className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Notificaciones
              </h2>
              <p className="text-xs text-muted-foreground">
                {unreadCount === 0 ? 'Todo al día' : `${unreadCount} sin leer`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-border px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
              >
                <CheckCheck className="mr-1.5 h-4 w-4" />
                Marcar todas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setOpen(false);
                  router.push('/home/notifications');
                }}
              >
                <Settings className="mr-1.5 h-4 w-4" />
                Ajustes
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-muted-foreground">Agrupar:</label>
              <select
                value={grouping}
                onChange={(e) => setGrouping(e.target.value as GroupingMode)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="none">Sin agrupar</option>
                <option value="client">Por cliente</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-b border-border px-6 pt-3 pb-2">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabValue)}
          >
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="all">
                Todas
                {items.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {items.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="unread">
                Sin leer
                {unreadCount > 0 && (
                  <Badge className="ml-2 bg-indigo-600 text-white hover:bg-indigo-600">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tickets">Tickets</TabsTrigger>
              <TabsTrigger value="changes">Cambios</TabsTrigger>
              <TabsTrigger value="sla">SLA</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-1">
          {!loaded ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No hay notificaciones
              </p>
            </div>
          ) : groups ? (
            <div className="flex flex-col">
              {groups.map(([clientName, rows]) => {
                const unreadInGroup = rows.filter((n) => !n.is_read).length;
                return (
                  <section key={clientName} className="mb-1">
                    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/95 px-2 py-1.5 backdrop-blur">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {clientName}
                        </span>
                        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                          {rows.length}
                        </span>
                      </div>
                      {unreadInGroup > 0 && (
                        <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">
                          {unreadInGroup}
                        </span>
                      )}
                    </header>
                    <div className="flex flex-col">
                      {rows.map((n) => renderRow(n))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col">{filtered.map((n) => renderRow(n))}</div>
          )}
        </div>
      </div>
    </>
  );
}
