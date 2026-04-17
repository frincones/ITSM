'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { MessageSquare, Eye, Paperclip, Send, X, FileIcon, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@kit/ui/button';
import { Textarea } from '@kit/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { addFollowup } from '~/lib/actions/tickets';

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
  const [replyText, setReplyText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showMacros, setShowMacros] = useState(false);
  const [macros, setMacros] = useState<MacroTemplate[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch macros on first open
  useEffect(() => {
    if (showMacros && macros.length === 0) {
      fetch('/api/portal/activity', { method: 'GET' }).catch(() => {}); // placeholder
      // Load from response_templates table (fallback to defaults)
      setMacros([
        { id: '1', name: 'Saludo inicial', content: 'Hola, gracias por contactarnos. Estamos revisando tu solicitud y te contactaremos pronto.', category: 'General' },
        { id: '2', name: 'Solicitar más información', content: 'Para poder ayudarte mejor, necesitamos más información:\n\n1. ¿Cuándo comenzó el problema?\n2. ¿Qué pasos realizaste antes del error?\n3. ¿Puedes compartir una captura de pantalla?', category: 'Soporte' },
        { id: '3', name: 'En investigación', content: 'Estamos investigando tu caso. Nuestro equipo técnico está trabajando en una solución. Te mantendremos informado de cualquier avance.', category: 'Soporte' },
        { id: '4', name: 'Solución aplicada', content: 'Hemos aplicado una solución a tu problema. Por favor verifica si el issue fue resuelto. Si el problema persiste, no dudes en informarnos.', category: 'Resolución' },
        { id: '5', name: 'Cierre de ticket', content: 'Debido a que no hemos recibido respuesta, procederemos a cerrar este ticket. Si necesitas ayuda adicional, puedes reabrir el ticket o crear uno nuevo.', category: 'Cierre' },
      ]);
    }
  }, [showMacros, macros.length]);

  // File upload
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
    } catch {
      toast.error('Error al subir archivo');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePendingFile(idx: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }

  // Submit reply
  function handleSubmit() {
    if (!replyText.trim()) return;

    startTransition(async () => {
      const content = pendingFiles.length > 0
        ? `${replyText.trim()}\n\n📎 Archivos adjuntos: ${pendingFiles.map(f => f.fileName).join(', ')}`
        : replyText.trim();

      const result = await addFollowup(ticketId, {
        content,
        is_private: replyMode === 'internal',
      });

      if (!result.error) {
        setReplyText('');
        setPendingFiles([]);
        toast.success(replyMode === 'public' ? 'Respuesta enviada' : 'Nota interna agregada');
      } else {
        toast.error(`Error: ${result.error}`);
      }
    });
  }

  // Insert macro
  function insertMacro(content: string) {
    setReplyText(prev => prev ? `${prev}\n\n${content}` : content);
    setShowMacros(false);
    toast.success('Macro insertada');
  }

  return (
    <div className="border-t border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl">
        <Tabs value={replyMode} onValueChange={(v) => setReplyMode(v as 'public' | 'internal')}>
          <TabsList className="mb-4">
            <TabsTrigger value="public" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Public Reply
            </TabsTrigger>
            {!hideInternalNote && (<TabsTrigger value="internal" className="gap-2">
              <Eye className="h-4 w-4" /> Internal Note
            </TabsTrigger>)}
          </TabsList>
        </Tabs>

        <Textarea
          placeholder={replyMode === 'public' ? 'Write a response to the requester...' : 'Add an internal note (not visible to requester)...'}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          className={`mb-3 min-h-[100px] ${replyMode === 'internal' ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5' : ''}`}
        />

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border bg-gray-50 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800">
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
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              onChange={handleFileSelect} />
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {uploading ? 'Subiendo...' : 'Attach Files'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* Macros dropdown */}
            <div className="relative">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowMacros(!showMacros)}>
                <Zap className="h-3.5 w-3.5" /> Macros
              </Button>
              {showMacros && (
                <div className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border bg-card p-2 shadow-xl">
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase text-muted-foreground">Respuestas rápidas</p>
                  <div className="max-h-[200px] space-y-1 overflow-y-auto">
                    {macros.map(m => (
                      <button key={m.id} onClick={() => insertMacro(m.content)}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
                        <span className="font-medium">{m.name}</span>
                        {m.category && <span className="ml-1 text-muted-foreground">— {m.category}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button size="sm" className="gap-2" onClick={handleSubmit}
              disabled={isPending || !replyText.trim()}>
              <Send className="h-4 w-4" />
              {isPending ? 'Sending...' : replyMode === 'public' ? 'Send Reply' : 'Add Note'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
