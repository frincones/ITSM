'use client';

import { useEffect, useState, useTransition } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered,
  Eye,
  MessageSquare,
  Send,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@kit/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { addFollowup } from '~/lib/actions/tickets';

interface TicketPreviewComposerProps {
  ticketId: string;
  hideInternalNote?: boolean;
  onSent?: () => void;
}

/**
 * Minimal composer for the workspace preview side panel.
 *
 * Reuses the same `addFollowup` server action as the full ticket detail
 * page — same validation, notification fan-out, follower auto-add. The
 * only intentional differences vs. <ReplyComposer/>:
 *   - no @-mention dropdown (use full detail for that)
 *   - no file upload (use full detail for that)
 *   - editor starts in a 3-line collapsed state to keep the panel scannable
 */
export function TicketPreviewComposer({
  ticketId,
  hideInternalNote = false,
  onSent,
}: TicketPreviewComposerProps) {
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [isPending, startTransition] = useTransition();
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: ({ editor }) => {
          const mode = editor.view.dom.getAttribute('data-mode');
          return mode === 'internal'
            ? 'Nota interna (solo agentes verán esto)…'
            : 'Escribe una respuesta al solicitante…';
        },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-sm focus:outline-none',
        'data-mode': replyMode,
      },
    },
    content: '',
    onFocus: () => setFocused(true),
  });

  // Mirror placeholder mode when tab changes.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute('data-mode', replyMode);
    editor.view.dispatch(editor.view.state.tr);
  }, [replyMode, editor]);

  // Track empty state so the Send button enables on first keystroke (Tiptap
  // doesn't change the editor identity on updates, so a useMemo wouldn't
  // pick this up).
  const [isEmpty, setIsEmpty] = useState(true);
  useEffect(() => {
    if (!editor) return;
    const sync = () => setIsEmpty(editor.isEmpty);
    sync();
    editor.on('update', sync);
    editor.on('transaction', sync);
    return () => {
      editor.off('update', sync);
      editor.off('transaction', sync);
    };
  }, [editor]);

  function handleSubmit() {
    if (!editor || isEmpty) return;
    const html = editor.getHTML();
    const text = editor.getText().trim();
    if (!text) return;

    startTransition(async () => {
      const result = await addFollowup(ticketId, {
        content: text,
        content_html: html,
        is_private: replyMode === 'internal',
        mentioned_agent_ids: [],
        mentioned_contact_ids: [],
      });

      if (result.error) {
        toast.error(`Error: ${result.error}`);
        return;
      }

      editor.commands.clearContent();
      setFocused(false);
      toast.success(
        replyMode === 'public' ? 'Respuesta enviada' : 'Nota interna agregada',
      );
      onSent?.();
    });
  }

  // Keyboard: Cmd/Ctrl+Enter sends.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    dom.addEventListener('keydown', handler);
    return () => dom.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, replyMode, isEmpty]);

  const expanded = focused || !isEmpty;

  return (
    <div className="space-y-2">
      <style jsx global>{`
        .preview-composer .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>

      <Tabs
        value={replyMode}
        onValueChange={(v) => setReplyMode(v as 'public' | 'internal')}
      >
        <TabsList className="h-8">
          <TabsTrigger value="public" className="h-7 gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            Pública
          </TabsTrigger>
          {!hideInternalNote && (
            <TabsTrigger value="internal" className="h-7 gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" />
              Interna
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <div
        className={`preview-composer overflow-hidden rounded-md border ${
          replyMode === 'internal'
            ? 'border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5'
            : 'border-border bg-background'
        }`}
      >
        {expanded && (
          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
            <ToolbarButton
              active={editor?.isActive('bold')}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              label="Bold"
            >
              <BoldIcon className="h-3 w-3" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive('italic')}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              label="Italic"
            >
              <ItalicIcon className="h-3 w-3" />
            </ToolbarButton>
            <Divider />
            <ToolbarButton
              active={editor?.isActive('bulletList')}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              label="List"
            >
              <ListIcon className="h-3 w-3" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive('orderedList')}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              label="Ordered list"
            >
              <ListOrdered className="h-3 w-3" />
            </ToolbarButton>
          </div>
        )}

        <div
          className={expanded ? 'min-h-[110px]' : 'min-h-[44px]'}
          onClick={() => {
            if (!focused) editor?.chain().focus().run();
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {expanded ? 'Ctrl+Enter para enviar' : ''}
        </span>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleSubmit}
          disabled={isPending || isEmpty}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          {isPending
            ? 'Enviando…'
            : replyMode === 'public'
              ? 'Enviar respuesta'
              : 'Agregar nota'}
        </Button>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground ${
        active ? 'bg-muted text-foreground' : ''
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-3 w-px bg-border" />;
}
