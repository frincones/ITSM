'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Settings,
  CheckCheck,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@kit/ui/tabs';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Notification {
  id: string;
  type: string | null;
  title: string;
  body: string | null;
  read: boolean; // maps to is_read in DB
  created_at: string;
  data: Record<string, unknown> | null;
}

interface NotificationsClientProps {
  notifications: Notification[];
  agentId: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getTypeConfig(type: string | null) {
  switch (type) {
    case 'ticket':
    case 'ticket_assigned':
    case 'ticket_updated':
      return {
        icon: AlertTriangle,
        iconColor: 'text-orange-600',
        bgColor: 'bg-orange-50',
      };
    case 'sla':
    case 'sla_breach':
    case 'sla_warning':
      return {
        icon: Clock,
        iconColor: 'text-red-600',
        bgColor: 'bg-red-50',
      };
    case 'approval':
    case 'change_approved':
      return {
        icon: CheckCircle2,
        iconColor: 'text-green-600',
        bgColor: 'bg-green-50',
      };
    case 'comment':
      return {
        icon: Info,
        iconColor: 'text-blue-600',
        bgColor: 'bg-blue-50',
      };
    case 'system':
      return {
        icon: Info,
        iconColor: 'text-purple-600',
        bgColor: 'bg-purple-50',
      };
    default:
      return {
        icon: Bell,
        iconColor: 'text-gray-600',
        bgColor: 'bg-gray-50',
      };
  }
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

function getTabType(type: string | null): string {
  if (!type) return 'other';
  if (type.includes('ticket')) return 'tickets';
  if (type.includes('change') || type.includes('approval')) return 'changes';
  if (type.includes('sla')) return 'sla';
  return 'other';
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function NotificationsClient({
  notifications: initialNotifications,
  agentId,
}: NotificationsClientProps) {
  const router = useRouter();
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [activeTab, setActiveTab] = useState('all');

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Supabase Realtime subscription for new notifications
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${agentId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${agentId}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  const markAsRead = useCallback(
    async (id: string) => {
      const supabase = getSupabaseBrowserClient();
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    },
    [],
  );

  const markAsUnread = useCallback(
    async (id: string) => {
      const supabase = getSupabaseBrowserClient();
      await supabase
        .from('notifications')
        .update({ is_read: false })
        .eq('id', id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
      );
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [notifications]);

  const dismissNotification = useCallback(
    async (id: string) => {
      const supabase = getSupabaseBrowserClient();
      await supabase.from('notifications').delete().eq('id', id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    },
    [],
  );

  // Filter notifications by tab
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !n.read;
    return getTabType(n.type) === activeTab;
  });

  const renderNotification = (notification: Notification) => {
    const config = getTypeConfig(notification.type);
    const Icon = config.icon;

    return (
      <Card
        key={notification.id}
        className={`hover:shadow-md transition-all cursor-pointer ${
          !notification.read ? 'border-indigo-200 bg-indigo-50/30' : ''
        }`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-10 h-10 ${config.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
            >
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-medium text-gray-900">
                  {notification.title}
                </h3>
                {!notification.read && (
                  <Badge className="bg-indigo-600 text-white text-xs flex-shrink-0">
                    New
                  </Badge>
                )}
              </div>
              {notification.body && (
                <p className="text-sm text-gray-600 mb-2">
                  {notification.body}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {timeAgo(notification.created_at)}
                </span>
                <div className="flex items-center gap-1">
                  {notification.read ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Mark as unread"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsUnread(notification.id);
                      }}
                    >
                      <Bell className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Mark as read"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissNotification(notification.id);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Bell className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Notifications
              </h1>
              <p className="text-sm text-gray-500">
                {unreadCount} unread notification
                {unreadCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="w-4 h-4 mr-2" />
              Mark all as read
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="all">
            All
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-indigo-600 text-white">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="sla">SLA Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No notifications to show</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map(renderNotification)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
