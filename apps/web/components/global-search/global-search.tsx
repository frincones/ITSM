'use client';

import { useCallback, useEffect, useState } from 'react';

import { CommandPalette } from './command-palette';
import { TopbarSearch } from './topbar-search';

/**
 * Top-level composer wired into the home layout's topbar.
 *
 *   · Renders the inline live-dropdown under the topbar input.
 *   · Installs a global Cmd/Ctrl+K listener to open the full palette.
 *   · A "Abrir buscador completo" row in the dropdown also escalates.
 */
export function GlobalSearch() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  return (
    <>
      <TopbarSearch onOpenPalette={openPalette} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
