'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Send,
  ArrowLeft,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function PortalChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm the NovaDesk AI Assistant. I can help you with common IT issues, answer questions about our services, or help you create a support ticket. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error('AI service unavailable');

      const text = await res.text();
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: text || "I'm sorry, I couldn't process your request. Please try again or create a support ticket.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            "I'm having trouble connecting right now. You can still create a support ticket and our team will help you directly.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const suggestions = [
    'My VPN is not working',
    'How do I reset my password?',
    'I need new software installed',
    'My computer is running slow',
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link href="/portal">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Portal
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
              <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-sm font-medium">AI Support Assistant</h1>
              <p className="text-xs text-muted-foreground">
                Powered by NovaDesk AI
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="mx-auto h-full max-w-3xl space-y-4 overflow-y-auto p-6"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === 'user' && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    U
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {/* Suggestions (only show when few messages) */}
          {messages.length <= 2 && (
            <div className="space-y-2 pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                <Sparkles className="mb-0.5 mr-1 inline h-3 w-3" />
                Suggested questions:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Escalation banner after 4+ messages */}
          {messages.length >= 5 && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                    Need more help?
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                    If the AI assistant can&apos;t resolve your issue, you can
                    create a support ticket for human assistance.
                  </p>
                  <Link href="/portal/tickets/new">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 border-amber-300 text-amber-700 hover:bg-amber-100"
                    >
                      Create Support Ticket
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white/80 p-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-center gap-3"
        >
          <input
            type="text"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:placeholder:text-gray-500"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isLoading || !input.trim()}
            className="h-11 w-11 rounded-xl p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
