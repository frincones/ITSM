'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ReactRenderer, useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import tippy, { Instance } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  AtSign,
  Eye,
  MessageSquare,
  Send,
  Paperclip,
  X,
  FileIcon,
  Loader2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@kit/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { addFollowup } from '~/lib/actions/tickets';
import { searchMentionables, type MentionableItem } from '~/lib/actions/mentions';

import { MentionList, type MentionListHandle, type MentionListData } from './mention-list';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ReplyComposerProps {
  ticketId: string;
  hideInternalNote?: boolean;
}

interface UploadedFile {
  path: string;
  url: string | null;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface MacroTemplate {
  id: string;
  name: string;
  content: string;
  category: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function ReplyComposer({ ticketId, hideInternalNote = false }: ReplyComposerProps) {
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [isPending, startTransition] = useTransition();
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showMacros, setShowMacros] = useState(false);
  const [macros, setMacros] = useState<MacroTemplate[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // `replyMode` drives whether the @-mention dropdown includes contacts.
  // Tiptap suggestion items() reads from this ref to stay in sync without
  // recreating the editor on every toggle.
  const includeContactsRef = useRef(replyMode === 'public');
  useEffect(() => {
    includeContactsRef.current = replyMode === 'public';
  }, [replyMode]);

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
            ? 'Nota interna (no visible para el requester). Usa @ para mencionar agentes.'
            : 'Escribe una respuesta al requester. Usa @ para mencionar agentes o contactos. Pega una imagen con Ctrl+V.';
        },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Mention.configure({
        HTMLAttributes: { class: 'tiptap-mention' },
        renderHTML({ options, node }) {
          // node.attrs.id looks like "agent:<uuid>" or "contact:<uuid>".
          // We store the raw id on data-mention-id so the server can parse
          // it back when building mentioned_agent_ids / mentioned_contact_ids.
          const [kind] = String(node.attrs.id ?? '').split(':');
          return [
            'span',
            {
              ...options.HTMLAttributes,
              'data-mention-id': node.attrs.id,
              'data-mention-kind': kind,
            },
            `@${node.attrs.label ?? node.attrs.id}`,
          ];
        },
        suggestion: {
          char: '@',
          // We override items() to return a single opaque value: the full
          // grouped payload. The renderer reads it via props.items[0].
          // This keeps Tiptap's keyboard navigation intact but lets us
          // render 3 sections (agents / org contacts / other contacts)
          // without flattening the data.
          items: async ({ query }) => {
            const { data } = await searchMentionables({
              ticketId,
              query,
              includeContacts: includeContactsRef.current,
            });
            const payload: MentionListData = {
              query,
              agents: data?.agents ?? [],
              contacts: data?.contacts ?? [],
              otherContacts: data?.otherContacts ?? [],
              orgName: data?.orgName ?? null,
            };
            return [payload as unknown as MentionableItem]; // single grouped entry
          },
          render: () => {
            let component: ReactRenderer<MentionListHandle, { data: MentionListData; command: (i: { id: string; label: string; kind: string }) => void }> | null = null;
            let popup: Instance[] | null = null;

            const extract = (items: unknown[]): MentionListData => {
              const first = items[0] as MentionListData | undefined;
              return first ?? { query: '', agents: [], contacts: [], otherContacts: [], orgName: null };
            };

            return {
              onStart: (props) => {
                component = new ReactRenderer(MentionList, {
                  props: { data: extract(props.items), command: props.command },
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  theme: 'light-border',
                  maxWidth: 400,
                });
              },
              onUpdate: (props) => {
                component?.updateProps({ data: extract(props.items), command: props.command });
                if (props.clientRect && popup?.[0]) {
                  popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
                }
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props.event) ?? false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-[110px] px-3 py-2 focus:outline-none',
        'data-mode': replyMode,
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            uploadPastedImage(file).catch((err) => {
              console.error(err);
              toast.error('No se pudo subir la imagen pegada');
            });
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        for (const f of Array.from(files)) {
          if (f.type.startsWith('image/')) {
            event.preventDefault();
            uploadPastedImage(f).catch(() => toast.error('No se pudo subir la imagen'));
            return true;
          }
        }
        return false;
      },
    },
    content: '',
  });

  // Keep data-mode attribute in sync so placeholder reads current tab.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute('data-mode', replyMode);
    editor.view.dispatch(editor.view.state.tr); // re-run placeholder decoration
  }, [replyMode, editor]);

  const uploadPastedImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Imagen demasiado grande (máx 10MB)');
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ticketId', ticketId);
        const res = await fetch('/api/tickets/upload-inline', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? 'Upload failed');
        }
        const data = (await res.json()) as { url: string | null; path: string };
        if (data.url) {
          editor.chain().focus().setImage({ src: data.url, alt: file.name }).run();
        }
      } finally {
        setUploading(false);
      }
    },
    [editor, ticketId],
  );

  // Fetch macros on first open
  useEffect(() => {
    if (showMacros && macros.length === 0) {
      setMacros([
        { id: '1', name: 'Saludo inicial', content: 'Hola, gracias por contactarnos. Estamos revisando tu solicitud y te contactaremos pronto.', category: 'General' },
        { id: '2', name: 'Solicitar más información', content: 'Para poder ayudarte mejor, necesitamos más información:\n\n1. ¿Cuándo comenzó el problema?\n2. ¿Qué pasos realizaste antes del error?\n3. ¿Puedes compartir una captura de pantalla?', category: 'Soporte' },
        { id: '3', name: 'En investigación', content: 'Estamos investigando tu caso. Nuestro equipo técnico está trabajando en una solución. Te mantendremos informado de cualquier avance.', category: 'Soporte' },
        { id: '4', name: 'Solución aplicada', content: 'Hemos aplicado una solución a tu problema. Por favor verifica si el issue fue resuelto. Si el problema persiste, no dudes en informarnos.', category: 'Resolución' },
        { id: '5', name: 'Cierre de ticket', content: 'Debido a que no hemos recibido respuesta, procederemos a cerrar este ticket. Si necesitas ayuda adicional, puedes reabrir el ticket o crear uno nuevo.', category: 'Cierre' },
      ]);
    }
  }, [showMacros, macros.length]);

  // Ordinary (non-image) file upload — kept as attachments.
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Archivo demasiado grande (máx 10MB)');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orgId', ticketId);
      const res = await fetch('/api/portal/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setPendingFiles(prev => [...prev, data]);
        toast.success(`Archivo "${file.name}" adjuntado`);
      } else {
        toast.error('Error al subir archivo');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removePendingFile(idx: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function insertMacro(content: string) {
    if (!editor) return;
    editor.chain().focus().insertContent(content.replace(/\n/g, '<br>')).run();
    setShowMacros(false);
    toast.success('Macro insertada');
  }

  function extractMentions(html: string): { agents: string[]; contacts: string[] } {
    // Three mention kinds map to two DB columns:
    //   staff + client_user → mentioned_agent_ids (both live in agents)
    //   contact             → mentioned_contact_ids
    // The notify service later filters agents by role='readonly' to decide
    // who gets CC'd vs who is a silent staff follower.
    if (typeof window === 'undefined') return { agents: [], contacts: [] };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const agents = new Set<string>();
    const contacts = new Set<string>();
    doc.querySelectorAll('[data-mention-id]').forEach((el) => {
      const raw = el.getAttribute('data-mention-id') ?? '';
      const [kind, id] = raw.split(':');
      if (!id) return;
      if (kind === 'staff' || kind === 'client_user') agents.add(id);
      else if (kind === 'contact') contacts.add(id);
    });
    return { agents: Array.from(agents), contacts: Array.from(contacts) };
  }

  function handleSubmit() {
    if (!editor) return;
    const html = editor.getHTML();
    const text = editor.getText().trim();
    if (!text && pendingFiles.length === 0) return;

    const { agents, contacts } = extractMentions(html);

    // Internal note policy: no contact mentions reach the wire. We silently
    // drop them here (the picker should have hidden them already) so even a
    // manual paste of raw HTML cannot leak an internal note to a client.
    const mentionedContactIds = replyMode === 'internal' ? [] : contacts;

    const attachmentsHtml = pendingFiles.length
      ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">📎 Adjuntos: ${pendingFiles.map(f => `<a href="${f.url ?? '#'}">${f.fileName}</a>`).join(', ')}</div>`
      : '';
    const finalHtml = html + attachmentsHtml;
    const finalText = text + (pendingFiles.length ? `\n\n📎 Archivos adjuntos: ${pendingFiles.map(f => f.fileName).join(', ')}` : '');

    startTransition(async () => {
      const result = await addFollowup(ticketId, {
        content: finalText,
        content_html: finalHtml,
        is_private: replyMode === 'internal',
        mentioned_agent_ids: agents,
        mentioned_contact_ids: mentionedContactIds,
      });

      if (!result.error) {
        editor.commands.clearContent();
        setPendingFiles([]);
        toast.success(
          replyMode === 'public' ? 'Respuesta enviada' : 'Nota interna agregada',
        );
      } else {
        toast.error(`Error: ${result.error}`);
      }
    });
  }

  const isEmpty = useMemo(() => {
    if (!editor) return true;
    return editor.isEmpty && pendingFiles.length === 0;
  }, [editor, editor?.state, pendingFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="border-t border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
      <style jsx global>{`
        .tiptap-mention {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgb(219 234 254);
          color: rgb(30 64 175);
          font-weight: 500;
          font-size: 0.9em;
        }
        .dark .tiptap-mention {
          background: rgba(59, 130, 246, 0.2);
          color: rgb(147 197 253);
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin: 8px 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>

      <div className="mx-auto max-w-4xl">
        <Tabs value={replyMode} onValueChange={(v) => setReplyMode(v as 'public' | 'internal')}>
          <TabsList className="mb-4">
            <TabsTrigger value="public" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Public Reply
            </TabsTrigger>
            {!hideInternalNote && (
              <TabsTrigger value="internal" className="gap-2">
                <Eye className="h-4 w-4" /> Internal Note
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        <div
          className={`mb-3 overflow-hidden rounded-md border ${
            replyMode === 'internal'
              ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5'
              : 'border-border bg-background'
          }`}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
            <ToolbarButton
              active={editor?.isActive('bold')}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              label="Bold"
            >
              <BoldIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive('italic')}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              label="Italic"
            >
              <ItalicIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
            <Divider />
            <ToolbarButton
              active={editor?.isActive('bulletList')}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              label="List"
            >
              <ListIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive('orderedList')}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              label="Ordered list"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolbarButton>
            <Divider />
            <ToolbarButton
              onClick={() => {
                const url = window.prompt('URL del enlace');
                if (url) editor?.chain().focus().setLink({ href: url }).run();
              }}
              label="Link"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().insertContent('@').run()}
              label="Mención"
            >
              <AtSign className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = () => {
                  const f = input.files?.[0];
                  if (f) uploadPastedImage(f);
                };
                input.click();
              }}
              label="Imagen"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
            {uploading && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <EditorContent editor={editor} />
        </div>

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-lg border bg-gray-50 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
              >
                <FileIcon className="h-3 w-3 text-gray-400" />
                <span className="max-w-[150px] truncate">{f.fileName}</span>
                <span className="text-gray-400">({(f.fileSize / 1024).toFixed(0)} KB)</span>
                <button onClick={() => removePendingFile(i)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {uploading ? 'Subiendo...' : 'Attach Files'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowMacros(!showMacros)}
              >
                <Zap className="h-3.5 w-3.5" /> Macros
              </Button>
              {showMacros && (
                <div className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border bg-card p-2 shadow-xl">
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase text-muted-foreground">
                    Respuestas rápidas
                  </p>
                  <div className="max-h-[200px] space-y-1 overflow-y-auto">
                    {macros.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => insertMacro(m.content)}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        <span className="font-medium">{m.name}</span>
                        {m.category && (
                          <span className="ml-1 text-muted-foreground">— {m.category}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              size="sm"
              className="gap-2"
              onClick={handleSubmit}
              disabled={isPending || isEmpty}
            >
              <Send className="h-4 w-4" />
              {isPending ? 'Sending...' : replyMode === 'public' ? 'Send Reply' : 'Add Note'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toolbar helpers                                                            */
/* -------------------------------------------------------------------------- */

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
      className={`rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground ${
        active ? 'bg-muted text-foreground' : ''
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}
