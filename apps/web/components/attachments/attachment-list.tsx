'use client';

import { useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  FileImage,
  FileVideo,
  File as FileIcon,
  FileArchive,
  FileSpreadsheet,
  X,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@kit/ui/dialog';
import { cn } from '@kit/ui/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AttachmentRecord {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
}

interface AttachmentListProps {
  attachments: AttachmentRecord[];
  variant?: 'full' | 'compact';
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

function isPdf(mime: string | null): boolean {
  return mime === 'application/pdf';
}

function isVideo(mime: string | null): boolean {
  return !!mime && mime.startsWith('video/');
}

function canPreview(mime: string | null): boolean {
  return isImage(mime) || isPdf(mime) || isVideo(mime);
}

function iconFor(mime: string | null) {
  if (isImage(mime)) return FileImage;
  if (isVideo(mime)) return FileVideo;
  if (isPdf(mime)) return FileText;
  if (
    mime?.includes('spreadsheet') ||
    mime?.includes('excel') ||
    mime === 'text/csv'
  ) {
    return FileSpreadsheet;
  }
  if (mime?.includes('zip')) return FileArchive;
  if (mime?.startsWith('text/') || mime?.includes('word')) return FileText;
  return FileIcon;
}

function inlineHref(id: string): string {
  return `/api/attachments/${id}?disposition=inline`;
}

function downloadHref(id: string): string {
  return `/api/attachments/${id}?disposition=attachment`;
}

/* -------------------------------------------------------------------------- */
/*  Single chip                                                                */
/* -------------------------------------------------------------------------- */

interface AttachmentChipProps {
  attachment: AttachmentRecord;
  variant: 'full' | 'compact';
  onPreview: () => void;
}

function AttachmentChip({ attachment, variant, onPreview }: AttachmentChipProps) {
  const Icon = iconFor(attachment.mime_type);
  const previewable = canPreview(attachment.mime_type);
  const showImageThumb = isImage(attachment.mime_type) && variant === 'full';

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="max-w-[140px] truncate" title={attachment.file_name}>
          {attachment.file_name}
        </span>
        {previewable && (
          <button
            type="button"
            onClick={onPreview}
            className="text-muted-foreground transition hover:text-primary"
            aria-label="Vista previa"
            title="Vista previa"
          >
            <Eye className="h-3 w-3" />
          </button>
        )}
        <a
          href={downloadHref(attachment.id)}
          className="text-muted-foreground transition hover:text-primary"
          aria-label="Descargar"
          title="Descargar"
          download={attachment.file_name}
        >
          <Download className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-sm">
      {showImageThumb ? (
        <button
          type="button"
          onClick={onPreview}
          className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
          aria-label={`Abrir vista previa de ${attachment.file_name}`}
        >
          {/*
            We use the inline endpoint as the <img src>. The browser follows
            the 302 to a fresh signed URL and renders the image. No need to
            fetch the URL in JS — keeps things simple and cache-friendly.
          */}
          <img
            src={inlineHref(attachment.id)}
            alt={attachment.file_name}
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p
          className="truncate font-medium text-foreground"
          title={attachment.file_name}
        >
          {attachment.file_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatSize(attachment.file_size)}
          {attachment.mime_type ? ` · ${attachment.mime_type}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {previewable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={onPreview}
          >
            <Eye className="h-3.5 w-3.5" />
            Vista previa
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
          <a href={downloadHref(attachment.id)} download={attachment.file_name}>
            <Download className="h-3.5 w-3.5" />
            Descargar
          </a>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  List + preview modal                                                       */
/* -------------------------------------------------------------------------- */

export function AttachmentList({
  attachments,
  variant = 'full',
  className,
}: AttachmentListProps) {
  const [previewing, setPreviewing] = useState<AttachmentRecord | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const containerClass =
    variant === 'compact'
      ? 'flex flex-wrap gap-1.5'
      : 'flex flex-col gap-2';

  return (
    <>
      <div className={cn(containerClass, className)}>
        {attachments.map((a) => (
          <AttachmentChip
            key={a.id}
            attachment={a}
            variant={variant}
            onPreview={() => setPreviewing(a)}
          />
        ))}
      </div>

      <Dialog
        open={!!previewing}
        onOpenChange={(open) => !open && setPreviewing(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          {previewing && (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-sm font-medium">
                    {previewing.file_name}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(previewing.file_size)}
                    {previewing.mime_type ? ` · ${previewing.mime_type}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                  >
                    <a
                      href={downloadHref(previewing.id)}
                      download={previewing.file_name}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Descargar
                    </a>
                  </Button>
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => setPreviewing(null)}
                    className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center bg-muted/40 p-2">
                {isImage(previewing.mime_type) ? (
                  <img
                    src={inlineHref(previewing.id)}
                    alt={previewing.file_name}
                    className="max-h-[70vh] max-w-full rounded object-contain"
                  />
                ) : isPdf(previewing.mime_type) ? (
                  <iframe
                    src={inlineHref(previewing.id)}
                    title={previewing.file_name}
                    className="h-[70vh] w-full rounded border-0 bg-white"
                  />
                ) : isVideo(previewing.mime_type) ? (
                  <video
                    src={inlineHref(previewing.id)}
                    controls
                    className="max-h-[70vh] max-w-full rounded"
                  >
                    Tu navegador no soporta video.
                  </video>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Vista previa no disponible para este tipo de archivo.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
