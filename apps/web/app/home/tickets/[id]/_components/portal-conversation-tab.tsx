'use client';

import { Bot, User, Paperclip, FileIcon } from 'lucide-react';

import { Badge } from '@kit/ui/badge';

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'contact' | 'agent' | 'ai_agent' | 'system';
  content_text: string | null;
  attachments: any;
  metadata: any;
  created_at: string;
}

interface PortalConversationTabProps {
  messages: Message[];
}

export function PortalConversationTab({ messages }: PortalConversationTabProps) {
  if (!messages.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Este ticket no tiene una conversación de portal asociada.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Conversación completa del portal AI — {messages.length} mensajes
        </p>
      </div>

      {messages.map((msg) => {
        const isUser = msg.direction === 'inbound';
        const isAI = msg.sender_type === 'ai_agent';
        const ticketCreated = msg.metadata?.ticketCreated;
        const msgAttachments = msg.metadata?.attachments as Array<{
          fileName: string; fileType: string; path: string;
        }> | undefined;

        return (
          <div key={msg.id} className={`flex gap-3 ${isUser ? '' : ''}`}>
            {/* Avatar */}
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
              isUser
                ? 'bg-gray-200 dark:bg-gray-700'
                : 'bg-gradient-to-br from-indigo-500 to-purple-600'
            }`}>
              {isUser
                ? <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                : <Bot className="h-4 w-4 text-white" />
              }
            </div>

            {/* Content */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {isUser ? 'Usuario (Portal)' : isAI ? 'AI Assistant' : 'Agente'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(msg.created_at).toLocaleString('es')}
                </span>
                {isAI && <Badge variant="secondary" className="text-[10px]">AI</Badge>}
              </div>

              <div className={`rounded-lg px-3 py-2 text-sm ${
                isUser
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : 'bg-indigo-50 dark:bg-indigo-950/30'
              }`}>
                {msg.content_text ?? '(sin contenido)'}
              </div>

              {/* Attachments */}
              {msgAttachments && msgAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msgAttachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-[10px] dark:border-gray-700 dark:bg-gray-800">
                      <Paperclip className="h-3 w-3 text-gray-400" />
                      {a.fileName}
                    </div>
                  ))}
                </div>
              )}

              {/* Ticket created badge */}
              {ticketCreated && (
                <div className="flex items-center gap-1.5 rounded border border-green-200 bg-green-50 px-2 py-1 text-[10px] text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                  Ticket creado: {ticketCreated.ticketNumber} — {ticketCreated.title}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
