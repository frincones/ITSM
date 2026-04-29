'use client';

import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { Eye, MessageSquare, Bot, Cog } from 'lucide-react';

import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import { Badge } from '@kit/ui/badge';

import type { PreviewFollowup } from '~/lib/actions/ticket-preview';

interface TicketPreviewTimelineProps {
  followups: PreviewFollowup[];
  totalCount: number;
  ticketId: string;
}

function getInitials(name?: string | null): string {
  if (!name) return '??';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function stripHtml(html: string): string {
  if (typeof window === 'undefined') {
    // SSR-safe naive strip — server side won't run this since 'use client'
    return html.replace(/<[^>]+>/g, '');
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function getDisplayName(f: PreviewFollowup): string {
  if (f.author?.name) return f.author.name;
  switch (f.author_type) {
    case 'ai_agent':
      return 'Asistente IA';
    case 'system':
      return 'Sistema';
    case 'contact':
      return 'Solicitante';
    default:
      return 'Agente';
  }
}

function getAuthorIcon(f: PreviewFollowup) {
  switch (f.author_type) {
    case 'ai_agent':
      return <Bot className="h-3 w-3" />;
    case 'system':
      return <Cog className="h-3 w-3" />;
    default:
      return null;
  }
}

function FollowupItem({ f }: { f: PreviewFollowup }) {
  const [expanded, setExpanded] = useState(false);

  // Prefer the plain `content` for the snippet — content_html may include
  // HTML comments (idempotency markers) and rich formatting that doesn't
  // collapse cleanly into 2 lines. Strip any embedded HTML defensively.
  const cleanText = stripHtml(f.content)
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const isLong = cleanText.length > 180;
  const snippet = expanded || !isLong ? cleanText : `${cleanText.slice(0, 180)}…`;

  return (
    <div
      className={
        f.is_private
          ? 'rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/5'
          : 'rounded-md border border-border bg-card p-3 text-sm'
      }
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarFallback className="text-[10px]">
              {getInitials(getDisplayName(f))}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-xs font-medium">
            {getDisplayName(f)}
          </span>
          <Badge
            variant="outline"
            className={
              f.is_private
                ? 'h-4 gap-1 border-amber-300 px-1 text-[9px] text-amber-700 dark:border-amber-500/40 dark:text-amber-300'
                : 'h-4 gap-1 border-blue-300 px-1 text-[9px] text-blue-700 dark:border-blue-500/40 dark:text-blue-300'
            }
          >
            {f.is_private ? (
              <>
                <Eye className="h-2.5 w-2.5" /> Interna
              </>
            ) : (
              <>
                <MessageSquare className="h-2.5 w-2.5" /> Pública
              </>
            )}
          </Badge>
          {getAuthorIcon(f)}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatDistanceToNowStrict(new Date(f.created_at), {
            locale: es,
            addSuffix: true,
          })}
        </span>
      </div>

      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">
        {snippet}
      </p>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="mt-1 text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

export function TicketPreviewTimeline({
  followups,
  totalCount,
  ticketId,
}: TicketPreviewTimelineProps) {
  const hasMore = totalCount > followups.length;

  if (followups.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
        Aún no hay mensajes en este ticket.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Newest first — server already orders DESC */}
      {followups.map((f) => (
        <FollowupItem key={f.id} f={f} />
      ))}

      {hasMore && (
        <a
          href={`/home/tickets/${ticketId}`}
          className="block text-center text-[11px] font-medium text-muted-foreground hover:text-primary hover:underline"
        >
          Ver los {totalCount} mensajes del historial →
        </a>
      )}
    </div>
  );
}
