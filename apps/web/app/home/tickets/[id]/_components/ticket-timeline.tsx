'use client';

import {
  Clock,
  Paperclip,
  Eye,
  MessageSquare,
  CheckCircle2,
  ListTodo,
  ArrowRight,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader } from '@kit/ui/card';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TimelineFollowup {
  id: string;
  content: string;
  is_private: boolean;
  created_at: string;
  author?: { id: string; name: string; avatar_url?: string | null } | null;
}

export interface TimelineTask {
  id: string;
  title: string;
  description?: string | null;
  status?: string;
  created_at: string;
  assigned_agent?: { id: string; name: string; avatar_url?: string | null } | null;
}

export interface TimelineSolution {
  id: string;
  content: string;
  created_at: string;
  author?: { id: string; name: string; avatar_url?: string | null } | null;
}

export interface TimelineAttachment {
  id: string;
  filename: string;
  file_url?: string | null;
  created_at: string;
}

interface TimelineEntry {
  id: string;
  type: 'followup' | 'task' | 'solution' | 'created' | 'status_change';
  timestamp: string;
  user: string;
  avatarUrl?: string | null;
  isPrivate?: boolean;
  content: string;
  attachments?: string[];
}

interface TicketTimelineProps {
  ticketCreatedAt: string;
  ticketCreatedBy?: string;
  followups: TimelineFollowup[];
  tasks: TimelineTask[];
  solutions: TimelineSolution[];
  attachments: TimelineAttachment[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function buildTimeline(props: TicketTimelineProps): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // Created event
  entries.push({
    id: 'created',
    type: 'created',
    timestamp: props.ticketCreatedAt,
    user: props.ticketCreatedBy ?? 'System',
    content: 'Ticket created',
  });

  // Followups
  for (const f of props.followups) {
    const relatedAttachments = props.attachments
      .filter(
        (a) =>
          new Date(a.created_at).getTime() - new Date(f.created_at).getTime() <
            60_000 &&
          new Date(a.created_at).getTime() - new Date(f.created_at).getTime() >=
            0,
      )
      .map((a) => a.filename);

    entries.push({
      id: `followup-${f.id}`,
      type: 'followup',
      timestamp: f.created_at,
      user: f.author?.name ?? 'Unknown',
      avatarUrl: f.author?.avatar_url,
      isPrivate: f.is_private,
      content: f.content,
      attachments: relatedAttachments.length > 0 ? relatedAttachments : undefined,
    });
  }

  // Tasks
  for (const t of props.tasks) {
    entries.push({
      id: `task-${t.id}`,
      type: 'task',
      timestamp: t.created_at,
      user: t.assigned_agent?.name ?? 'Unassigned',
      avatarUrl: t.assigned_agent?.avatar_url,
      content: `Task: ${t.title}${t.description ? ` - ${t.description}` : ''}`,
    });
  }

  // Solutions
  for (const s of props.solutions) {
    entries.push({
      id: `solution-${s.id}`,
      type: 'solution',
      timestamp: s.created_at,
      user: s.author?.name ?? 'Unknown',
      avatarUrl: s.author?.avatar_url,
      content: s.content,
    });
  }

  // Sort chronologically
  entries.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return entries;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function TicketTimeline(props: TicketTimelineProps) {
  const entries = buildTimeline(props);

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.id}>
          {entry.type === 'followup' || entry.type === 'solution' ? (
            <Card
              className={
                entry.isPrivate
                  ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5'
                  : undefined
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{getInitials(entry.user)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {entry.user}
                        </span>
                        {entry.type === 'solution' ? (
                          <Badge className="border-green-200 bg-green-100 text-xs text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-300">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Solution
                          </Badge>
                        ) : entry.isPrivate ? (
                          <Badge className="border-amber-200 bg-amber-100 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300">
                            <Eye className="mr-1 h-3 w-3" />
                            Internal Note
                          </Badge>
                        ) : (
                          <Badge className="border-blue-200 bg-blue-100 text-xs text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300">
                            <MessageSquare className="mr-1 h-3 w-3" />
                            Public Reply
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {entry.content}
                </p>
                {entry.attachments && entry.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                      >
                        <Paperclip className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-700 dark:text-gray-300">
                          {file}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : entry.type === 'task' ? (
            <div className="flex items-center gap-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20">
                <ListTodo className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {entry.user}
                  </span>{' '}
                  {entry.content}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-500">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
            </div>
          ) : entry.type === 'created' ? (
            <div className="flex items-center gap-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
                <ArrowRight className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {entry.user}
                  </span>{' '}
                  {entry.content}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-500">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <Clock className="h-4 w-4 text-gray-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {entry.user}
                  </span>{' '}
                  {entry.content}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-500">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
