'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Bot, ExternalLink, File as FileIcon, Paperclip, Send, X } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';

import type { PortalArticle } from './popular-articles';
import { PopularArticles } from './popular-articles';
import { PortalEmailGate } from './portal-email-gate';
import { QuickCategories } from './quick-categories';
import { TicketCreatedCard } from './ticket-created-card';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  articles?: CitedArticle[];
  ticketCreated?: {
    ticketId: string;
    ticketNumber: string;
    title: string;
    type?: string;
    urgency?: string;
  };
  attachments?: UploadedFile[];
}

interface CitedArticle { id: string; title: string; slug: string }

interface UploadedFile {
  path: string;
  url: string | null;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface PortalChatProps {
  orgId: string;
  orgName: string;
  orgColors?: { primary?: string; accent?: string } | null;
  userName?: string | null;
  userEmail?: string | null;
  portalToken?: string;
  kbArticles: PortalArticle[];
  ticketCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function PortalChat({
  orgId,
  orgName,
  orgColors,
  userName,
  userEmail,
  portalToken,
  kbArticles,
  ticketCount,
}: PortalChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [portalUserEmail, setPortalUserEmail] = useState(userEmail ?? '');
  const [portalUserName, setPortalUserName] = useState(userName ?? '');
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [pendingTicketAction, setPendingTicketAction] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accentColor = orgColors?.primary ?? '#4f46e5';
  const hasMessages = messages.length > 0;

  /* ------ Auto-scroll ------ */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  /* ------ Auto-resize textarea ------ */
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => { adjustTextarea(); }, [input, adjustTextarea]);

  /* ------ Track activity ------ */
  const trackActivity = useCallback((eventType: string, eventData?: Record<string, unknown>) => {
    const sessionId = sessionStorage.getItem('portal_session') ?? crypto.randomUUID();
    sessionStorage.setItem('portal_session', sessionId);

    fetch('/api/portal/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{
          tenant_id: '', // resolved server-side
          organization_id: orgId,
          session_id: sessionId,
          user_email: portalUserEmail || undefined,
          user_name: portalUserName || undefined,
          event_type: eventType,
          event_data: eventData,
          page_url: window.location.href,
          conversation_id: conversationId,
        }],
      }),
    }).catch(() => {});
  }, [orgId, portalUserEmail, portalUserName, conversationId]);

  /* ------ Track page view on mount ------ */
  useEffect(() => {
    trackActivity('page_view', { path: window.location.pathname, title: document.title });
  }, [trackActivity]);

  /* ------ Set input from quick categories ------ */
  const handleSetInput = useCallback((text: string) => {
    setInput(text);
    trackActivity('category_select', { label: text });
    textareaRef.current?.focus();
  }, [trackActivity]);

  /* ------ Article click handler ------ */
  const handleArticleClick = useCallback((article: PortalArticle) => {
    setInput(`Quiero saber mas sobre: ${article.title}`);
    trackActivity('article_view', { article_id: article.id, title: article.title });
    textareaRef.current?.focus();
  }, [trackActivity]);

  /* ------ File upload ------ */
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orgId', orgId);
      if (conversationId) formData.append('conversationId', conversationId);

      const res = await fetch('/api/portal/upload', { method: 'POST', body: formData });

      if (res.ok) {
        const data = await res.json();
        setPendingFiles(prev => [...prev, data]);
        trackActivity('file_upload', { fileName: file.name, fileType: file.type });
      }
    } catch { /* upload failed silently */ }
    setUploading(false);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [orgId, conversationId, trackActivity]);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* ------ Send message ------ */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      attachments: pendingFiles.length > 0 ? [...pendingFiles] : undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setPendingFiles([]);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    trackActivity('chat_message', { message_preview: text.slice(0, 100), conversation_id: conversationId });

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          portalContext: {
            orgId, orgName,
            userEmail: portalUserEmail,
            userName: portalUserName,
            conversationId,
            attachments: userMsg.attachments?.map(a => ({
              path: a.path, fileName: a.fileName, fileType: a.fileType,
            })),
          },
        }),
      });

      let aiContent = 'Lo siento, hubo un error. Por favor intenta de nuevo.';
      let responseArticles: CitedArticle[] | undefined;
      let ticketCreated: ChatMessage['ticketCreated'] | undefined;

      if (res.ok) {
        try {
          const data = await res.json();
          aiContent = data.text ?? aiContent;
          responseArticles = data.articles;
          ticketCreated = data.ticketCreated;
          if (data.conversationId) setConversationId(data.conversationId);
        } catch {
          aiContent = await res.text().catch(() => aiContent);
        }
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiContent,
        articles: responseArticles,
        ticketCreated,
      }]);

      if (ticketCreated) {
        trackActivity('ticket_create', {
          ticket_id: ticketCreated.ticketId,
          ticket_number: ticketCreated.ticketNumber,
        });
      }
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'No se pudo conectar con el asistente. Intenta de nuevo.',
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, orgId, orgName, portalUserEmail, portalUserName, conversationId, pendingFiles, trackActivity]);

  /* ------ Keyboard handler ------ */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  /* ------ Feedback ------ */
  const handleResolved = useCallback(() => {
    trackActivity('feedback', { type: 'resolved' });
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Me alegra haber podido ayudarte. Si necesitas algo mas, no dudes en preguntar.',
    }]);
  }, [trackActivity]);

  const handleNotResolved = useCallback(() => {
    if (!portalUserEmail) {
      setPendingTicketAction(true);
      setShowEmailGate(true);
      return;
    }
    setInput('No se resolvio mi problema. Me gustaria crear un ticket de soporte.');
    textareaRef.current?.focus();
  }, [portalUserEmail]);

  const handleEmailIdentified = useCallback((email: string, name: string) => {
    setPortalUserEmail(email);
    setPortalUserName(name);
    setShowEmailGate(false);
    if (pendingTicketAction) {
      setPendingTicketAction(false);
      setInput('No se resolvio mi problema. Me gustaria crear un ticket de soporte.');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [pendingTicketAction]);

  /* ====================================================================== */
  /*  Render                                                                 */
  /* ====================================================================== */

  return (
    <div className="relative flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="mx-auto max-w-3xl px-4 py-6">
            {!hasMessages ? (
              /* Landing */
              <div className="flex flex-col items-center pt-12">
                <div
                  className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30"
                  style={accentColor !== '#4f46e5' ? { background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)` } : undefined}
                >
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h1 className="mb-2 text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Hola{portalUserName ? `, ${portalUserName}` : userName ? `, ${userName}` : ''}!
                </h1>
                <p className="mb-8 max-w-md text-center text-sm text-gray-500 dark:text-gray-400">
                  Soy el asistente de soporte de{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">{orgName}</span>.
                  En que puedo ayudarte?
                </p>
                <div className="mb-8 w-full max-w-sm">
                  <QuickCategories onSetInput={handleSetInput} />
                </div>
                <div className="w-full max-w-md">
                  <PopularArticles articles={kbArticles} onArticleClick={handleArticleClick} />
                </div>
              </div>
            ) : (
              /* Chat */
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div key={msg.id}>
                    {msg.role === 'user' ? (
                      <div className="flex justify-end">
                        <div className="max-w-[80%] space-y-2">
                          <div className="rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 text-sm text-white shadow-sm">
                            {msg.content}
                          </div>
                          {/* User attachments */}
                          {msg.attachments?.map((f, fi) => (
                            <div key={fi} className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              <FileIcon className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{f.fileName}</span>
                              <span className="text-gray-400">({(f.fileSize / 1024).toFixed(0)} KB)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                        <div className="max-w-[80%] space-y-3">
                          <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-200">
                            {msg.content}
                          </div>

                          {msg.articles && msg.articles.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium text-gray-400">Articulos relacionados:</span>
                              {msg.articles.map(art => (
                                <a key={art.id} href={portalToken ? `/portal/${portalToken}/kb/${art.slug}` : `/portal/kb/${art.slug}`}
                                   className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                                  <ExternalLink className="h-3 w-3 flex-shrink-0 text-gray-400" />
                                  <span className="truncate">{art.title}</span>
                                </a>
                              ))}
                            </div>
                          )}

                          {msg.ticketCreated && (
                            <TicketCreatedCard
                              ticketId={msg.ticketCreated.ticketId}
                              ticketNumber={msg.ticketCreated.ticketNumber}
                              title={msg.ticketCreated.title}
                              type={msg.ticketCreated.type}
                              urgency={msg.ticketCreated.urgency}
                              orgName={orgName}
                              portalToken={portalToken}
                            />
                          )}

                          {msg.role === 'assistant' && idx === messages.length - 1 && !isLoading && !msg.ticketCreated && (
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-7 gap-1 rounded-full text-xs" onClick={handleResolved}>
                                Resolvio
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 gap-1 rounded-full text-xs" onClick={handleNotResolved}>
                                No resolvio, crear ticket
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Email gate overlay */}
      {showEmailGate && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <PortalEmailGate orgName={orgName} onIdentified={handleEmailIdentified} />
        </div>
      )}

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800">
                <FileIcon className="h-3 w-3 text-gray-400" />
                <span className="max-w-[120px] truncate">{f.fileName}</span>
                <button onClick={() => removePendingFile(i)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat input */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 transition-colors focus-within:border-indigo-300 focus-within:bg-white dark:border-gray-700 dark:bg-gray-900 dark:focus-within:border-indigo-600">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-700"
              title="Adjuntar archivo"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta o describe tu problema..."
              rows={1}
              className="max-h-[160px] min-h-[36px] flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100"
            />

            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-all hover:bg-indigo-700 disabled:opacity-40"
              style={accentColor !== '#4f46e5' ? { backgroundColor: accentColor } : undefined}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400 dark:text-gray-500">
            El asistente puede cometer errores. Verifica la informacion importante.
          </p>
        </div>
      </div>
    </div>
  );
}
