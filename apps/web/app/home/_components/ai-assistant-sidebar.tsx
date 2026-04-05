'use client';

import { useRef, useEffect } from 'react';

import { useChat } from '@ai-sdk/react';
import { Bot, X, Send, Sparkles, RotateCcw, Loader2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';

/* -------------------------------------------------------------------------- */
/*  AI Assistant Sidebar                                                       */
/* -------------------------------------------------------------------------- */

interface AIAssistantSidebarProps {
  open: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  'Resumen del día',
  'Tickets pendientes',
  'Carga por agente',
  'Tickets críticos abiertos',
];

export function AIAssistantSidebar({ open, onClose }: AIAssistantSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, setMessages } = useChat({
    api: '/api/ai/assistant',
    initialMessages: [],
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSuggestion = (text: string) => {
    setInput(text);
    // Submit after setting input
    setTimeout(() => {
      const form = document.getElementById('ai-assistant-form') as HTMLFormElement;
      form?.requestSubmit();
    }, 50);
  };

  const handleReset = () => {
    setMessages([]);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] lg:hidden"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">NovaDesk AI</h2>
              <p className="text-[10px] text-muted-foreground">Asistente ITSM</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset} title="Nueva conversación">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="space-y-4 p-4">
            {messages.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center pt-8">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-600/10">
                  <Bot className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="mb-1 text-sm font-semibold">Hola! Soy tu asistente AI</h3>
                <p className="mb-6 max-w-[280px] text-center text-xs text-muted-foreground">
                  Puedo gestionar tickets, consultar métricas, asignar tareas, y mucho más. Solo pregunta.
                </p>
                <div className="flex w-full flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:bg-indigo-950 dark:hover:text-indigo-400"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Chat messages */
              messages.map((msg) => (
                <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : 'flex gap-2.5'}>
                  {msg.role === 'assistant' && (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600">
                      <Sparkles className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-muted/70 text-foreground'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex gap-2.5">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600">
                  <Sparkles className="h-3 w-3 text-white" />
                </div>
                <div className="rounded-xl bg-muted/70 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-3">
          <form id="ai-assistant-form" onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2 transition-colors focus-within:border-indigo-300 focus-within:bg-background">
              <textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
                placeholder="Escribe un comando..."
                rows={1}
                className="max-h-[100px] w-full resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700"
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-1.5 text-center text-[9px] text-muted-foreground">
            AI puede ejecutar acciones reales. Verifica antes de confirmar.
          </p>
        </div>
      </div>
    </>
  );
}
