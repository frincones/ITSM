# ARQUITECTURA TÉCNICA — NovaDesk ITSM AI-First Platform

> **Documento de Arquitectura v1.0**
> **Fecha:** 2026-03-26
> **Rol:** @arquitecto — Guardian de Arquitectura
> **Stack:** Next.js 15 (App Router) + Vercel + Supabase + Claude AI SDK
> **Template UI:** Figma/Vite reference (shadcn/ui + Tailwind CSS 4 + Radix UI + Recharts + Lucide Icons)

---

## TABLA DE CONTENIDOS

1. [Visión Arquitectónica](#1-visión-arquitectónica)
2. [Stack Tecnológico Definitivo](#2-stack-tecnológico-definitivo)
3. [Arquitectura de Capas](#3-arquitectura-de-capas)
4. [Estructura del Monorepo](#4-estructura-del-monorepo)
5. [Frontend — Reglas y Patrones](#5-frontend--reglas-y-patrones)
6. [Backend — API Routes y Server Actions](#6-backend--api-routes-y-server-actions)
7. [Supabase Database — Schema Completo](#7-supabase-database--schema-completo)
8. [Multi-Tenancy — Modelo de Aislamiento](#8-multi-tenancy--modelo-de-aislamiento)
9. [Seguridad — Reglas y Políticas](#9-seguridad--reglas-y-políticas)
10. [Perfiles, Roles y Accesos (RBAC)](#10-perfiles-roles-y-accesos-rbac)
11. [AI Agents — Arquitectura Multi-Agente](#11-ai-agents--arquitectura-multi-agente)
12. [Inbox Omnicanal — Arquitectura](#12-inbox-omnicanal--arquitectura)
13. [Workflow Engine — Arquitectura](#13-workflow-engine--arquitectura)
14. [SLA/OLA Engine](#14-slaola-engine)
15. [Notificaciones — Arquitectura](#15-notificaciones--arquitectura)
16. [Performance y Optimización de BD](#16-performance-y-optimización-de-bd)
17. [Reglas de Código — Convenciones Obligatorias](#17-reglas-de-código--convenciones-obligatorias)
18. [Design System — Reglas de UI/UX](#18-design-system--reglas-de-uiux)
19. [Integraciones — Capa de Integración](#19-integraciones--capa-de-integración)
20. [Testing — Estrategia](#20-testing--estrategia)
21. [CI/CD y Deploy](#21-cicd-y-deploy)
22. [Checklist de Validación Arquitectónica](#22-checklist-de-validación-arquitectónica)

---

## 1. VISIÓN ARQUITECTÓNICA

### Principios Fundamentales

| # | Principio | Descripción |
|---|-----------|-------------|
| P1 | **AI-First** | La AI no es un add-on. Es la capa central que orquesta triage, routing, resolución y analytics |
| P2 | **Multi-Tenant por diseño** | RLS de Supabase como barrera de aislamiento. `tenant_id` en el 100% de tablas |
| P3 | **Zero Trust** | Nunca confiar en datos del frontend. Toda autorización se valida en server-side y RLS |
| P4 | **Performance Budget** | API routes < 500ms. Page loads < 2s (P95). DB queries < 100ms |
| P5 | **Convention over Configuration** | Patrones consistentes. Un solo way de hacer cada cosa |
| P6 | **Separation of Concerns** | Server Components para data fetching. Client Components solo para interactividad |
| P7 | **Type Safety** | TypeScript strict. Zod en boundaries. Database types auto-generados |
| P8 | **Auditabilidad Total** | Toda mutación deja rastro en audit_logs con actor, IP, diff |

### Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENTS                                           │
│  ┌─────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Browser │  │ Mobile App │  │ REST API │  │ Webhook Inbound  │  │
│  └────┬────┘  └─────┬──────┘  └────┬─────┘  └───────┬──────────┘  │
├───────┼─────────────┼──────────────┼─────────────────┼──────────────┤
│       │      EDGE LAYER (Vercel)   │                 │              │
│  ┌────▼──────────────▼─────────────▼─────────────────▼──────────┐  │
│  │                  Next.js 15 (App Router)                      │  │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────────────┐ │  │
│  │  │ Middleware  │  │ API Routes │  │  Server Actions          │ │  │
│  │  │ (CSRF,Auth, │  │ /api/v1/*  │  │  (mutations)            │ │  │
│  │  │  Tenant)    │  │            │  │                         │ │  │
│  │  └────────────┘  └────────────┘  └─────────────────────────┘ │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │              SERVER COMPONENTS LAYER                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────────────┐ │  │
│  │  │ Page.tsx   │  │ Layout.tsx │  │  Data Fetching          │ │  │
│  │  │ (SSR)      │  │ (shared)   │  │  (Supabase SSR Client)  │ │  │
│  │  └────────────┘  └────────────┘  └─────────────────────────┘ │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │              CLIENT COMPONENTS LAYER                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────────────┐ │  │
│  │  │ Interactive│  │ Forms      │  │  AI Chat Widget          │ │  │
│  │  │ UI (shadcn)│  │ (RHF+Zod) │  │  (Vercel AI SDK stream)  │ │  │
│  │  └────────────┘  └────────────┘  └─────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                  AI ORCHESTRATION LAYER                              │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐  │
│  │ Triage  │ │ Support  │ │ Routing  │ │ RAG /  │ │ Escalation │  │
│  │ Agent   │ │ Agent    │ │ Agent    │ │ KB     │ │ Agent      │  │
│  └─────────┘ └──────────┘ └──────────┘ └────────┘ └────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Claude API (Anthropic) + Vercel AI SDK + pgvector (RAG)     │  │
│  └──────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                  BACKEND ENGINES                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │ Workflow │ │ Rules    │ │ SLA/OLA  │ │ Notification Engine  │  │
│  │ Engine   │ │ Engine   │ │ Engine   │ │ (Queue + Workers)    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                  DATA LAYER (Supabase)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │PostgreSQL│ │  Auth    │ │ Storage  │ │ Realtime │ │pgvector │ │
│  │  + RLS   │ │ (JWT)   │ │ (S3)     │ │ (WS)     │ │(vectors)│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                  INTEGRATION LAYER                                   │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ Email  │ │ WhatsApp │ │ Office   │ │ GitHub/  │ │ Webhooks  │ │
│  │IMAP/SES│ │ Cloud API│ │ 365 Graph│ │ GitLab   │ │ In/Out    │ │
│  └────────┘ └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. STACK TECNOLÓGICO DEFINITIVO

| Capa | Tecnología | Versión | Justificación |
|------|-----------|---------|---------------|
| **Framework** | Next.js (App Router) | 15.x | SSR, Server Actions, API Routes, Middleware |
| **Runtime** | Node.js | 20 LTS | Compatibilidad Vercel |
| **Hosting** | Vercel | Pro/Enterprise | Edge Functions, Cron Jobs, Analytics, KV |
| **Database** | Supabase PostgreSQL | 15+ | RLS nativo, Realtime, Auth, Storage, pgvector |
| **Auth** | Supabase Auth | Latest | JWT, OAuth2, MFA, Magic Links, SSO (SAML) |
| **Realtime** | Supabase Realtime | Latest | WebSocket para notificaciones, chat, inbox |
| **Storage** | Supabase Storage | Latest | Archivos adjuntos, avatares, documentos |
| **AI LLM** | Claude API (Anthropic) | claude-sonnet-4-6 | Reasoning, clasificación, RAG, tool calling |
| **AI SDK** | Vercel AI SDK | 4.x | Streaming, tool calling, multi-provider |
| **Embeddings** | OpenAI text-embedding-3-small | Latest | Vectores para búsqueda semántica (1536 dims) |
| **Vector DB** | pgvector (Supabase) | 0.7+ | Embeddings en PostgreSQL nativo |
| **UI Library** | shadcn/ui | Latest | Components Radix UI + Tailwind (del template Figma) |
| **CSS** | Tailwind CSS | 4.x | Utility-first, theme tokens via CSS variables |
| **Icons** | Lucide React | 0.487+ | SVG icons consistentes (del template Figma) |
| **Charts** | Recharts | 2.15+ | Gráficos para dashboards (del template Figma) |
| **Tables** | TanStack Table | 8.x | Sorting, filtering, pagination server-side |
| **State** | TanStack Query | 5.x | Cache, optimistic updates, refetch on focus |
| **Forms** | React Hook Form + Zod | Latest | Validación type-safe en client y server |
| **Rich Text** | Tiptap | 2.x | Editor WYSIWYG para descripciones y followups |
| **Workflow Visual** | React Flow | 11.x | Editor visual drag-and-drop para workflows |
| **Email** | React Email + Resend | Latest | Templates type-safe de email |
| **Monorepo** | Turborepo + pnpm | Latest | Build caching, dependency dedup |
| **Testing** | Vitest + Playwright | Latest | Unit + E2E |
| **CI/CD** | GitHub Actions → Vercel | Latest | Preview deploys, checks, auto-deploy |

---

## 3. ARQUITECTURA DE CAPAS

### Capa 1: Presentation (Frontend)
- **Server Components** (default): Data fetching, layouts, pages estáticas
- **Client Components** (opt-in con `'use client'`): Formularios, interactividad, AI chat
- **Template Figma como referencia visual obligatoria**: Todas las páginas deben replicar la estructura y componentes del template

### Capa 2: Application (API + Server Actions)
- **Server Actions**: Mutaciones (crear ticket, actualizar, asignar)
- **API Routes `/api/v1/*`**: Endpoints REST para integraciones externas y webhooks
- **API Routes `/api/ai/*`**: Endpoints de AI streaming (chat, classify, suggest)

### Capa 3: Domain (Business Logic)
- **Engines**: Workflow Engine, Rules Engine, SLA Engine, Notification Engine
- **Services**: TicketService, ProblemService, ChangeService, InboxService
- **Validators**: Zod schemas compartidos entre client y server

### Capa 4: Infrastructure (Data + AI)
- **Supabase Client**: SSR client (cookies) para Server Components, Browser client para Client Components
- **AI SDK**: Claude API para agentes, pgvector para RAG
- **Storage**: Supabase Storage para archivos adjuntos
- **Realtime**: Supabase Realtime para notificaciones push

---

## 4. ESTRUCTURA DEL MONOREPO

```
ITSM/
├── apps/
│   └── web/                              # Next.js 15 App
│       ├── app/                          # App Router
│       │   ├── (marketing)/              # Landing page pública
│       │   │   ├── layout.tsx
│       │   │   └── page.tsx
│       │   ├── auth/                     # Autenticación
│       │   │   ├── sign-in/page.tsx
│       │   │   ├── sign-up/page.tsx
│       │   │   ├── verify/page.tsx
│       │   │   ├── password-reset/page.tsx
│       │   │   ├── callback/route.ts
│       │   │   └── layout.tsx
│       │   ├── home/                     # App autenticada (dashboard técnico)
│       │   │   ├── layout.tsx            # Layout con sidebar + topbar
│       │   │   ├── page.tsx              # Dashboard
│       │   │   ├── tickets/
│       │   │   │   ├── page.tsx          # Lista de tickets
│       │   │   │   ├── new/page.tsx      # Crear ticket
│       │   │   │   └── [id]/page.tsx     # Detalle de ticket
│       │   │   ├── inbox/
│       │   │   │   ├── page.tsx          # Inbox omnicanal
│       │   │   │   └── [conversationId]/page.tsx
│       │   │   ├── problems/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── changes/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── projects/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── assets/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── kb/
│       │   │   │   ├── page.tsx
│       │   │   │   └── articles/
│       │   │   │       ├── new/page.tsx
│       │   │   │       └── [id]/page.tsx
│       │   │   ├── service-catalog/page.tsx
│       │   │   ├── automations/page.tsx
│       │   │   ├── workflows/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── reports/
│       │   │   │   ├── page.tsx
│       │   │   │   ├── tickets/page.tsx
│       │   │   │   ├── sla/page.tsx
│       │   │   │   └── agents/page.tsx
│       │   │   ├── notifications/page.tsx
│       │   │   └── settings/
│       │   │       ├── page.tsx          # General settings
│       │   │       ├── agents/page.tsx
│       │   │       ├── groups/page.tsx
│       │   │       ├── profiles/page.tsx
│       │   │       ├── categories/page.tsx
│       │   │       ├── sla/page.tsx
│       │   │       ├── rules/page.tsx
│       │   │       ├── partners/page.tsx
│       │   │       ├── channels/page.tsx
│       │   │       ├── notifications/page.tsx
│       │   │       ├── calendars/page.tsx
│       │   │       ├── webhooks/page.tsx
│       │   │       ├── ai/page.tsx
│       │   │       ├── portal/page.tsx
│       │   │       └── billing/page.tsx
│       │   ├── portal/                   # Portal del cliente (subdomain)
│       │   │   ├── layout.tsx            # Layout con branding del tenant
│       │   │   ├── page.tsx              # Home del portal
│       │   │   ├── tickets/
│       │   │   │   ├── page.tsx
│       │   │   │   ├── new/page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── kb/page.tsx
│       │   │   └── chat/page.tsx         # AI Assistant
│       │   ├── api/
│       │   │   ├── v1/                   # REST API pública
│       │   │   │   ├── tickets/route.ts
│       │   │   │   ├── problems/route.ts
│       │   │   │   ├── changes/route.ts
│       │   │   │   ├── kb/route.ts
│       │   │   │   ├── inbox/route.ts
│       │   │   │   └── webhooks/route.ts
│       │   │   ├── ai/                   # AI endpoints
│       │   │   │   ├── chat/route.ts     # Streaming chat
│       │   │   │   ├── classify/route.ts # Tipificación
│       │   │   │   └── suggest/route.ts  # Sugerencias
│       │   │   └── cron/                 # Vercel Cron Jobs
│       │   │       ├── sla-check/route.ts
│       │   │       ├── metrics-snapshot/route.ts
│       │   │       └── inbox-sync/route.ts
│       │   ├── layout.tsx                # Root layout
│       │   └── middleware.ts             # Auth + CSRF + Tenant resolution
│       ├── components/                   # Componentes compartidos de la app
│       ├── lib/                          # Utilidades de la app
│       │   ├── actions/                  # Server Actions
│       │   │   ├── tickets.ts
│       │   │   ├── problems.ts
│       │   │   ├── changes.ts
│       │   │   ├── inbox.ts
│       │   │   └── admin.ts
│       │   ├── services/                 # Business logic
│       │   │   ├── ticket.service.ts
│       │   │   ├── sla.service.ts
│       │   │   ├── rules.service.ts
│       │   │   ├── workflow.service.ts
│       │   │   └── notification.service.ts
│       │   ├── ai/                       # AI agents config
│       │   │   ├── agents/
│       │   │   │   ├── triage.ts
│       │   │   │   ├── support.ts
│       │   │   │   ├── routing.ts
│       │   │   │   └── knowledge.ts
│       │   │   ├── tools/                # AI tool definitions
│       │   │   └── rag/                  # RAG pipeline
│       │   ├── schemas/                  # Zod schemas (shared)
│       │   │   ├── ticket.schema.ts
│       │   │   ├── problem.schema.ts
│       │   │   ├── change.schema.ts
│       │   │   └── common.schema.ts
│       │   └── constants/
│       ├── config/                       # App config
│       ├── styles/                       # CSS (theme.css del template Figma)
│       ├── public/
│       └── supabase/
│           ├── config.toml
│           ├── migrations/               # SQL migrations (ordered)
│           │   ├── 00001_core_tenants.sql
│           │   ├── 00002_auth_agents.sql
│           │   ├── 00003_rbac_profiles.sql
│           │   ├── 00004_tickets.sql
│           │   ├── 00005_problems_changes.sql
│           │   ├── 00006_sla_ola.sql
│           │   ├── 00007_inbox.sql
│           │   ├── 00008_knowledge_base.sql
│           │   ├── 00009_ai_agents_rag.sql
│           │   ├── 00010_workflows.sql
│           │   ├── 00011_rules.sql
│           │   ├── 00012_notifications.sql
│           │   ├── 00013_reports_metrics.sql
│           │   ├── 00014_audit_logs.sql
│           │   ├── 00015_projects.sql
│           │   ├── 00016_assets.sql
│           │   ├── 00017_partners.sql
│           │   ├── 00018_webhooks.sql
│           │   └── 00019_functions_triggers.sql
│           ├── seed.sql
│           └── templates/
├── packages/
│   ├── ui/                               # shadcn/ui components (del template Figma)
│   │   └── src/
│   │       ├── shadcn/                   # Componentes base (accordion, button, card, etc.)
│   │       └── itsm/                     # Componentes ITSM custom
│   │           ├── ticket-timeline.tsx
│   │           ├── inbox-view.tsx
│   │           ├── ai-chat.tsx
│   │           ├── sla-indicator.tsx
│   │           ├── kanban-board.tsx
│   │           ├── workflow-editor.tsx
│   │           ├── metrics-dashboard.tsx
│   │           ├── rule-builder.tsx
│   │           ├── form-builder.tsx
│   │           └── omni-search.tsx
│   ├── supabase/                         # Supabase clients + hooks
│   ├── shared/                           # Shared utilities + logger
│   ├── i18n/                             # Internationalization
│   └── features/                         # Feature packages
│       ├── auth/
│       └── accounts/
├── tooling/
│   ├── eslint/
│   ├── prettier/
│   ├── typescript/
│   └── scripts/
├── Contexto/                             # Documentación del proyecto
│   ├── PRD.md
│   ├── ARQUITECTURA.md                   # ← ESTE ARCHIVO
│   └── TemplateFigma/
├── GLPI/                                 # Referencia GLPI (read-only)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 5. FRONTEND — REGLAS Y PATRONES

### 5.1 Regla de Server vs Client Components

```
REGLA OBLIGATORIA:

✅ Server Component (default) para:
  - Pages (page.tsx) → data fetching directo con Supabase SSR client
  - Layouts (layout.tsx) → estructura compartida
  - Componentes que solo muestran datos

✅ Client Component ('use client') SOLO para:
  - Formularios interactivos (React Hook Form)
  - Componentes con useState, useEffect
  - AI Chat widget (streaming)
  - Componentes con event handlers (onClick, onChange)
  - Dropdowns, modals, popovers interactivos

❌ PROHIBIDO:
  - Fetch de datos en Client Components (usar Server Component + props)
  - useEffect para data fetching (usar Server Component o TanStack Query)
  - Pasar funciones como props de Server a Client (usar Server Actions)
```

### 5.2 Patrón de Data Fetching

```typescript
// ✅ CORRECTO: Server Component con data fetching
// app/home/tickets/page.tsx
import { getSupabaseServerClient } from '@kit/supabase/server-client';

export default async function TicketsPage() {
  const client = getSupabaseServerClient();

  const { data: tickets, error } = await client
    .from('tickets')
    .select('*, assigned_agent:agents(name, avatar_url), category:categories(name)')
    .order('created_at', { ascending: false })
    .limit(50);

  // RLS filtra automáticamente por tenant_id

  return <TicketListClient tickets={tickets ?? []} />;
}

// ✅ CORRECTO: Client Component solo para interactividad
// components/ticket-list-client.tsx
'use client';

export function TicketListClient({ tickets }: { tickets: Ticket[] }) {
  const [filter, setFilter] = useState('all');
  // ... interactividad
}
```

### 5.3 Patrón de Server Actions (Mutaciones)

```typescript
// ✅ CORRECTO: Server Action para mutaciones
// lib/actions/tickets.ts
'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createTicketSchema } from '~/lib/schemas/ticket.schema';
import { revalidatePath } from 'next/cache';

export async function createTicket(input: z.infer<typeof createTicketSchema>) {
  const validated = createTicketSchema.parse(input);
  const client = getSupabaseServerClient();

  // Obtener tenant_id y agent_id del usuario autenticado
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!agent) throw new Error('Agent not found');

  const { data: ticket, error } = await client
    .from('tickets')
    .insert({
      ...validated,
      tenant_id: agent.tenant_id,  // NUNCA del frontend
      created_by: user.id,
      status: 'new',
    })
    .select()
    .single();

  if (error) throw error;

  // Trigger AI triage (async, no blocking)
  // Trigger SLA calculation
  // Trigger rules engine
  // Trigger notification

  revalidatePath('/home/tickets');
  return ticket;
}
```

### 5.4 Patrón de Formularios

```typescript
// ✅ CORRECTO: React Hook Form + Zod + Server Action
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTicketSchema } from '~/lib/schemas/ticket.schema';
import { createTicket } from '~/lib/actions/tickets';
import { useTransition } from 'react';

export function CreateTicketForm() {
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { title: '', description: '', type: 'incident', urgency: 'medium' },
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      await createTicket(data);
    });
  });

  return <form onSubmit={onSubmit}>{/* shadcn/ui form fields */}</form>;
}
```

### 5.5 Referencia Obligatoria del Template Figma

```
REGLA MANDATORIA:

Toda página DEBE replicar la estructura visual del template Figma ubicado en:
  Contexto/TemplateFigma/Untitled/src/app/pages/

Correspondencia de archivos:
  Template Figma                    →  Next.js App
  ─────────────────────────────────────────────────
  pages/Dashboard.tsx               →  app/home/page.tsx
  pages/TicketList.tsx              →  app/home/tickets/page.tsx
  pages/TicketDetail.tsx            →  app/home/tickets/[id]/page.tsx
  pages/Inbox.tsx                   →  app/home/inbox/page.tsx
  pages/Problems.tsx                →  app/home/problems/page.tsx
  pages/Changes.tsx                 →  app/home/changes/page.tsx
  pages/Projects.tsx                →  app/home/projects/page.tsx
  pages/Assets.tsx                  →  app/home/assets/page.tsx
  pages/KnowledgeBase.tsx           →  app/home/kb/page.tsx
  pages/ServiceCatalog.tsx          →  app/home/service-catalog/page.tsx
  pages/ServicePortal.tsx           →  app/portal/page.tsx
  pages/WorkflowBuilder.tsx         →  app/home/workflows/[id]/page.tsx
  pages/Automations.tsx             →  app/home/automations/page.tsx
  pages/Reports.tsx                 →  app/home/reports/page.tsx
  pages/Notifications.tsx           →  app/home/notifications/page.tsx
  pages/Settings.tsx                →  app/home/settings/page.tsx
  pages/Login.tsx                   →  app/auth/sign-in/page.tsx

Componentes UI del template a reutilizar:
  components/ui/*                   →  packages/ui/src/shadcn/*
  components/Layout.tsx             →  app/home/layout.tsx
  styles/theme.css                  →  apps/web/styles/theme.css

VALIDAR SIEMPRE que:
  ✅ Misma estructura de layout (sidebar + topbar + content)
  ✅ Mismos componentes shadcn/ui (Card, Badge, Button, Table, etc.)
  ✅ Misma iconografía (Lucide React)
  ✅ Mismos charts (Recharts)
  ✅ Mismos colores y tokens CSS del theme.css
  ✅ Componente AIInsight presente en Dashboard y Ticket Detail
```

---

## 6. BACKEND — API ROUTES Y SERVER ACTIONS

### 6.1 Estructura de API Routes

```
REGLA: API Routes SOLO para:
  1. Integraciones externas (REST API v1)
  2. Webhooks entrantes (inbox channels, partners)
  3. AI streaming endpoints
  4. Cron jobs (Vercel Cron)

Para mutaciones internas de la app → usar Server Actions
```

### 6.2 Patrón de API Route

```typescript
// app/api/v1/tickets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { validateApiKey } from '~/lib/api/auth';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  const apiKey = await validateApiKey(request); // Valida API key + tenant
  if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = getSupabaseServerClient();
  const { searchParams } = new URL(request.url);

  const { data, error } = await client
    .from('tickets')
    .select('*')
    .eq('tenant_id', apiKey.tenant_id) // Explícito para API (no depende de RLS de user)
    .order('created_at', { ascending: false })
    .range(0, 49);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

### 6.3 Middleware Obligatorio

```typescript
// middleware.ts — EXTIENDE el middleware existente del starter kit
// REGLA: NO reescribir, EXTENDER

// Funcionalidades que DEBE tener:
// 1. CSRF protection (ya existe en starter kit)
// 2. Auth check (ya existe en starter kit)
// 3. Tenant resolution (NUEVO)
// 4. Request ID (NUEVO)
// 5. Rate limiting header check (NUEVO)

// Tenant resolution:
// - Leer subdomain del request (ej: acme.novadesk.com → tenant slug = 'acme')
// - O leer header X-Tenant-ID para API requests
// - Setear en cookie/header para uso downstream
```

---

## 7. SUPABASE DATABASE — SCHEMA COMPLETO

### 7.1 Convenciones de Schema

```sql
-- ═══════════════════════════════════════════════════════════════
-- CONVENCIONES OBLIGATORIAS PARA TODAS LAS TABLAS
-- ═══════════════════════════════════════════════════════════════

-- 1. TODA tabla tiene estas columnas:
--    id          uuid PK DEFAULT gen_random_uuid()
--    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
--    created_at  timestamptz NOT NULL DEFAULT now()
--    updated_at  timestamptz NOT NULL DEFAULT now()

-- 2. TODA tabla tiene RLS habilitado:
--    ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
--    ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

-- 3. TODA tabla tiene trigger de updated_at:
--    CREATE TRIGGER set_updated_at BEFORE UPDATE ON {table}
--    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. TODA tabla tiene índice en tenant_id como PRIMERA columna:
--    CREATE INDEX idx_{table}_tenant ON {table} (tenant_id);

-- 5. Nombres de tablas: snake_case, plural
-- 6. Nombres de columnas: snake_case
-- 7. Nombres de índices: idx_{table}_{columns}
-- 8. Nombres de policies: {table}_{operation} (ej: tickets_select)
-- 9. Foreign keys: {table}_{column}_fkey
-- 10. Enums: Se definen como tipos PostgreSQL
```

### 7.2 Función Helper Compartida

```sql
-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener tenant_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid AS $$
  SELECT tenant_id FROM agents WHERE user_id = auth.uid()
  UNION
  SELECT tenant_id FROM partner_agents WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### 7.3 Schema — Migration 00001: Core Tenants

```sql
-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00001: CORE TENANTS
-- ═══════════════════════════════════════════════════════════════

-- Enum types
CREATE TYPE tenant_plan AS ENUM ('free', 'starter', 'professional', 'enterprise');
CREATE TYPE tenant_status AS ENUM ('active', 'trial', 'suspended', 'cancelled');

-- Tenants table (top-level entity)
CREATE TABLE tenants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text UNIQUE NOT NULL,
  domain              text UNIQUE,
  plan                tenant_plan NOT NULL DEFAULT 'trial',
  logo_url            text,
  brand_colors        jsonb DEFAULT '{"primary":"#4f46e5","secondary":"#7c3aed","accent":"#06b6d4"}'::jsonb,
  settings            jsonb DEFAULT '{}'::jsonb,
  features_enabled    text[] DEFAULT '{}',
  max_agents          integer DEFAULT 5,
  max_ai_queries      integer DEFAULT 1000,
  ai_queries_used     integer DEFAULT 0,
  subscription_status tenant_status NOT NULL DEFAULT 'trial',
  trial_ends_at       timestamptz DEFAULT (now() + interval '14 days'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_domain ON tenants (domain) WHERE domain IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tenant settings
CREATE TABLE tenant_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  timezone                text DEFAULT 'America/Bogota',
  date_format             text DEFAULT 'DD/MM/YYYY',
  language                text DEFAULT 'es',
  ticket_prefix           text DEFAULT 'TKT',
  auto_assign             boolean DEFAULT true,
  require_category        boolean DEFAULT true,
  ai_auto_triage          boolean DEFAULT true,
  ai_auto_respond         boolean DEFAULT false,
  ai_confidence_threshold float DEFAULT 0.8,
  ai_model_preference     text DEFAULT 'claude-sonnet-4-6',
  notify_on_create        boolean DEFAULT true,
  notify_on_assign        boolean DEFAULT true,
  notify_on_update        boolean DEFAULT true,
  notify_on_close         boolean DEFAULT true,
  portal_enabled          boolean DEFAULT true,
  portal_ai_enabled       boolean DEFAULT true,
  portal_kb_enabled       boolean DEFAULT true,
  session_timeout         integer DEFAULT 480,
  mfa_required            boolean DEFAULT false,
  ip_whitelist            text[],
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 7.4 Schema — Migration 00002: Auth & Agents

```sql
-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00002: AUTH & AGENTS
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE agent_role AS ENUM ('admin', 'supervisor', 'agent', 'readonly');

CREATE TABLE agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  email             text NOT NULL,
  role              agent_role NOT NULL DEFAULT 'agent',
  profile_id        uuid,  -- FK added after profiles table
  skills            text[] DEFAULT '{}',
  avatar_url        text,
  is_active         boolean DEFAULT true,
  last_active_at    timestamptz,
  settings          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id),
  UNIQUE(tenant_id, email)
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_agents_tenant ON agents (tenant_id);
CREATE INDEX idx_agents_user ON agents (user_id);
CREATE INDEX idx_agents_tenant_active ON agents (tenant_id) WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: Agents can only see agents in their own tenant
CREATE POLICY agents_select ON agents FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY agents_insert ON agents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY agents_update ON agents FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY agents_delete ON agents FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Contacts (end users / requesters)
CREATE TABLE contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text,
  email               text,
  phone               text,
  whatsapp_id         text,
  company             text,
  avatar_url          text,
  channel_identifiers jsonb DEFAULT '{}'::jsonb,
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_contacts_tenant ON contacts (tenant_id);
CREATE INDEX idx_contacts_tenant_email ON contacts (tenant_id, email);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY contacts_select ON contacts FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY contacts_insert ON contacts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY contacts_update ON contacts FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY contacts_delete ON contacts FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());
```

### 7.5 Schema — Migration 00003: RBAC Profiles

```sql
-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00003: RBAC PROFILES & PERMISSIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE permission_scope AS ENUM ('own', 'group', 'all');

CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  is_system     boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_profiles_tenant ON profiles (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY profiles_delete ON profiles FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_system = false);

-- Add FK from agents to profiles
ALTER TABLE agents ADD CONSTRAINT agents_profile_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id);

CREATE TABLE profile_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource      text NOT NULL,
  actions       text[] NOT NULL,
  scope         permission_scope NOT NULL DEFAULT 'own',
  conditions    jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, resource)
);

ALTER TABLE profile_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_permissions FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_profile_perms_profile ON profile_permissions (profile_id);

-- Groups
CREATE TABLE groups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  parent_group_id     uuid REFERENCES groups(id),
  manager_agent_id    uuid REFERENCES agents(id),
  email               text,
  auto_assign         boolean DEFAULT false,
  auto_assign_method  text DEFAULT 'round_robin'
                      CHECK (auto_assign_method IN ('round_robin', 'least_busy', 'ai_smart')),
  calendar_id         uuid,  -- FK added later
  sla_id              uuid,  -- FK added later
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_groups_tenant ON groups (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY groups_select ON groups FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY groups_insert ON groups FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY groups_update ON groups FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY groups_delete ON groups FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE TABLE group_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role        text DEFAULT 'member' CHECK (role IN ('member', 'leader')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, agent_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;
```

### 7.6 Schema — Migration 00004: Tickets (Core ITSM)

```sql
-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00004: TICKETS
-- ═══════════════════════════════════════════════════════════════

-- Enum types
CREATE TYPE ticket_type AS ENUM ('incident', 'request', 'warranty', 'support', 'backlog');
CREATE TYPE ticket_status AS ENUM (
  'new', 'assigned', 'in_progress', 'pending', 'testing',
  'resolved', 'closed', 'cancelled'
);
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE ticket_channel AS ENUM (
  'portal', 'email', 'whatsapp', 'phone', 'api', 'ai_agent', 'web_widget'
);

-- Categories (hierarchical)
CREATE TABLE categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  parent_id         uuid REFERENCES categories(id),
  applies_to        text[] DEFAULT '{ticket,problem,change}',
  default_group_id  uuid REFERENCES groups(id),
  default_sla_id    uuid, -- FK added later
  icon              text,
  sort_order        integer DEFAULT 0,
  is_active         boolean DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_categories_tenant ON categories (tenant_id);
CREATE INDEX idx_categories_parent ON categories (tenant_id, parent_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY categories_select ON categories FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY categories_insert ON categories FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY categories_update ON categories FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY categories_delete ON categories FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Services
CREATE TABLE services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES categories(id),
  name            text NOT NULL,
  description     text,
  sla_id          uuid, -- FK added later
  owner_group_id  uuid REFERENCES groups(id),
  is_active       boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_services_tenant ON services (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY services_select ON services FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY services_insert ON services FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY services_update ON services FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY services_delete ON services FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- TICKETS (main table)
CREATE TABLE tickets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_number         text NOT NULL,
  title                 text NOT NULL,
  description           text NOT NULL,
  description_html      text,

  -- AI Classification
  type                  ticket_type NOT NULL DEFAULT 'incident',
  ai_classification     jsonb,
  ai_classified_at      timestamptz,
  ai_classified_by      text,

  -- Status & Workflow
  status                ticket_status NOT NULL DEFAULT 'new',
  urgency               severity_level NOT NULL DEFAULT 'medium',
  impact                severity_level NOT NULL DEFAULT 'medium',
  priority              integer NOT NULL DEFAULT 3,

  -- Assignment
  requester_id          uuid REFERENCES contacts(id),
  requester_email       text,
  assigned_agent_id     uuid REFERENCES agents(id),
  assigned_group_id     uuid REFERENCES groups(id),
  escalation_level      integer DEFAULT 0,

  -- SLA
  sla_id                uuid,  -- FK added later
  ola_id                uuid,  -- FK added later
  sla_due_date          timestamptz,
  ola_due_date          timestamptz,
  sla_breached          boolean DEFAULT false,
  ola_breached          boolean DEFAULT false,

  -- Categorization
  category_id           uuid REFERENCES categories(id),
  subcategory_id        uuid REFERENCES categories(id),
  service_id            uuid REFERENCES services(id),

  -- Channel
  channel               ticket_channel DEFAULT 'portal',
  inbox_message_id      uuid,  -- FK added later

  -- AI Context
  ai_summary            text,
  ai_suggested_solution text,
  ai_evidence           jsonb,
  ai_repository_refs    jsonb,

  -- Metadata
  tags                  text[] DEFAULT '{}',
  custom_fields         jsonb DEFAULT '{}'::jsonb,
  internal_notes        text,

  -- Timestamps
  resolved_at           timestamptz,
  closed_at             timestamptz,
  first_response_at     timestamptz,
  created_by            uuid REFERENCES auth.users(id),
  updated_by            uuid REFERENCES auth.users(id),
  deleted_at            timestamptz,
  deleted_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, ticket_number)
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;

-- Critical indexes for performance
CREATE INDEX idx_tickets_tenant ON tickets (tenant_id);
CREATE INDEX idx_tickets_tenant_status ON tickets (tenant_id, status);
CREATE INDEX idx_tickets_tenant_type_status ON tickets (tenant_id, type, status);
CREATE INDEX idx_tickets_tenant_assigned ON tickets (tenant_id, assigned_agent_id, status);
CREATE INDEX idx_tickets_tenant_group ON tickets (tenant_id, assigned_group_id, status);
CREATE INDEX idx_tickets_tenant_sla ON tickets (tenant_id, sla_due_date)
  WHERE status NOT IN ('closed', 'cancelled') AND deleted_at IS NULL;
CREATE INDEX idx_tickets_tenant_created ON tickets (tenant_id, created_at DESC);
CREATE INDEX idx_tickets_number ON tickets (ticket_number);
CREATE INDEX idx_tickets_requester ON tickets (tenant_id, requester_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY tickets_insert ON tickets FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY tickets_update ON tickets FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY tickets_delete ON tickets FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Ticket number generation function
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix text;
  seq_num integer;
BEGIN
  SELECT ticket_prefix INTO prefix FROM tenant_settings WHERE tenant_id = NEW.tenant_id;
  IF prefix IS NULL THEN prefix := 'TKT'; END IF;

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(ticket_number, '-', 3) AS integer)
  ), 0) + 1 INTO seq_num
  FROM tickets WHERE tenant_id = NEW.tenant_id;

  NEW.ticket_number := prefix || '-' || TO_CHAR(now(), 'YYMM') || '-' || LPAD(seq_num::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_number BEFORE INSERT ON tickets
  FOR EACH ROW WHEN (NEW.ticket_number IS NULL)
  EXECUTE FUNCTION generate_ticket_number();

-- Priority calculation trigger
CREATE OR REPLACE FUNCTION calculate_priority()
RETURNS TRIGGER AS $$
DECLARE
  urgency_val integer;
  impact_val integer;
BEGIN
  urgency_val := CASE NEW.urgency
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3
    WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END;
  impact_val := CASE NEW.impact
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3
    WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END;
  NEW.priority := urgency_val * impact_val;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calc_priority BEFORE INSERT OR UPDATE OF urgency, impact ON tickets
  FOR EACH ROW EXECUTE FUNCTION calculate_priority();

-- Ticket sub-entities
CREATE TABLE ticket_followups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  content       text NOT NULL,
  content_html  text,
  is_private    boolean DEFAULT false,
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  author_type   text DEFAULT 'agent' CHECK (author_type IN ('agent', 'contact', 'ai_agent', 'system')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_followups FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_followups_ticket ON ticket_followups (ticket_id, created_at DESC);

CREATE POLICY ticket_followups_select ON ticket_followups FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_followups_insert ON ticket_followups FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE TABLE ticket_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id         uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  status            text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assigned_agent_id uuid REFERENCES agents(id),
  due_date          timestamptz,
  estimated_hours   float,
  actual_hours      float,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tasks FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_tasks_ticket ON ticket_tasks (ticket_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ticket_tasks_select ON ticket_tasks FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_tasks_insert ON ticket_tasks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_tasks_update ON ticket_tasks FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_tasks_delete ON ticket_tasks FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE TABLE ticket_solutions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  content       text NOT NULL,
  content_html  text,
  is_approved   boolean DEFAULT false,
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  ai_generated  boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_solutions FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_solutions_ticket ON ticket_solutions (ticket_id);

CREATE POLICY ticket_solutions_select ON ticket_solutions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_solutions_insert ON ticket_solutions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE TABLE ticket_validations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  validator_id    uuid NOT NULL REFERENCES agents(id),
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment         text,
  validated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_validations FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_validations_select ON ticket_validations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_validations_insert ON ticket_validations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_validations_update ON ticket_validations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE TABLE ticket_costs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cost_type     text NOT NULL CHECK (cost_type IN ('labor', 'material', 'external', 'other')),
  amount        decimal(12,2) NOT NULL,
  currency      text DEFAULT 'USD',
  description   text,
  agent_id      uuid REFERENCES agents(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_costs FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_costs_select ON ticket_costs FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_costs_insert ON ticket_costs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE TABLE ticket_satisfactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  score         integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment       text,
  contact_id    uuid REFERENCES contacts(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_satisfactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_satisfactions FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_satisfactions_select ON ticket_satisfactions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_satisfactions_insert ON ticket_satisfactions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE TABLE ticket_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  file_url      text NOT NULL,
  mime_type     text,
  file_size     bigint,
  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_attachments_ticket ON ticket_attachments (ticket_id);

CREATE POLICY ticket_attachments_select ON ticket_attachments FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_attachments_insert ON ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE TABLE ticket_relations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  related_ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  relation_type   text NOT NULL CHECK (relation_type IN ('duplicate', 'related', 'parent', 'child', 'blocks', 'blocked_by')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, related_ticket_id, relation_type)
);

ALTER TABLE ticket_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_relations FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_relations_select ON ticket_relations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_relations_insert ON ticket_relations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Templates
CREATE TABLE ticket_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  predefined_fields jsonb DEFAULT '{}'::jsonb,
  mandatory_fields  text[] DEFAULT '{}',
  hidden_fields     text[] DEFAULT '{}',
  readonly_fields   text[] DEFAULT '{}',
  is_active         boolean DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_templates FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_templates_tenant ON ticket_templates (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ticket_templates_select ON ticket_templates FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_templates_insert ON ticket_templates FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_templates_update ON ticket_templates FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_templates_delete ON ticket_templates FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Recurrent tickets
CREATE TABLE ticket_recurrents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id       uuid REFERENCES ticket_templates(id),
  name              text NOT NULL,
  cron_expression   text NOT NULL,
  is_active         boolean DEFAULT true,
  last_generated_at timestamptz,
  next_generate_at  timestamptz,
  config            jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_recurrents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_recurrents FORCE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_recurrents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ticket_recurrents_select ON ticket_recurrents FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_recurrents_insert ON ticket_recurrents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_recurrents_update ON ticket_recurrents FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
```

### 7.7 Schema — Migration 00005: Problems & Changes

```sql
-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00005: PROBLEMS & CHANGES
-- ═══════════════════════════════════════════════════════════════

-- Problem statuses
CREATE TYPE problem_status AS ENUM (
  'new', 'accepted', 'analysis', 'root_cause_identified',
  'solution_planned', 'resolved', 'closed'
);

CREATE TABLE problems (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_number      text NOT NULL,
  title               text NOT NULL,
  description         text,
  status              problem_status NOT NULL DEFAULT 'new',
  urgency             severity_level NOT NULL DEFAULT 'medium',
  impact              severity_level NOT NULL DEFAULT 'medium',
  priority            integer NOT NULL DEFAULT 3,
  root_cause          text,
  root_cause_ai       text,
  workaround          text,
  solution            text,
  category_id         uuid REFERENCES categories(id),
  assigned_agent_id   uuid REFERENCES agents(id),
  assigned_group_id   uuid REFERENCES groups(id),
  ai_pattern_detected jsonb,
  resolved_at         timestamptz,
  created_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, problem_number)
);

ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_problems_tenant ON problems (tenant_id);
CREATE INDEX idx_problems_tenant_status ON problems (tenant_id, status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON problems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY problems_select ON problems FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY problems_insert ON problems FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY problems_update ON problems FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY problems_delete ON problems FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Problem-Ticket links
CREATE TABLE problem_ticket_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_id  uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(problem_id, ticket_id)
);

ALTER TABLE problem_ticket_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_ticket_links FORCE ROW LEVEL SECURITY;

CREATE POLICY ptl_select ON problem_ticket_links FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ptl_insert ON problem_ticket_links FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Changes
CREATE TYPE change_status AS ENUM (
  'new', 'evaluation', 'approval_pending', 'approved', 'scheduled',
  'in_progress', 'testing', 'implemented', 'rolled_back', 'closed', 'rejected'
);
CREATE TYPE change_type AS ENUM ('standard', 'normal', 'emergency');

CREATE TABLE changes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_number       text NOT NULL,
  title               text NOT NULL,
  description         text,
  status              change_status NOT NULL DEFAULT 'new',
  change_type         change_type NOT NULL DEFAULT 'normal',
  risk_level          severity_level NOT NULL DEFAULT 'medium',
  impact_analysis     text,
  rollback_plan       text,
  implementation_plan text,
  scheduled_start     timestamptz,
  scheduled_end       timestamptz,
  actual_start        timestamptz,
  actual_end          timestamptz,
  category_id         uuid REFERENCES categories(id),
  assigned_agent_id   uuid REFERENCES agents(id),
  assigned_group_id   uuid REFERENCES groups(id),
  approval_status     text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ai_risk_assessment  jsonb,
  ai_impact_analysis  jsonb,
  created_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, change_number)
);

ALTER TABLE changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE changes FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_changes_tenant ON changes (tenant_id);
CREATE INDEX idx_changes_tenant_status ON changes (tenant_id, status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON changes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY changes_select ON changes FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY changes_insert ON changes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY changes_update ON changes FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY changes_delete ON changes FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Change validations (CAB approval)
CREATE TABLE change_validations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id       uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  validator_id    uuid NOT NULL REFERENCES agents(id),
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment         text,
  validated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE change_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_validations FORCE ROW LEVEL SECURITY;

CREATE POLICY cv_select ON change_validations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY cv_insert ON change_validations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY cv_update ON change_validations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
```

### 7.8 Schemas Restantes (Resumen de Tablas)

Las siguientes migrations siguen el mismo patrón exacto (RLS + FORCE + 4 policies + tenant_id + indexes + updated_at trigger):

| Migration | Tablas |
|-----------|--------|
| 00006_sla_ola | `slas`, `sla_levels`, `sla_level_actions`, `olas`, `ola_levels`, `ola_level_actions`, `calendars`, `calendar_schedules`, `calendar_holidays` |
| 00007_inbox | `inbox_channels`, `inbox_conversations`, `inbox_messages` |
| 00008_knowledge_base | `kb_categories`, `kb_articles`, `kb_article_revisions`, `kb_article_feedback` |
| 00009_ai_agents_rag | `ai_agents`, `knowledge_documents`, `knowledge_embeddings` (con pgvector) |
| 00010_workflows | `workflows`, `workflow_steps`, `workflow_executions`, `workflow_step_logs` |
| 00011_rules | `rules`, `rule_conditions`, `rule_actions`, `rule_execution_logs` |
| 00012_notifications | `notification_templates`, `notification_queue`, `notifications` |
| 00013_reports_metrics | `ticket_metrics`, `daily_metrics` (partitioned) |
| 00014_audit_logs | `audit_logs` (partitioned by month) |
| 00015_projects | `projects`, `project_tasks`, `project_members` |
| 00016_assets | `assets`, `asset_types`, `asset_assignments` |
| 00017_partners | `partners`, `partner_agents`, `ticket_partner_assignments` |
| 00018_webhooks | `webhooks`, `webhook_logs` |
| 00019_functions_triggers | Funciones RPC, triggers adicionales, seed de perfiles default |

**Total: ~55 tablas**

---

## 8. MULTI-TENANCY — MODELO DE AISLAMIENTO

### 8.1 Estrategia: Shared Database + RLS

```
┌─────────────────────────────────────────────────────┐
│               PostgreSQL Database                    │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              RLS Layer                         │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ Tenant A │  │ Tenant B │  │ Tenant C │   │   │
│  │  │ (data)   │  │ (data)   │  │ (data)   │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘   │   │
│  │                                               │   │
│  │  EVERY query filtered by tenant_id via RLS    │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 8.2 Reglas de Aislamiento

```
REGLA ABSOLUTA #1: TODA tabla tiene tenant_id NOT NULL
REGLA ABSOLUTA #2: TODA tabla tiene ENABLE + FORCE ROW LEVEL SECURITY
REGLA ABSOLUTA #3: TODA policy usa get_current_tenant_id()
REGLA ABSOLUTA #4: NUNCA pasar tenant_id desde el frontend
REGLA ABSOLUTA #5: tenant_id es PRIMERA columna en índices compuestos
REGLA ABSOLUTA #6: service_role queries SIEMPRE filtran por tenant_id explícitamente
```

### 8.3 Tenant Resolution (Middleware)

```typescript
// El tenant se resuelve así:
// 1. Portal del cliente: subdomain → slug lookup → tenant_id
// 2. App autenticada: JWT → user_id → agents.tenant_id
// 3. API externa: API key → api_keys.tenant_id
// 4. Webhook: URL token → webhook.tenant_id

// NUNCA se permite al cliente elegir su tenant_id
```

---

## 9. SEGURIDAD — REGLAS Y POLÍTICAS

### 9.1 Autenticación

| Capa | Mecanismo |
|------|-----------|
| **Browser** | Supabase Auth (JWT en cookies HttpOnly, SameSite=Lax) |
| **API** | API Key en header `X-API-Key` + tenant validation |
| **Webhook** | HMAC-SHA256 signature validation |
| **OAuth** | Google, Microsoft, GitHub (configurables por tenant) |
| **MFA** | TOTP (Google Authenticator) — obligatorio en plan Enterprise |
| **SSO** | SAML 2.0 / OIDC (plan Enterprise) |

### 9.2 Autorización

```
FLUJO DE AUTORIZACIÓN:

1. RLS (base de datos) → Filtra por tenant_id (aislamiento)
2. RBAC (application) → Valida permisos del profile del agent
3. Scope (application) → Valida scope: own | group | all

Ejemplo:
  Agent L1 quiere ver un ticket:
    1. RLS: ¿ticket.tenant_id = agent.tenant_id? ✅
    2. RBAC: ¿profile tiene 'tickets.read'? ✅
    3. Scope: scope = 'own' → ¿ticket.assigned_agent_id = agent.id? ✅/❌
```

### 9.3 Reglas de Seguridad Obligatorias

```
✅ CSRF: Edge middleware con @edge-csrf/nextjs (ya en starter kit)
✅ XSS: Input sanitization con Zod + CSP headers
✅ SQL Injection: Supabase client (prepared statements) — NUNCA raw SQL
✅ Rate Limiting: Vercel rate-limit + per-tenant quotas
✅ Encryption at rest: Supabase managed (AES-256)
✅ Encryption in transit: TLS 1.3 obligatorio
✅ Secrets: Vercel Environment Variables — NUNCA en código
✅ File Upload: Validar mime type, max size (50MB), scan malware
✅ API Keys: Hash con bcrypt, scopes, expiration
✅ Sessions: JWT expiry 1h, refresh token 7d, revocable
✅ Audit: TODA mutación → audit_logs con IP, user_agent, diff
✅ CORS: Solo orígenes autorizados por tenant
✅ Headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy
```

---

## 10. PERFILES, ROLES Y ACCESOS (RBAC)

### 10.1 Perfiles Default (seed)

| Perfil | Tickets | Problems | Changes | KB | Settings | AI Config |
|--------|---------|----------|---------|-----|----------|-----------|
| **Admin** | CRUD + assign + close (all) | CRUD (all) | CRUD + approve (all) | CRUD (all) | Full | Full |
| **Supervisor** | CRUD + assign + close (group) | CRUD (group) | CRUD + approve (group) | CRUD (all) | Read | Read |
| **Agent L2** | CRUD + close (group) | CRUD (group) | CRUD (own) | CRUD (all) | None | None |
| **Agent L1** | CR + update (own) | Read (all) | Read (all) | Read (all) | None | None |
| **Readonly** | Read (all) | Read (all) | Read (all) | Read (all) | None | None |
| **Partner Agent** | Read + update (assigned) | None | None | Read (public) | None | None |
| **Portal User** | Create + read (own) | None | None | Read (public) | None | None |

### 10.2 Validación de Permisos en Server

```typescript
// lib/services/rbac.service.ts
export async function checkPermission(
  agentId: string,
  resource: string,     // 'tickets'
  action: string,       // 'update'
  resourceOwnerId?: string,
  resourceGroupId?: string
): Promise<boolean> {
  const agent = await getAgentWithProfile(agentId);
  const permission = agent.profile.permissions.find(p => p.resource === resource);

  if (!permission) return false;
  if (!permission.actions.includes(action)) return false;

  switch (permission.scope) {
    case 'all': return true;
    case 'group':
      return agent.groups.some(g => g.id === resourceGroupId);
    case 'own':
      return agent.id === resourceOwnerId;
    default: return false;
  }
}
```

---

## 11. AI AGENTS — ARQUITECTURA MULTI-AGENTE

### 11.1 Patrón de Implementación

```typescript
// lib/ai/agents/triage.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function triageTicket(ticket: {
  title: string;
  description: string;
  attachments?: string[];
}) {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    system: `You are an ITSM triage agent. Classify the ticket into one of these types:
      - incident: Something is broken or not working
      - request: User wants something new or a change
      - warranty: Hardware/software defect covered by warranty
      - support: General support question
      - backlog: Enhancement or feature request for development

      Also determine urgency (low/medium/high/critical) and suggest a category.
      Respond in JSON format.`,
    prompt: `Title: ${ticket.title}\nDescription: ${ticket.description}`,
    temperature: 0.2,
  });

  return JSON.parse(result.text);
}
```

### 11.2 RAG Pipeline

```
Document Ingestion:
  Source (repo/docs/KB) → Chunking (500 tokens) → Embedding (OpenAI) → pgvector

Query Flow:
  User question → Embedding → Vector search (cosine similarity, top 10)
  → Context assembly → Claude prompt with context → Answer with citations
```

---

## 12. INBOX OMNICANAL — ARQUITECTURA

```
Channel Adapters (each is a separate module):
  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │ IMAP/SMTP  │  │ Office 365 │  │ WhatsApp   │  │ Web Widget │
  │ Adapter    │  │ Graph API  │  │ Cloud API  │  │ WebSocket  │
  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
        │               │               │               │
        └───────────────┴───────────────┴───────────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Inbox Normalizer    │
                    │  (unified message    │
                    │   format)            │
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Inbox AI Agent      │
                    │  - Contact matching  │
                    │  - Classification    │
                    │  - Auto-response     │
                    │  - Ticket creation   │
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │  inbox_conversations │
                    │  inbox_messages      │
                    │  → tickets           │
                    └──────────────────────┘
```

---

## 13. WORKFLOW ENGINE — ARQUITECTURA

```
Trigger Event (ticket.created, sla.warning, etc.)
  │
  ▼
Workflow Matcher (find active workflows for this event)
  │
  ▼
Execution Engine:
  ┌─────────────┐
  │ Start Step  │
  └──────┬──────┘
         │
  ┌──────▼──────┐     true    ┌──────────┐
  │ Condition   ├────────────►│ Action   │
  │ (if/else)   │             └──────────┘
  └──────┬──────┘
         │ false
  ┌──────▼──────┐
  │ Delay       │ (wait 30 min)
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │ AI Decision │ (Claude evaluates)
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │ End         │
  └─────────────┘

Execution logged in: workflow_executions + workflow_step_logs
```

---

## 14. SLA/OLA ENGINE

```
Ticket Created/Updated
  │
  ▼
SLA Calculator:
  1. Get SLA by: ticket.sla_id OR category.default_sla_id OR tenant default
  2. Get target minutes by priority
  3. Get calendar (business hours)
  4. Calculate due_date = created_at + target (skipping non-business hours/holidays)
  5. Set ticket.sla_due_date
  │
  ▼
Vercel Cron Job (every minute):
  1. SELECT tickets WHERE sla_due_date IS NOT NULL AND status NOT IN (closed, cancelled)
  2. For each ticket, check SLA levels:
     - Level 1: 30min before breach → notify assigned agent
     - Level 2: 15min before breach → notify supervisor
     - Level 3: At breach → escalate to next group + mark sla_breached = true
     - Level 4: 30min after breach → notify admin
  3. Log all actions
```

---

## 15. NOTIFICACIONES — ARQUITECTURA

```
Event → notification.service.ts:
  1. Find matching notification_templates for event_type
  2. Resolve recipients (requester, assigned agent, group, watchers)
  3. For each recipient + channel:
     a. Render template with variables (Handlebars-like)
     b. INSERT into notification_queue (status = 'pending')
  4. Vercel Cron processes queue:
     - email → Resend API
     - in_app → INSERT into notifications + Supabase Realtime broadcast
     - whatsapp → WhatsApp Cloud API
     - webhook → HTTP POST
```

---

## 16. PERFORMANCE Y OPTIMIZACIÓN DE BD

### 16.1 Reglas de Performance

```
REGLA P1: tenant_id es PRIMERA columna en TODOS los índices compuestos
REGLA P2: Queries NUNCA hacen full table scan — siempre usan índice
REGLA P3: SELECT solo columnas necesarias — NUNCA SELECT *
REGLA P4: Paginación server-side obligatoria (max 50 rows por página)
REGLA P5: Tablas de alto volumen (audit_logs, daily_metrics) particionadas por mes
REGLA P6: Soft deletes con deleted_at — filtrado en RLS y queries
REGLA P7: Métricas pre-calculadas en ticket_metrics y daily_metrics
REGLA P8: Connection pooling via Supabase (PgBouncer) — no custom pools
REGLA P9: Índices parciales WHERE posible (ej: tickets activos solamente)
REGLA P10: JSONB con índices GIN solo cuando se hace query frecuente
```

### 16.2 Índices Críticos

```sql
-- Los índices más importantes para performance:

-- Tickets (tabla más consultada)
idx_tickets_tenant_status          (tenant_id, status)
idx_tickets_tenant_type_status     (tenant_id, type, status)
idx_tickets_tenant_assigned        (tenant_id, assigned_agent_id, status)
idx_tickets_tenant_group           (tenant_id, assigned_group_id, status)
idx_tickets_tenant_sla             (tenant_id, sla_due_date) WHERE active
idx_tickets_tenant_created         (tenant_id, created_at DESC)

-- Inbox (segunda tabla más consultada)
idx_inbox_msg_conversation         (conversation_id, created_at DESC)
idx_inbox_conv_tenant_status       (tenant_id, status, last_message_at DESC)

-- Audit logs (alto volumen)
idx_audit_tenant_resource          (tenant_id, resource_type, resource_id, created_at DESC)

-- Knowledge embeddings (vector search)
idx_embeddings_vector              USING ivfflat (embedding vector_cosine_ops)

-- Notification queue (worker processing)
idx_notif_queue_pending            (status, scheduled_for) WHERE status = 'pending'
```

### 16.3 Query Patterns

```typescript
// ✅ CORRECTO: Paginación server-side con cursor
const { data } = await client
  .from('tickets')
  .select('id, ticket_number, title, status, type, urgency, priority, created_at, assigned_agent:agents(name)')
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1);

// ❌ PROHIBIDO: Fetch all + filter in frontend
const { data } = await client.from('tickets').select('*'); // NUNCA
```

---

## 17. REGLAS DE CÓDIGO — CONVENCIONES OBLIGATORIAS

### 17.1 TypeScript

```
✅ strict: true en tsconfig
✅ Zod para validación en boundaries (API input, form input, env vars)
✅ Database types auto-generados con: supabase gen types typescript
✅ No 'any' — usar 'unknown' y narrowing
✅ No type assertions (as) sin justificación
✅ Enums como const objects o union types, NO TypeScript enums
✅ Interfaces para objects, types para unions
```

### 17.2 Naming Conventions

```
Archivos:         kebab-case          (ticket-list.tsx, sla.service.ts)
Componentes:      PascalCase          (TicketList, SLAIndicator)
Functions:        camelCase           (createTicket, calculateSLA)
Constants:        UPPER_SNAKE_CASE    (MAX_RETRY_COUNT)
Types/Interfaces: PascalCase          (Ticket, CreateTicketInput)
DB Tables:        snake_case plural   (tickets, ticket_followups)
DB Columns:       snake_case          (assigned_agent_id, created_at)
API Routes:       kebab-case          (/api/v1/tickets, /api/v1/kb/articles)
CSS Variables:    kebab-case          (--color-primary, --sidebar-border)
```

### 17.3 File Organization

```
✅ Un componente por archivo
✅ Colocación: tests junto al archivo (.test.ts)
✅ Schemas en lib/schemas/ — compartidos entre server y client
✅ Server Actions en lib/actions/ — 'use server' al inicio
✅ Services en lib/services/ — business logic pura
✅ AI agents en lib/ai/agents/ — configuración de agentes
```

### 17.4 Error Handling

```typescript
// ✅ CORRECTO: Error handling en Server Actions
export async function createTicket(input: CreateTicketInput) {
  try {
    const validated = createTicketSchema.parse(input);
    // ... logic
    return { data: ticket, error: null };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { data: null, error: 'Validation failed: ' + error.message };
    }
    console.error('createTicket error:', error);
    return { data: null, error: 'Failed to create ticket' };
  }
}

// ❌ PROHIBIDO: throw en Server Actions (no serializable)
// ❌ PROHIBIDO: Exponer mensajes de error internos al usuario
```

---

## 18. DESIGN SYSTEM — REGLAS DE UI/UX

### 18.1 Fuente del Template Figma (MANDATORIO)

```
REGLA: El template en Contexto/TemplateFigma/ es la referencia visual OBLIGATORIA.
Toda desviación debe ser justificada y aprobada por @arquitecto.

Layout:
  - Sidebar vertical (64-72px collapsed / 16rem expanded)
  - Top navigation bar con search, notifications, user dropdown
  - Main content area con padding consistente
  - Inspirado en Zendesk Agent Workspace / Freshservice Dew

Componentes (de shadcn/ui — del template):
  - Button, Card, Badge, Table, Tabs, Input, Select, Dialog, Sheet,
    Dropdown, Avatar, Tooltip, Separator, Accordion, Checkbox, Switch,
    Progress, Skeleton, ScrollArea, Command, Popover, Calendar

Componentes ITSM Custom (a crear):
  - AIInsight (ya existe en template como ai-insight.tsx)
  - TicketTimeline
  - InboxView (split panel)
  - SLAIndicator (green/yellow/red badge)
  - KanbanBoard
  - WorkflowEditor (React Flow)
  - MetricsDashboard
  - RuleBuilder
  - FormBuilder
  - OmniSearch

Charts: Recharts (BarChart, LineChart, PieChart) — como en Dashboard.tsx del template
Icons: Lucide React — como en todo el template
```

### 18.2 Theme Tokens (de theme.css del template)

```css
/* Los tokens CSS del template Figma son OBLIGATORIOS */
/* NO cambiar sin aprobación de @arquitecto */

:root {
  --background: #ffffff;
  --foreground: oklch(0.145 0 0);
  --primary: #030213;
  --destructive: #d4183d;
  --muted: #ececf0;
  --muted-foreground: #717182;
  --accent: #e9ebef;
  --border: rgba(0, 0, 0, 0.1);
  --radius: 0.625rem;
  /* ... resto del theme.css */
}

/* Colores semánticos de estado (de los mockups): */
--status-new: #3b82f6        /* blue-500 */
--status-assigned: #8b5cf6   /* violet-500 */
--status-in-progress: #f59e0b /* amber-500 */
--status-pending: #6b7280    /* gray-500 */
--status-testing: #6366f1    /* indigo-500 */
--status-resolved: #10b981   /* emerald-500 */
--status-closed: #22c55e     /* green-500 */
--status-cancelled: #ef4444  /* red-500 */

--priority-critical: #ef4444 /* red-500 */
--priority-high: #f97316     /* orange-500 */
--priority-medium: #eab308   /* yellow-500 */
--priority-low: #22c55e      /* green-500 */
```

### 18.3 Principios UX (del PRD de mockup)

```
1. DENSIDAD: Intermedia (Zendesk-like). NO exceso de whitespace.
2. JERARQUÍA: KPIs arriba → Tabla/Lista centro → Detalles lateral
3. NAVEGACIÓN: Sidebar icónica colapsable + breadcrumbs
4. ACCIONES: Primarias visibles. Secundarias en dropdown.
5. FEEDBACK: Skeleton loaders, toasts (Sonner), optimistic updates
6. ACCESIBILIDAD: Focus rings visibles, ARIA labels, contraste WCAG AA
7. RESPONSIVE: Desktop-first. Mobile funcional pero no prioritario.
8. DARK MODE: Soportado via CSS variables (ya definido en theme.css)
```

---

## 19. INTEGRACIONES — CAPA DE INTEGRACIÓN

### 19.1 Patrón de Integración

```typescript
// Cada integración implementa esta interfaz:
interface ChannelAdapter {
  readonly channelType: string;

  // Recibir mensajes
  handleInboundWebhook(payload: unknown): Promise<NormalizedMessage>;

  // Enviar mensajes
  sendMessage(conversation: Conversation, content: string): Promise<void>;

  // Verificar webhook signature
  verifySignature(request: Request): Promise<boolean>;

  // Sync (para polling-based channels)
  sync?(channelConfig: ChannelConfig): Promise<NormalizedMessage[]>;
}
```

### 19.2 Integraciones Planificadas

| Integración | Prioridad | Phase |
|-------------|-----------|-------|
| Email SMTP/IMAP | P0 | Phase 4 |
| Office 365 (Graph) | P0 | Phase 4 |
| WhatsApp Cloud API | P1 | Phase 4 |
| Web Widget (Realtime) | P1 | Phase 4 |
| GitHub / GitLab | P1 | Phase 3 (para RAG) |
| Slack | P2 | Phase 5 |
| Microsoft Teams | P2 | Phase 5 |
| Zapier / n8n (webhooks) | P2 | Phase 6 |

---

## 20. TESTING — ESTRATEGIA

```
Unit Tests (Vitest):
  - lib/services/*.test.ts (business logic)
  - lib/schemas/*.test.ts (validation)
  - lib/ai/agents/*.test.ts (AI agent logic)

Integration Tests (Vitest + Supabase local):
  - lib/actions/*.test.ts (server actions con DB real)
  - api/v1/*.test.ts (API routes)

E2E Tests (Playwright):
  - Flujo de login
  - CRUD de tickets
  - Workflow de ticket completo
  - Inbox: recibir mensaje → crear ticket
  - Portal: chat con AI → crear ticket

Coverage target: >80% en services y actions
```

---

## 21. CI/CD Y DEPLOY

```
GitHub Actions:
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Push /  │────►│  Lint +  │────►│  Tests   │
  │  PR      │     │  Type    │     │  (Vitest) │
  └──────────┘     │  Check   │     └────┬─────┘
                   └──────────┘          │
                                    ┌────▼─────┐
                                    │  Build   │
                                    │  (turbo) │
                                    └────┬─────┘
                                         │
                              ┌──────────▼──────────┐
                              │  Deploy to Vercel    │
                              │  (preview for PRs,   │
                              │   prod for main)     │
                              └─────────────────────┘

Environments:
  - Development: Local (Supabase local + next dev)
  - Preview: Vercel Preview (per PR) + Supabase Dev project
  - Production: Vercel Production + Supabase Production project
```

---

## 22. CHECKLIST DE VALIDACIÓN ARQUITECTÓNICA

### Para TODA implementación, validar:

```markdown
## Multi-Tenancy
- [ ] Tabla tiene tenant_id NOT NULL
- [ ] ENABLE ROW LEVEL SECURITY
- [ ] FORCE ROW LEVEL SECURITY
- [ ] 4 policies (SELECT, INSERT, UPDATE, DELETE) con get_current_tenant_id()
- [ ] Índice en (tenant_id) como primera columna
- [ ] NUNCA se pasa tenant_id desde frontend

## Seguridad
- [ ] Server Action valida auth antes de operar
- [ ] Zod validation en input
- [ ] No expone errores internos al usuario
- [ ] Audit log para mutaciones
- [ ] File uploads validados (mime, size)

## Frontend
- [ ] Data fetching en Server Component
- [ ] Client Component solo para interactividad
- [ ] Replica layout del template Figma
- [ ] Usa componentes shadcn/ui del template
- [ ] Icons de Lucide React
- [ ] Theme tokens de theme.css

## Performance
- [ ] Query usa índice (tenant_id primero)
- [ ] Paginación server-side (max 50)
- [ ] No SELECT * — solo columnas necesarias
- [ ] Soft delete con deleted_at filtrado en RLS

## RBAC
- [ ] Server Action valida permisos con checkPermission()
- [ ] Scope respetado (own/group/all)
- [ ] Portal users solo acceden a sus propios tickets

## Código
- [ ] TypeScript strict — no 'any'
- [ ] Naming conventions respetadas
- [ ] Error handling con { data, error } pattern
- [ ] No duplicación de código
- [ ] Tests para lógica de negocio
```

---

**Documento vivo. Se actualiza con cada decisión arquitectónica aprobada.**

**Validado por:** @arquitecto
**Fecha:** 2026-03-26
**Autoridad:** Este documento es BLOQUEANTE. Toda implementación que lo viole será rechazada.
