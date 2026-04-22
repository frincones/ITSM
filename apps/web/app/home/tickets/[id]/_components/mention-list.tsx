'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, User, Users, UserCog } from 'lucide-react';

import type { MentionableItem } from '~/lib/actions/mentions';

export interface MentionListData {
  query: string;
  agents: MentionableItem[];
  contacts: MentionableItem[];
  otherContacts: MentionableItem[];
  orgName: string | null;
}

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface MentionListProps {
  data: MentionListData;
  command: (item: { id: string; label: string; kind: string }) => void;
}

/**
 * Command-palette-style mention picker: sticky search summary, scrollable
 * body, three grouped sections, keyboard + mouse navigation.
 *
 * Tiptap's suggestion plugin already feeds `query` from whatever the user
 * types after the `@`, so we don't need an editable input here — instead
 * we surface the live query back to the user so they know their keystrokes
 * are filtering. This mirrors how Slack/Linear render mention pickers.
 */
export const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  function MentionList({ data, command }, ref) {
    const [selected, setSelected] = useState(0);
    const scrollerRef = useRef<HTMLDivElement>(null);

    // Flatten the 3 groups into a single keyboard-navigable list, but
    // remember each item's group so we can render headers inline.
    const flat = useMemo(() => {
      const arr: Array<{ item: MentionableItem; group: 'agent' | 'org' | 'other' }> = [];
      for (const i of data.agents) arr.push({ item: i, group: 'agent' });
      for (const i of data.contacts) arr.push({ item: i, group: 'org' });
      for (const i of data.otherContacts) arr.push({ item: i, group: 'other' });
      return arr;
    }, [data.agents, data.contacts, data.otherContacts]);

    // Reset selection when the list changes shape.
    useEffect(() => {
      setSelected(0);
    }, [flat.length, data.query]);

    // Auto-scroll the selected row into view.
    useEffect(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const el = scroller.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const selectItem = (index: number) => {
      const entry = flat[index];
      if (!entry) return;
      command({
        id: `${entry.item.kind}:${entry.item.id}`,
        label: entry.item.name,
        kind: entry.item.kind,
      });
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (flat.length === 0) return false;
        if (event.key === 'ArrowUp') {
          setSelected((s) => (s - 1 + flat.length) % flat.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelected((s) => (s + 1) % flat.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          selectItem(selected);
          return true;
        }
        return false;
      },
    }));

    const totalCount = flat.length;
    const contactHeader = data.orgName
      ? `Contactos de ${data.orgName}`
      : 'Contactos del cliente';

    return (
      <div className="w-[380px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
        {/* Search header — shows current query + hint */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            {data.query ? (
              <div className="truncate text-xs">
                <span className="text-muted-foreground">Buscando: </span>
                <span className="font-medium text-foreground">{data.query}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Escribe para filtrar por nombre o email…
              </div>
            )}
          </div>
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {totalCount}
          </span>
        </div>

        {/* Empty state */}
        {flat.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {data.query ? (
              <>
                Sin coincidencias para <span className="font-medium text-foreground">{data.query}</span>.
              </>
            ) : (
              <>No hay usuarios disponibles.</>
            )}
          </div>
        )}

        {/* Scrollable body */}
        {flat.length > 0 && (
          <div
            ref={scrollerRef}
            className="max-h-[320px] overflow-y-auto py-1"
          >
            <GroupSection
              title="Agentes"
              subtitle="Staff — no visible al requester"
              icon={<UserCog className="h-3 w-3" />}
              items={data.agents}
              flat={flat}
              group="agent"
              selected={selected}
              onHover={setSelected}
              onSelect={selectItem}
            />
            <GroupSection
              title={contactHeader}
              subtitle="Serán añadidos como CC visibles en el email"
              icon={<Users className="h-3 w-3" />}
              items={data.contacts}
              flat={flat}
              group="org"
              selected={selected}
              onHover={setSelected}
              onSelect={selectItem}
            />
            <GroupSection
              title="Otros contactos"
              subtitle="Contactos del tenant sin organización asignada"
              icon={<User className="h-3 w-3" />}
              items={data.otherContacts}
              flat={flat}
              group="other"
              selected={selected}
              onHover={setSelected}
              onSelect={selectItem}
            />
          </div>
        )}

        {/* Footer hint */}
        {flat.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border bg-background px-1">↑↓</kbd> navegar ·{' '}
              <kbd className="rounded border border-border bg-background px-1">↵</kbd> seleccionar
            </span>
            <span>
              <kbd className="rounded border border-border bg-background px-1">esc</kbd> cerrar
            </span>
          </div>
        )}
      </div>
    );
  },
);

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

interface GroupSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: MentionableItem[];
  flat: Array<{ item: MentionableItem; group: 'agent' | 'org' | 'other' }>;
  group: 'agent' | 'org' | 'other';
  selected: number;
  onHover: (idx: number) => void;
  onSelect: (idx: number) => void;
}

function GroupSection({
  title,
  subtitle,
  icon,
  items,
  flat,
  group,
  selected,
  onHover,
  onSelect,
}: GroupSectionProps) {
  if (items.length === 0) return null;

  const startIdx = flat.findIndex((e) => e.group === group);

  return (
    <div className="mb-1 last:mb-0">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-popover/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
        <div className="flex items-center gap-1.5">
          {icon}
          <span>{title}</span>
        </div>
        <span className="rounded-sm bg-muted px-1 py-0.5 text-[9px] font-medium normal-case">
          {items.length}
        </span>
      </div>
      <div className="px-1 pb-1 text-[10px] text-muted-foreground" style={{ paddingLeft: 28 }}>
        {subtitle}
      </div>
      {items.map((item, localIdx) => {
        const idx = startIdx + localIdx;
        const isSelected = idx === selected;
        return (
          <button
            key={`${item.kind}:${item.id}`}
            type="button"
            data-idx={idx}
            onMouseEnter={() => onHover(idx)}
            onClick={() => onSelect(idx)}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
              isSelected ? 'bg-accent' : 'hover:bg-muted'
            }`}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground">
              {getInitials(item.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{item.name}</div>
              {item.email && (
                <div className="truncate text-[10px] text-muted-foreground">
                  {item.email}
                </div>
              )}
            </div>
            <KindBadge kind={item.kind} role={item.role ?? null} />
          </button>
        );
      })}
    </div>
  );
}

function KindBadge({ kind, role }: { kind: string; role: string | null }) {
  if (kind === 'staff') {
    return (
      <span className="shrink-0 rounded-sm bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
        {role ?? 'Staff'}
      </span>
    );
  }
  if (kind === 'client_user') {
    // Portal users — distinct hue so agents know this person has a login
    // and will also get an in-app notification, not just an email CC.
    return (
      <span className="shrink-0 rounded-sm bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
        Portal
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-sm bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
      Cliente
    </span>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
