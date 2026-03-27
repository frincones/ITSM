'use client';

import { useRef, useEffect, useState } from 'react';

import Link from 'next/link';
import { useChat } from '@ai-sdk/react';

import {
  Bot,
  Send,
  TicketIcon,
  User,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Input } from '@kit/ui/input';

/* -------------------------------------------------------------------------- */
/*  Markdown-lite renderer (for streaming AI responses)                        */
/* -------------------------------------------------------------------------- */

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown: bold, inline code, code blocks, line breaks
  const html = content
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 rounded-lg p-3 my-2 text-sm overflow-x-auto"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');

  return (
    <div
      className="prose prose-sm max-w-none text-gray-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Chat Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function PortalChatPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showEscalate, setShowEscalate] = useState(false);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: '/api/ai/chat',
    onFinish: () => {
      // After a few exchanges, show escalation option
      if (messages.length >= 4) {
        setShowEscalate(true);
      }
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-3xl flex-col px-6 py-8">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
          <Bot className="h-7 w-7 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">
          AI Support Assistant
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Ask me anything about our services, or let me help troubleshoot your
          issue.
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-4 h-12 w-12 text-gray-300" />
            <p className="text-sm text-gray-500">
              Hi there! How can I help you today?
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[
                'How do I reset my password?',
                'VPN setup guide',
                'Request new equipment',
              ].map((suggestion) => (
                <Badge
                  key={suggestion}
                  className="cursor-pointer border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    const fakeEvent = {
                      target: { value: suggestion },
                    } as React.ChangeEvent<HTMLInputElement>;
                    handleInputChange(fakeEvent);
                  }}
                >
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                <Bot className="h-4 w-4 text-indigo-600" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-200 bg-gray-50'
              }`}
            >
              {message.role === 'user' ? (
                <p className="text-sm">{message.content}</p>
              ) : (
                <MarkdownContent content={message.content} />
              )}
            </div>

            {message.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200">
                <User className="h-4 w-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100">
              <Bot className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-2 p-3">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-sm text-red-700">
                Something went wrong. Please try again.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Escalation Banner */}
      {showEscalate && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Not finding what you need? Create a support ticket for human
            assistance.
          </p>
          <Link href="/portal/tickets/new">
            <Button size="sm" variant="outline" className="gap-2">
              <TicketIcon className="h-4 w-4" />
              Create Ticket
            </Button>
          </Link>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="mt-4 flex items-center gap-3"
      >
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Type your message..."
          className="h-12 flex-1"
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="icon"
          className="h-12 w-12"
          disabled={isLoading || !input.trim()}
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}
