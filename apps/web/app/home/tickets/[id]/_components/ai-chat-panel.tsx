'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Brain,
  Lightbulb,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';

import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Separator } from '@kit/ui/separator';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Classification {
  type: string;
  urgency: string;
  category: string;
  confidence: number;
  reasoning: string;
}

interface Suggestion {
  title: string;
  description: string;
  confidence: number;
  source: 'knowledge_base' | 'similar_ticket' | 'ai_generated';
  sourceId?: string;
}

interface TicketContext {
  ticketId: string;
  title: string;
  description?: string | null;
  status: string;
  type: string;
  urgency: string;
  category?: string | null;
}

interface AiChatPanelProps {
  ticket: TicketContext;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function confidenceColor(score: number): string {
  if (score >= 85) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function confidenceBg(score: number): string {
  if (score >= 85)
    return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400';
  if (score >= 60)
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400';
  return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
}

function sourceLabel(source: Suggestion['source']): string {
  const map: Record<string, string> = {
    knowledge_base: 'KB Article',
    similar_ticket: 'Similar Ticket',
    ai_generated: 'AI Generated',
  };
  return map[source] ?? source;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    incident: 'Incident',
    request: 'Request',
    warranty: 'Warranty',
    support: 'Support',
    backlog: 'Backlog',
  };
  return map[type] ?? type;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AiChatPanel({ ticket }: AiChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Classification ───────────────────────────────────────────────────────
  const [classification, setClassification] = useState<Classification | null>(
    null,
  );
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  // ── Suggestions ──────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(
    null,
  );

  // ── Copied state ─────────────────────────────────────────────────────────
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // ── Chat ─────────────────────────────────────────────────────────────────
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } =
    useChat({
      api: '/api/ai/chat',
      body: {
        ticketContext: {
          ticketId: ticket.ticketId,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          type: ticket.type,
          urgency: ticket.urgency,
          category: ticket.category,
        },
      },
    });

  // ── Auto-scroll chat ────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Fetch classification on mount ────────────────────────────────────────
  useEffect(() => {
    async function classify() {
      setClassifyLoading(true);
      setClassifyError(null);
      try {
        const res = await fetch('/api/ai/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: ticket.title,
            description: ticket.description ?? '',
          }),
        });

        if (!res.ok) throw new Error('Classification failed');

        const data = await res.json();
        setClassification(data.classification);
      } catch (err) {
        setClassifyError(
          err instanceof Error ? err.message : 'Classification failed',
        );
      } finally {
        setClassifyLoading(false);
      }
    }

    void classify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.ticketId]);

  // ── Fetch suggestions on mount ───────────────────────────────────────────
  useEffect(() => {
    async function suggest() {
      setSuggestLoading(true);
      setSuggestError(null);
      try {
        const res = await fetch('/api/ai/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: ticket.ticketId }),
        });

        if (!res.ok) throw new Error('Suggestions failed');

        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch (err) {
        setSuggestError(
          err instanceof Error ? err.message : 'Suggestions failed',
        );
      } finally {
        setSuggestLoading(false);
      }
    }

    void suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.ticketId]);

  // ── Copy suggestion to clipboard ─────────────────────────────────────────
  function handleCopy(text: string, idx: number) {
    void navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  // ── Quick-ask buttons ────────────────────────────────────────────────────
  function askQuick(question: string) {
    setInput(question);
    // Submit on next tick after state update
    setTimeout(() => {
      inputRef.current?.form?.requestSubmit();
    }, 0);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            NovaDesk AI
          </h3>
        </div>
        <Badge className="border-indigo-200 bg-indigo-50 text-xs text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-400">
          <Sparkles className="mr-1 h-3 w-3" />
          GPT-4o Mini
        </Badge>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="space-y-4 p-4">
          {/* ────────────────────────────────────────────────────────────── */}
          {/*  Auto Classification                                         */}
          {/* ────────────────────────────────────────────────────────────── */}
          <Card className="border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-500/5">
            <CardContent className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-medium text-indigo-900 dark:text-indigo-300">
                    Auto Classification
                  </span>
                </div>
                {classification && (
                  <Badge className={`text-xs ${confidenceBg(classification.confidence)}`}>
                    {classification.confidence}%
                  </Badge>
                )}
              </div>

              {classifyLoading && (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  <span className="text-xs text-indigo-700 dark:text-indigo-400">
                    Analyzing ticket...
                  </span>
                </div>
              )}

              {classifyError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {classifyError}
                </p>
              )}

              {classification && !classifyLoading && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-blue-100 text-xs text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                      {typeLabel(classification.type)}
                    </Badge>
                    <Badge className="bg-orange-100 text-xs text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
                      {classification.urgency}
                    </Badge>
                    <Badge className="bg-purple-100 text-xs text-purple-700 dark:bg-purple-500/20 dark:text-purple-400">
                      {classification.category}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-indigo-800 dark:text-indigo-300">
                    {classification.reasoning}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ────────────────────────────────────────────────────────────── */}
          {/*  Suggested Solutions                                          */}
          {/* ────────────────────────────────────────────────────────────── */}
          <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <CardContent className="p-3">
              <div className="mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-900 dark:text-emerald-300">
                  Suggested Solutions
                </span>
                {suggestLoading && (
                  <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                )}
              </div>

              {suggestLoading && suggestions.length === 0 && (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">
                    Searching knowledge base and analyzing...
                  </span>
                </div>
              )}

              {suggestError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {suggestError}
                </p>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-2">
                  {suggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-emerald-200 bg-white p-2.5 dark:border-emerald-500/20 dark:bg-gray-900/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSuggestion(
                                expandedSuggestion === idx ? null : idx,
                              )
                            }
                            className="flex w-full items-center gap-1 text-left"
                          >
                            {expandedSuggestion === idx ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0 text-gray-400" />
                            )}
                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                              {suggestion.title}
                            </span>
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            className={`text-[10px] ${confidenceBg(suggestion.confidence)}`}
                          >
                            {suggestion.confidence}%
                          </Badge>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(suggestion.description, idx)
                            }
                            className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="Copy solution"
                          >
                            {copiedIdx === idx ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge className="border-gray-200 bg-gray-100 text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                          {sourceLabel(suggestion.source)}
                        </Badge>
                        {suggestion.sourceId && (
                          <button
                            type="button"
                            className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                            title="View source"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {expandedSuggestion === idx && (
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                          {suggestion.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!suggestLoading && suggestions.length === 0 && !suggestError && (
                <p className="py-1 text-xs text-emerald-700 dark:text-emerald-400">
                  No suggestions available yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ────────────────────────────────────────────────────────────── */}
          {/*  Similar Tickets (placeholder — fetched via AI)               */}
          {/* ────────────────────────────────────────────────────────────── */}
          <Card className="border-purple-200 bg-purple-50/50 dark:border-purple-500/30 dark:bg-purple-500/5">
            <CardContent className="p-3">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-purple-900 dark:text-purple-300">
                  Similar Tickets
                </span>
              </div>
              <p className="text-xs text-purple-700 dark:text-purple-400">
                Ask the AI assistant to find similar tickets by using the chat
                below.
              </p>
            </CardContent>
          </Card>

          <Separator />

          {/* ────────────────────────────────────────────────────────────── */}
          {/*  Chat Messages                                                */}
          {/* ────────────────────────────────────────────────────────────── */}
          {messages.length === 0 && (
            <div className="space-y-2 py-2">
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                Ask AI about this ticket
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {[
                  'Summarize this ticket',
                  'Suggest resolution steps',
                  'Find similar tickets',
                  'Draft a reply',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => askQuick(q)}
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] text-white">
                    AI
                  </AvatarFallback>
                </Avatar>
              )}

              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] text-white">
                  AI
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                <span className="text-xs text-gray-500">Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Chat Input ──────────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 p-3 dark:border-gray-800">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about this ticket..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:placeholder:text-gray-500"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isLoading || !(input ?? '').trim()}
            className="h-9 w-9 p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
