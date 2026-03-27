'use client';

import { useState, useTransition } from 'react';
import { MessageSquare, Eye, Paperclip, Send } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Textarea } from '@kit/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { addFollowup } from '~/lib/actions/tickets';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ReplyComposerProps {
  ticketId: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function ReplyComposer({ ticketId }: ReplyComposerProps) {
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [replyText, setReplyText] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!replyText.trim()) return;

    startTransition(async () => {
      const result = await addFollowup(ticketId, {
        content: replyText.trim(),
        is_private: replyMode === 'internal',
      });

      if (!result.error) {
        setReplyText('');
      }
    });
  }

  return (
    <div className="border-t border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl">
        <Tabs
          value={replyMode}
          onValueChange={(v) => setReplyMode(v as 'public' | 'internal')}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="public" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Public Reply
            </TabsTrigger>
            <TabsTrigger value="internal" className="gap-2">
              <Eye className="h-4 w-4" />
              Internal Note
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Textarea
          placeholder={
            replyMode === 'public'
              ? 'Write a response to the requester...'
              : 'Add an internal note (not visible to requester)...'
          }
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          className={`mb-3 min-h-[100px] ${
            replyMode === 'internal'
              ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5'
              : ''
          }`}
        />

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" className="gap-2">
            <Paperclip className="h-4 w-4" />
            Attach Files
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Macros
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={handleSubmit}
              disabled={isPending || !replyText.trim()}
            >
              <Send className="h-4 w-4" />
              {isPending
                ? 'Sending...'
                : replyMode === 'public'
                  ? 'Send Reply'
                  : 'Add Note'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
