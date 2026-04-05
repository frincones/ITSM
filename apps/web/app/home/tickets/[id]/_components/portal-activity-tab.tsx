'use client';

import {
  MousePointer, MessageSquare, Eye, Search, Upload,
  Ticket, ThumbsUp, Layout, BookOpen,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';

interface ActivityEvent {
  id: string;
  event_type: string;
  event_data: Record<string, any> | null;
  page_url: string | null;
  created_at: string;
  session_id: string;
}

interface PortalActivityTabProps {
  events: ActivityEvent[];
}

const eventConfig: Record<string, { icon: any; label: string; color: string }> = {
  page_view: { icon: Eye, label: 'Visitó página', color: 'text-blue-500' },
  article_view: { icon: BookOpen, label: 'Leyó artículo', color: 'text-purple-500' },
  article_search: { icon: Search, label: 'Buscó en KB', color: 'text-cyan-500' },
  chat_start: { icon: MessageSquare, label: 'Inició chat', color: 'text-green-500' },
  chat_message: { icon: MessageSquare, label: 'Envió mensaje', color: 'text-indigo-500' },
  ticket_view: { icon: Ticket, label: 'Vió ticket', color: 'text-orange-500' },
  ticket_create: { icon: Ticket, label: 'Creó ticket', color: 'text-red-500' },
  file_upload: { icon: Upload, label: 'Subió archivo', color: 'text-teal-500' },
  button_click: { icon: MousePointer, label: 'Click en botón', color: 'text-gray-500' },
  category_select: { icon: Layout, label: 'Seleccionó categoría', color: 'text-amber-500' },
  feedback: { icon: ThumbsUp, label: 'Dio feedback', color: 'text-green-600' },
};

export function PortalActivityTab({ events }: PortalActivityTabProps) {
  if (!events.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No hay actividad registrada del portal para este usuario.
      </div>
    );
  }

  // Group by session
  const sessions = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const list = sessions.get(e.session_id) ?? [];
    list.push(e);
    sessions.set(e.session_id, list);
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Actividad del usuario en el portal — {events.length} eventos en{' '}
          {sessions.size} sesion{sessions.size > 1 ? 'es' : ''}
        </p>
      </div>

      {Array.from(sessions.entries()).map(([sessionId, sessionEvents]) => (
        <div key={sessionId} className="rounded-lg border">
          <div className="border-b bg-muted/50 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Sesión {sessionId.slice(0, 8)} — {new Date(sessionEvents[0]!.created_at).toLocaleString('es')}
            </span>
          </div>
          <div className="divide-y">
            {sessionEvents.map((evt) => {
              const config = eventConfig[evt.event_type] ?? {
                icon: MousePointer, label: evt.event_type, color: 'text-gray-400',
              };
              const Icon = config.icon;
              const data = evt.event_data ?? {};

              return (
                <div key={evt.id} className="flex items-start gap-3 px-3 py-2">
                  <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{config.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(evt.created_at).toLocaleTimeString('es')}
                      </span>
                    </div>
                    {/* Event details */}
                    {data.title && (
                      <p className="truncate text-xs text-muted-foreground">{data.title as string}</p>
                    )}
                    {data.label && (
                      <Badge variant="outline" className="mt-0.5 text-[10px]">{data.label as string}</Badge>
                    )}
                    {data.message_preview && (
                      <p className="truncate text-xs text-muted-foreground italic">
                        &quot;{(data.message_preview as string).slice(0, 80)}&quot;
                      </p>
                    )}
                    {data.fileName && (
                      <p className="text-xs text-muted-foreground">📎 {data.fileName as string}</p>
                    )}
                    {data.ticket_number && (
                      <Badge variant="secondary" className="mt-0.5 text-[10px]">{data.ticket_number as string}</Badge>
                    )}
                    {data.path && !data.title && (
                      <p className="truncate text-[10px] text-muted-foreground">{data.path as string}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
