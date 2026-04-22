'use client';

import { useEffect, useMemo, useState } from 'react';
// Browser-only — `isomorphic-dompurify` drags `jsdom` into the SSR bundle
// and Turbopack on Windows fails trying to open jsdom's internal
// default-stylesheet.css. We gate the actual sanitize call with a window
// check so SSR renders the unsanitized HTML only as a placeholder; the
// effect-driven state swap replaces it with the purified version before
// any user interaction is possible.
import DOMPurify from 'dompurify';

/**
 * Renders Tiptap HTML safely in the ticket timeline.
 *
 * Trust model: `html` comes from our own Tiptap composer round-tripped
 * through the DB, but an attacker who compromises the DB or a client that
 * posts raw HTML could inject script. DOMPurify strips anything outside
 * our allowlist before we hand it to the browser.
 *
 * Styling: we reuse the existing `prose` utilities so paragraph spacing,
 * link colors, and list bullets match the rest of the app.
 */
export function RichTextViewer({
  html,
  fallbackText,
  className,
}: {
  html: string | null | undefined;
  fallbackText?: string;
  className?: string;
}) {
  // SSR cannot run DOMPurify (no DOM). We render a safe fallback server-side
  // and swap to the sanitized HTML after mount — users never see unsanitized
  // markup because the fallback path doesn't use dangerouslySetInnerHTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const clean = useMemo(() => {
    if (!html || !mounted) return null;
    if (typeof window === 'undefined') return null;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'a', 'img', 'span', 'div', 'hr',
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel',
        'src', 'alt', 'title', 'width', 'height', 'style',
        'class', 'data-mention-id', 'data-mention-kind',
      ],
      // Block javascript:, data: (except images), file:, etc.
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });
  }, [html, mounted]);

  if (!clean) {
    const safeFallback = fallbackText ?? stripTagsToText(html ?? '');
    if (!safeFallback) return null;
    return (
      <p className={`whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 ${className ?? ''}`}>
        {safeFallback}
      </p>
    );
  }

  return (
    <>
      <style jsx global>{`
        .tiptap-viewer .tiptap-mention {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgb(219 234 254);
          color: rgb(30 64 175);
          font-weight: 500;
          font-size: 0.9em;
        }
        .dark .tiptap-viewer .tiptap-mention {
          background: rgba(59, 130, 246, 0.2);
          color: rgb(147 197 253);
        }
        .tiptap-viewer img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin: 8px 0;
          cursor: zoom-in;
        }
        .tiptap-viewer a {
          color: rgb(37 99 235);
          text-decoration: underline;
        }
        .dark .tiptap-viewer a {
          color: rgb(96 165 250);
        }
        .tiptap-viewer blockquote {
          border-left: 3px solid rgb(209 213 219);
          padding-left: 12px;
          margin: 8px 0;
          color: rgb(75 85 99);
        }
      `}</style>
      <div
        className={`tiptap-viewer prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-300 ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </>
  );
}

/**
 * Naive HTML-to-text for the SSR fallback path. Only used when we have
 * no plain-text fallback and SSR needs to render *something* before
 * DOMPurify becomes available client-side. Unicode decoding isn't
 * perfect but that's fine — on mount the sanitized rich version takes
 * over immediately.
 */
function stripTagsToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
