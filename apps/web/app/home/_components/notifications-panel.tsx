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
}

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

function playNotificationSound() {
  try {
    const AC: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AC) return;
    const ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);

    // Two-note ding: C6 (1046.5) → E6 (1318.5), soft exponential decay
    [{ f: 1046.5, t: now }, { f: 1318.5, t: now + 0.12 }].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.4);
    });

    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // autoplay policy or unsupported — silently ignore
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
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    setItems((data as Notification[] | null) ?? []);
    setLoaded(true);
  }, [userId]);

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
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
          playNotificationSound();
          toast(n.title, {
            description: n.body ?? undefined,
            duration: 6000,
            position: 'bottom-right',
            action: n.link
              ? {
                  label: 'Ver',
                  onClick: () => {
                    if (n.link) router.push(n.link);
                  },
                }
              : undefined,
          });
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
  }, [userId, fetchNotifications, router]);

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
          ) : (
            <div className="flex flex-col">
              {filtered.map((n) => {
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
                        {n.is_read ? (
                          <Bell className="h-3 w-3" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
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
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
