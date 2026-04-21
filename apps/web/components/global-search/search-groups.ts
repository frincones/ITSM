import {
  AlertTriangle,
  BookOpen,
  Building2,
  GitBranch,
  type LucideIcon,
  MessageSquare,
  Monitor,
  Ticket,
  User,
  UserCircle2,
} from 'lucide-react';

import type { SearchEntityType } from '~/lib/actions/search';

/**
 * Metadata for each entity group surfaced in the global search UI.
 *
 * `order` drives the vertical layout — tickets first (most common target),
 * then the things that reference them.
 */
export interface SearchGroupMeta {
  label: string;
  icon: LucideIcon;
  order: number;
  viewAllUrl?: (query: string) => string;
}

export const SEARCH_GROUPS: Record<SearchEntityType, SearchGroupMeta> = {
  ticket: {
    label: 'Tickets',
    icon: Ticket,
    order: 1,
    viewAllUrl: (q) => `/home/tickets?search=${encodeURIComponent(q)}`,
  },
  ticket_comment: {
    label: 'Comentarios en tickets',
    icon: MessageSquare,
    order: 2,
    viewAllUrl: (q) => `/home/tickets?search=${encodeURIComponent(q)}`,
  },
  contact: {
    label: 'Contactos',
    icon: User,
    order: 3,
  },
  organization: {
    label: 'Clientes',
    icon: Building2,
    order: 4,
  },
  agent: {
    label: 'Agentes',
    icon: UserCircle2,
    order: 5,
  },
  kb: {
    label: 'Base de conocimiento',
    icon: BookOpen,
    order: 6,
    viewAllUrl: (q) => `/home/kb?search=${encodeURIComponent(q)}`,
  },
  problem: {
    label: 'Problemas',
    icon: AlertTriangle,
    order: 7,
    viewAllUrl: (q) => `/home/problems?search=${encodeURIComponent(q)}`,
  },
  change: {
    label: 'Cambios',
    icon: GitBranch,
    order: 8,
    viewAllUrl: (q) => `/home/changes?search=${encodeURIComponent(q)}`,
  },
  asset: {
    label: 'Activos',
    icon: Monitor,
    order: 9,
    viewAllUrl: (q) => `/home/assets?search=${encodeURIComponent(q)}`,
  },
};

export const ORDERED_ENTITY_TYPES: SearchEntityType[] = (
  Object.keys(SEARCH_GROUPS) as SearchEntityType[]
).sort((a, b) => SEARCH_GROUPS[a].order - SEARCH_GROUPS[b].order);

const FIELD_LABELS: Record<string, string> = {
  ticket_number: 'Nº ticket',
  title: 'Título',
  description: 'Descripción',
  requester: 'Solicitante',
  comment: 'Comentario',
  name: 'Nombre',
  email: 'Email',
  phone: 'Teléfono',
  company: 'Empresa',
  content: 'Contenido',
};

export function matchedFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/**
 * Wraps the matched substring(s) in <mark> tags for visual highlight.
 * Case- and accent-insensitive match.
 */
export function highlightMatch(text: string, query: string): string {
  if (!text || !query) return text ?? '';
  const q = query.trim();
  if (q.length < 2) return text;

  // Escape regex meta chars in the query.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'ig');
  return text.replace(re, '<mark>$1</mark>');
}
