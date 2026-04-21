'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Card, CardContent } from '@kit/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@kit/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

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
  userId: string;
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

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items],
  );

  const fetchNotifications = useCallback(async () => {
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
          toast(n.title, {
            description: n.body ?? undefined,
            duration: 6000,
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notificaciones">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/40">
                <Bell className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <SheetTitle>Notificaciones</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {unreadCount === 0
                    ? 'Todo al día'
                    : `${unreadCount} sin leer`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
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
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border px-6 pt-3 pb-2">
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
          </div>

          <TabsContent
            value={activeTab}
            className="mt-0 flex-1 overflow-y-auto px-4 py-3"
          >
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
              <div className="space-y-2">
                {filtered.map((n) => {
                  const cfg = getVisualConfig(n);
                  const Icon = cfg.icon;
                  return (
                    <Card
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      className={`cursor-pointer border transition-all hover:shadow-sm ${
                        !n.is_read
                          ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20'
                          : ''
                      }`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${cfg.bgColor}`}
                          >
                            <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                                {n.title}
                              </h3>
                              {!n.is_read && (
                                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-600" />
                              )}
                            </div>
                            {n.body && (
                              <p className="mb-1.5 line-clamp-2 text-xs text-muted-foreground">
                                {n.body}
                              </p>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {timeAgo(n.created_at)}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title={n.is_read ? 'Marcar sin leer' : 'Marcar leída'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (n.is_read) markAsUnread(n.id);
                                    else markAsRead(n.id);
                                  }}
                                >
                                  {n.is_read ? (
                                    <Bell className="h-3.5 w-3.5" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title="Descartar"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dismiss(n.id);
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
