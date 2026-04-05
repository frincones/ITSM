'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Bot, ExternalLink, Paperclip, Send } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';

import type { PortalArticle } from './popular-articles';
import { PopularArticles } from './popular-articles';
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
}

interface CitedArticle {
  id: string;
  title: string;
  slug: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const accentColor = orgColors?.primary ?? '#4f46e5';
  const hasMessages = messages.length > 0;

  /* ------ Auto-scroll to bottom ------ */
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

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  /* ------ Set input from quick categories ------ */
  const handleSetInput = useCallback((text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  }, []);

  /* ------ Article click handler ------ */
  const handleArticleClick = useCallback(
    (article: PortalArticle) => {
      setInput(`Quiero saber mas sobre: ${article.title}`);
      textareaRef.current?.focus();
    },
    [],
  );

  /* ------ Send message ------ */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          portalContext: { orgId, orgName },
        }),
      });

      let aiContent = 'Lo siento, hubo un error procesando tu solicitud. Por favor intenta de nuevo.';
      let articles: CitedArticle[] | undefined;
      let ticketCreated: ChatMessage['ticketCreated'] | undefined;

      if (res.ok) {
        try {
          const data = await res.json();
          aiContent = data.text ?? data.content ?? aiContent;
          articles = data.articles;
          ticketCreated = data.ticketCreated;
        } catch {
          // If response is plain text
          aiContent = await res.text().catch(() => aiContent);
        }
      }

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiContent,
        articles,
        ticketCreated,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            'No se pudo conectar con el asistente. Verifica tu conexion e intenta de nuevo.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, orgId, orgName]);

  /* ------ Keyboard handler ------ */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  /* ------ Feedback: resolved / not resolved ------ */
  const handleResolved = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'Me alegra haber podido ayudarte. Si necesitas algo mas, no dudes en preguntar.',
      },
    ]);
  }, []);

  const handleNotResolved = useCallback(() => {
    setInput(
      'No se resolvio mi problema. Me gustaria crear un ticket de soporte.',
    );
    textareaRef.current?.focus();
  }, []);

  /* ====================================================================== */
  /*  Render                                                                 */
  /* ====================================================================== */

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="mx-auto max-w-3xl px-4 py-6">
            {!hasMessages ? (
              /* ---- STATE 1: Landing / No messages ---- */
              <div className="flex flex-col items-center pt-12">
                {/* AI Avatar */}
                <div
                  className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30"
                  style={
                    accentColor !== '#4f46e5'
                      ? {
                          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
                        }
                      : undefined
                  }
                >
                  <Bot className="h-8 w-8 text-white" />
                </div>

                {/* Greeting */}
                <h1 className="mb-2 text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Hola{userName ? `, ${userName}` : ''}!
                </h1>
                <p className="mb-8 max-w-md text-center text-sm text-gray-500 dark:text-gray-400">
                  Soy el asistente de soporte de{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {orgName}
                  </span>
                  . En que puedo ayudarte?
                </p>

                {/* Quick categories */}
                <div className="mb-8 w-full max-w-sm">
                  <QuickCategories onSetInput={handleSetInput} />
                </div>

                {/* Popular articles */}
                <div className="w-full max-w-md">
                  <PopularArticles
                    articles={kbArticles}
                    onArticleClick={handleArticleClick}
                  />
                </div>
              </div>
            ) : (
              /* ---- STATE 2: Chat messages ---- */
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div key={msg.id}>
                    {msg.role === 'user' ? (
                      /* User message */
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 text-sm text-white shadow-sm">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      /* AI message */
                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                        <div className="max-w-[80%] space-y-3">
                          <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-200">
                            {msg.content}
                          </div>

                          {/* Cited articles */}
                          {msg.articles && msg.articles.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium text-gray-400">
                                Articulos relacionados:
                              </span>
                              {msg.articles.map((art) => (
                                <a
                                  key={art.id}
                                  href={`/portal/kb/${art.slug}`}
                                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                  <ExternalLink className="h-3 w-3 flex-shrink-0 text-gray-400" />
                                  <span className="truncate">{art.title}</span>
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Ticket created card */}
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

                          {/* Action buttons after AI response */}
                          {msg.role === 'assistant' &&
                            idx === messages.length - 1 &&
                            !isLoading &&
                            !msg.ticketCreated && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 rounded-full text-xs"
                                  onClick={handleResolved}
                                >
                                  Resolvio
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 rounded-full text-xs"
                                  onClick={handleNotResolved}
                                >
                                  No resolvio, crear ticket
                                </Button>
                              </div>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: '0ms' }}
                        />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: '300ms' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ---- Chat input (always at bottom) ---- */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 transition-colors focus-within:border-indigo-300 focus-within:bg-white dark:border-gray-700 dark:bg-gray-900 dark:focus-within:border-indigo-600 dark:focus-within:bg-gray-900">
            {/* Attach button */}
            <button
              type="button"
              className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              title="Adjuntar archivo"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta o describe tu problema..."
              rows={1}
              className="max-h-[160px] min-h-[36px] flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
            />

            {/* Send button */}
            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-all hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600"
              style={
                accentColor !== '#4f46e5'
                  ? { backgroundColor: accentColor }
                  : undefined
              }
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-1.5 text-center text-[10px] text-gray-400 dark:text-gray-500">
            El asistente puede cometer errores. Verifica la informacion
            importante.
          </p>
        </div>
      </div>
    </div>
  );
}
