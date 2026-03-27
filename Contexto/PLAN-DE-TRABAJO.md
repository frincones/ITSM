# PLAN DE TRABAJO — NovaDesk ITSM AI-First Platform

> **Proyecto:** NovaDesk ITSM
> **Fecha:** 2026-03-26
> **Documentos base:** `PRD.md`, `ARQUITECTURA.md`, `TemplateFigma/`
> **Duración estimada:** 6 Fases / 24 Semanas
> **Convención de check:** `- [ ]` pendiente → `- [x]` completado

---

## FASE 1 — FOUNDATION (Semanas 1-4)

> Objetivo: Monorepo funcional, auth, multi-tenancy, CRUD tickets, layout principal

---

### 1.1 Setup del Monorepo y Tooling

#### Supabase

- [ ] 1.1.1 Crear proyecto Supabase (DEV)
- [ ] 1.1.2 Crear proyecto Supabase (PROD)
- [ ] 1.1.3 Configurar `supabase/config.toml` con site_url, JWT expiry, MFA
- [ ] 1.1.4 Habilitar extensiones: `pgvector`, `pg_cron`, `unaccent`
- [ ] 1.1.5 Configurar Storage buckets: `ticket-attachments`, `kb-assets`, `avatars`, `tenant-logos`, `inbox-media`
- [ ] 1.1.6 Configurar email templates (confirm, invite, reset, magic-link)

#### Vercel

- [ ] 1.1.7 Crear proyecto Vercel vinculado a GitHub repo
- [ ] 1.1.8 Configurar environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, RESEND_API_KEY)
- [ ] 1.1.9 Configurar Preview Deployments per PR
- [ ] 1.1.10 Configurar dominio custom (novadesk.com o similar)

#### Monorepo

- [ ] 1.1.11 Actualizar `turbo.json` con pipelines: build, dev, lint, test, typecheck
- [ ] 1.1.12 Configurar `pnpm-workspace.yaml` con todos los packages
- [x] 1.1.13 Instalar dependencias core: `@supabase/ssr`, `@supabase/supabase-js`
- [x] 1.1.14 Instalar dependencias UI: `recharts`, `@tanstack/react-table`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`
- [x] 1.1.15 Instalar dependencias AI: `ai`, `@ai-sdk/anthropic`, `openai`
- [x] 1.1.16 Configurar ESLint + Prettier con reglas del proyecto
- [x] 1.1.17 Configurar TypeScript strict en `tsconfig.json`
- [x] 1.1.18 Configurar `.env.local` template con todas las variables necesarias

#### CI/CD

- [ ] 1.1.19 Crear GitHub Action: lint + typecheck + test on PR
- [ ] 1.1.20 Crear GitHub Action: deploy preview on PR
- [ ] 1.1.21 Crear GitHub Action: deploy production on merge to main

---

### 1.2 Database — Schema Core (Supabase Migrations)

#### Migration 00001: Core Tenants

- [x] 1.2.1 Crear función `update_updated_at()` (trigger helper)
- [x] 1.2.2 Crear función `get_current_tenant_id()` (SECURITY DEFINER STABLE)
- [x] 1.2.3 Crear tipo `tenant_plan` ENUM (free, starter, professional, enterprise)
- [x] 1.2.4 Crear tipo `tenant_status` ENUM (active, trial, suspended, cancelled)
- [x] 1.2.5 Crear tabla `tenants` con RLS + FORCE + 4 policies + índices
- [x] 1.2.6 Crear tabla `tenant_settings` con RLS + FORCE + todos los campos de configuración

#### Migration 00002: Auth & Agents

- [x] 1.2.7 Crear tipo `agent_role` ENUM (admin, supervisor, agent, readonly)
- [x] 1.2.8 Crear tabla `agents` con RLS + FORCE + 4 policies + índices
- [x] 1.2.9 Crear tabla `contacts` con RLS + FORCE + 4 policies + índices
- [x] 1.2.10 Crear trigger `set_updated_at` en agents y contacts

#### Migration 00003: RBAC Profiles

- [x] 1.2.11 Crear tipo `permission_scope` ENUM (own, group, all)
- [x] 1.2.12 Crear tabla `profiles` con RLS + FORCE + 4 policies
- [x] 1.2.13 Crear tabla `profile_permissions` con RLS + FORCE
- [x] 1.2.14 Crear tabla `groups` con RLS + FORCE + 4 policies
- [x] 1.2.15 Crear tabla `group_members` con RLS + FORCE
- [x] 1.2.16 Agregar FK `agents.profile_id → profiles.id`
- [ ] 1.2.17 Crear seed data: 7 perfiles default (Admin, Supervisor, Agent L2, Agent L1, Readonly, Partner Agent, Portal User)
- [ ] 1.2.18 Crear seed data: permisos por perfil según ARQUITECTURA.md Sección 10

#### Migration 00004: Tickets

- [x] 1.2.19 Crear tipo `ticket_type` ENUM (incident, request, warranty, support, backlog)
- [x] 1.2.20 Crear tipo `ticket_status` ENUM (new, assigned, in_progress, pending, testing, resolved, closed, cancelled)
- [x] 1.2.21 Crear tipo `severity_level` ENUM (low, medium, high, critical)
- [x] 1.2.22 Crear tipo `ticket_channel` ENUM (portal, email, whatsapp, phone, api, ai_agent, web_widget)
- [x] 1.2.23 Crear tabla `categories` (jerárquica, self-referencing) con RLS
- [x] 1.2.24 Crear tabla `services` con RLS
- [x] 1.2.25 Crear tabla `tickets` (tabla principal) con RLS + FORCE + todos los índices críticos
- [x] 1.2.26 Crear función `generate_ticket_number()` + trigger
- [x] 1.2.27 Crear función `calculate_priority()` + trigger (urgency × impact)
- [x] 1.2.28 Crear tabla `ticket_followups` con RLS
- [x] 1.2.29 Crear tabla `ticket_tasks` con RLS
- [x] 1.2.30 Crear tabla `ticket_solutions` con RLS
- [x] 1.2.31 Crear tabla `ticket_validations` con RLS
- [x] 1.2.32 Crear tabla `ticket_costs` con RLS
- [x] 1.2.33 Crear tabla `ticket_satisfactions` con RLS
- [x] 1.2.34 Crear tabla `ticket_attachments` con RLS
- [x] 1.2.35 Crear tabla `ticket_relations` con RLS
- [x] 1.2.36 Crear tabla `ticket_templates` con RLS
- [x] 1.2.37 Crear tabla `ticket_recurrents` con RLS
- [ ] 1.2.38 Generar tipos TypeScript con `supabase gen types typescript`

---

### 1.3 Backend — Auth y Middleware

- [ ] 1.3.1 Extender middleware existente con tenant resolution (subdomain → tenant slug)
- [ ] 1.3.2 Agregar Request ID generation al middleware
- [x] 1.3.3 Crear `lib/services/rbac.service.ts` — función `checkPermission(agentId, resource, action, scope)`
- [x] 1.3.4 Crear `lib/services/tenant.service.ts` — función `getCurrentTenant()`
- [ ] 1.3.5 Crear `lib/actions/auth.ts` — Server Actions para login/logout/signup
- [ ] 1.3.6 Configurar OAuth providers (Google, Microsoft) en Supabase Auth
- [ ] 1.3.7 Crear endpoint `api/auth/callback/route.ts` para OAuth callback
- [ ] 1.3.8 Implementar MFA flow (TOTP) para plan enterprise

---

### 1.4 Backend — Zod Schemas

- [x] 1.4.1 Crear `lib/schemas/common.schema.ts` (uuid, pagination, date ranges)
- [x] 1.4.2 Crear `lib/schemas/ticket.schema.ts` (createTicket, updateTicket, filterTickets)
- [x] 1.4.3 Crear `lib/schemas/auth.schema.ts` (login, signup, resetPassword)
- [x] 1.4.4 Crear `lib/schemas/agent.schema.ts` (createAgent, updateAgent)
- [x] 1.4.5 Crear `lib/schemas/category.schema.ts` (createCategory, updateCategory)

---

### 1.5 Backend — Server Actions (Tickets)

- [x] 1.5.1 Crear `lib/actions/tickets.ts` — `createTicket()`
- [x] 1.5.2 Crear `lib/actions/tickets.ts` — `updateTicket()`
- [x] 1.5.3 Crear `lib/actions/tickets.ts` — `assignTicket()`
- [x] 1.5.4 Crear `lib/actions/tickets.ts` — `changeTicketStatus()`
- [x] 1.5.5 Crear `lib/actions/tickets.ts` — `addFollowup()`
- [x] 1.5.6 Crear `lib/actions/tickets.ts` — `addTask()`
- [x] 1.5.7 Crear `lib/actions/tickets.ts` — `addSolution()`
- [x] 1.5.8 Crear `lib/actions/tickets.ts` — `deleteTicket()` (soft delete)
- [x] 1.5.9 Crear `lib/actions/admin.ts` — `createCategory()`, `updateCategory()`
- [x] 1.5.10 Crear `lib/actions/admin.ts` — `createAgent()`, `updateAgent()`, `deactivateAgent()`

---

### 1.6 Frontend — Design System Setup

- [x] 1.6.1 Copiar `theme.css` del template Figma a `apps/web/styles/theme.css`
- [x] 1.6.2 Agregar CSS variables de status y priority (colores semánticos)
- [x] 1.6.3 Migrar componentes shadcn/ui del template a `packages/ui/src/shadcn/`
- [x] 1.6.4 Crear componente `AIInsight` en `packages/ui/src/itsm/ai-insight.tsx`
- [x] 1.6.5 Crear componente `SLAIndicator` en `packages/ui/src/itsm/sla-indicator.tsx`
- [x] 1.6.6 Crear componente `StatusBadge` (ticket status colors)
- [x] 1.6.7 Crear componente `PriorityBadge` (priority colors)
- [x] 1.6.8 Crear componente `ChannelIcon` (email, whatsapp, phone, web icons)
- [x] 1.6.9 Configurar Sonner (toasts) en root layout
- [x] 1.6.10 Configurar TanStack Query provider en root layout

---

### 1.7 Frontend — Auth Pages

- [x] 1.7.1 Implementar `app/auth/layout.tsx` (auth layout)
- [x] 1.7.2 Implementar `app/auth/sign-in/page.tsx` — replicar Login.tsx del template (split layout, gradient left, form right, OAuth buttons)
- [x] 1.7.3 Implementar `app/auth/sign-up/page.tsx` — registro con invitación
- [x] 1.7.4 Implementar `app/auth/verify/page.tsx` — verificación de email
- [x] 1.7.5 Implementar `app/auth/password-reset/page.tsx` — reset de password

---

### 1.8 Frontend — Layout Principal

- [x] 1.8.1 Implementar `app/home/layout.tsx` — replicar Layout.tsx del template (sidebar vertical 16rem + topbar + content area)
- [x] 1.8.2 Implementar sidebar con 12 nav items (Dashboard, Inbox, Tickets, Problems, Changes, Projects, Assets, Knowledge, Catalog, Automations, Reports, Settings)
- [x] 1.8.3 Implementar topbar con search input, notification bell, user avatar dropdown
- [x] 1.8.4 Implementar sidebar responsive (collapsar a iconos en tablet, ocultar en mobile)
- [x] 1.8.5 Implementar dark mode toggle en topbar
- [x] 1.8.6 Implementar active state en nav items

---

### 1.9 Frontend — Dashboard

- [x] 1.9.1 Implementar `app/home/page.tsx` — Server Component con data fetching
- [x] 1.9.2 Implementar 4 KPI cards (Open Tickets, Overdue, Resolved Today, Avg Resolution Time)
- [x] 1.9.3 Implementar AI Insights section con AIInsight component
- [x] 1.9.4 Implementar Ticket Trends chart (BarChart con Recharts — weekly data)
- [x] 1.9.5 Implementar SLA Health status section
- [x] 1.9.6 Implementar Priority Tickets list
- [x] 1.9.7 Implementar Recent Activity timeline

---

### 1.10 Frontend — Ticket List

- [x] 1.10.1 Implementar `app/home/tickets/page.tsx` — Server Component con paginación
- [x] 1.10.2 Implementar `components/tickets/ticket-list-client.tsx` — Client Component con TanStack Table
- [x] 1.10.3 Implementar tabs de filtro (All, Assigned to Me, Unassigned, Overdue, Critical)
- [x] 1.10.4 Implementar search input y advanced filters
- [x] 1.10.5 Implementar bulk actions (Assign, Change Status)
- [x] 1.10.6 Implementar DataTable con columnas: ticket_number, title, type, status, priority, requester, assigned, SLA, created_at
- [x] 1.10.7 Implementar StatusBadge y PriorityBadge en tabla
- [x] 1.10.8 Implementar SLAIndicator en tabla
- [x] 1.10.9 Implementar paginación server-side (max 50)

---

### 1.11 Frontend — Ticket Detail

- [x] 1.11.1 Implementar `app/home/tickets/[id]/page.tsx` — Server Component con data fetching
- [x] 1.11.2 Implementar layout 3 columnas: AI panel (left) + Timeline (center) + Info (right)
- [x] 1.11.3 Implementar ticket header con número, título, status badge, priority badge
- [x] 1.11.4 Implementar timeline con followups, tasks, solutions, status changes (cronológico)
- [x] 1.11.5 Implementar reply composer con tabs (Public Reply / Internal Note)
- [ ] 1.11.6 Implementar rich text editor (Tiptap) en composer
- [x] 1.11.7 Implementar file upload en composer (Supabase Storage)
- [x] 1.11.8 Implementar panel derecho: requester info, SLA status, tags, assigned agent/group
- [x] 1.11.9 Implementar AI Assistant panel (left) con clasificación, sugerencias, tickets similares
- [x] 1.11.10 Implementar acciones: Assign, Change Status, Add Task, Close

---

### 1.12 Frontend — Crear Ticket

- [x] 1.12.1 Implementar `app/home/tickets/new/page.tsx`
- [x] 1.12.2 Implementar formulario con React Hook Form + Zod (title, description, type, urgency, impact, category, requester)
- [x] 1.12.3 Implementar file upload para attachments
- [x] 1.12.4 Implementar dropdown de categorías (jerárquico)
- [x] 1.12.5 Implementar dropdown de requester (búsqueda en contacts)
- [x] 1.12.6 Implementar submit con Server Action + toast de confirmación

---

### 1.13 Testing — Fase 1

- [ ] 1.13.1 Tests unitarios para Zod schemas (ticket, auth, common)
- [ ] 1.13.2 Tests unitarios para rbac.service.ts (checkPermission)
- [ ] 1.13.3 Tests unitarios para calculate_priority trigger
- [ ] 1.13.4 Tests unitarios para generate_ticket_number trigger
- [ ] 1.13.5 Test E2E: Login flow completo
- [ ] 1.13.6 Test E2E: Crear ticket → ver en lista → ver detalle
- [ ] 1.13.7 Test E2E: Agregar followup a ticket
- [ ] 1.13.8 Verificar RLS: usuario de Tenant A no ve datos de Tenant B

---

## FASE 2 — ITSM CORE (Semanas 5-8)

> Objetivo: Workflow completo de tickets, Problems, Changes, SLA/OLA, Rules, KB

---

### 2.1 Database — Problems, Changes, SLA

#### Migration 00005: Problems & Changes

- [x] 2.1.1 Crear tipo `problem_status` ENUM
- [x] 2.1.2 Crear tabla `problems` con RLS + FORCE + índices
- [x] 2.1.3 Crear tabla `problem_ticket_links` con RLS
- [x] 2.1.4 Crear tabla `problem_tasks` con RLS
- [x] 2.1.5 Crear tipo `change_status` ENUM
- [x] 2.1.6 Crear tipo `change_type` ENUM (standard, normal, emergency)
- [x] 2.1.7 Crear tabla `changes` con RLS + FORCE + índices
- [x] 2.1.8 Crear tabla `change_tasks` con RLS
- [x] 2.1.9 Crear tabla `change_validations` (CAB approval) con RLS
- [x] 2.1.10 Crear tabla `change_costs` con RLS
- [x] 2.1.11 Crear funciones de generación de números (problem_number, change_number)

#### Migration 00006: SLA/OLA

- [x] 2.1.12 Crear tabla `calendars` con RLS
- [x] 2.1.13 Crear tabla `calendar_schedules` con RLS
- [x] 2.1.14 Crear tabla `calendar_holidays` con RLS
- [x] 2.1.15 Crear tabla `slas` con RLS
- [x] 2.1.16 Crear tabla `sla_levels` con RLS
- [x] 2.1.17 Crear tabla `sla_level_actions` con RLS
- [x] 2.1.18 Crear tabla `olas` con RLS
- [x] 2.1.19 Crear tabla `ola_levels` + `ola_level_actions` con RLS
- [x] 2.1.20 Agregar FKs pendientes: tickets.sla_id, tickets.ola_id, groups.sla_id, groups.calendar_id, categories.default_sla_id

#### Migration 00008: Knowledge Base

- [x] 2.1.21 Crear tabla `kb_categories` (jerárquica) con RLS
- [x] 2.1.22 Crear tabla `kb_articles` con RLS + soft delete
- [x] 2.1.23 Crear tabla `kb_article_revisions` con RLS
- [x] 2.1.24 Crear tabla `kb_article_feedback` con RLS

#### Migration 00011: Rules Engine

- [x] 2.1.25 Crear tabla `rules` con RLS
- [x] 2.1.26 Crear tabla `rule_conditions` con RLS
- [x] 2.1.27 Crear tabla `rule_actions` con RLS
- [x] 2.1.28 Crear tabla `rule_execution_logs` con RLS

---

### 2.2 Backend — SLA/OLA Engine

- [x] 2.2.1 Crear `lib/services/sla.service.ts` — `calculateSLADueDate(ticket, sla, calendar)`
- [x] 2.2.2 Implementar cálculo de business hours (excluir noches, fines de semana, holidays)
- [ ] 2.2.3 Crear `api/cron/sla-check/route.ts` — Vercel Cron cada minuto
- [ ] 2.2.4 Implementar lógica de SLA levels: warning → breach → post-breach
- [ ] 2.2.5 Implementar acciones de SLA: notify, reassign, escalate, change priority
- [ ] 2.2.6 Crear trigger: al crear/actualizar ticket, calcular sla_due_date
- [ ] 2.2.7 Crear trigger: marcar sla_breached = true cuando se pasa la fecha

---

### 2.3 Backend — Ticket Workflow Completo

- [ ] 2.3.1 Implementar validación de transiciones de estado (state machine)
- [ ] 2.3.2 Implementar auto-assignment (round_robin, least_busy)
- [ ] 2.3.3 Implementar ticket validation workflow (approval steps)
- [ ] 2.3.4 Implementar ticket satisfaction survey (auto-send after close)
- [ ] 2.3.5 Implementar ticket cost tracking
- [ ] 2.3.6 Implementar ticket templates (apply predefined fields)
- [ ] 2.3.7 Implementar ticket recurrents (cron job para generar tickets programados)
- [ ] 2.3.8 Implementar ticket relations (duplicate, related, parent-child)

---

### 2.4 Backend — Problem Management

- [ ] 2.4.1 Crear `lib/schemas/problem.schema.ts`
- [ ] 2.4.2 Crear `lib/actions/problems.ts` — CRUD + link tickets
- [ ] 2.4.3 Implementar problem workflow (new → analysis → root_cause → resolved)
- [ ] 2.4.4 Implementar link between problems and tickets

---

### 2.5 Backend — Change Management

- [ ] 2.5.1 Crear `lib/schemas/change.schema.ts`
- [ ] 2.5.2 Crear `lib/actions/changes.ts` — CRUD + approval workflow
- [ ] 2.5.3 Implementar CAB approval workflow (N aprobadores configurables)
- [ ] 2.5.4 Implementar change types: standard (auto-approve), normal (CAB), emergency (fast-track)
- [ ] 2.5.5 Implementar rollback plan tracking

---

### 2.6 Backend — Rules Engine

- [ ] 2.6.1 Crear `lib/services/rules.service.ts` — `evaluateRules(trigger, context)`
- [ ] 2.6.2 Implementar condition evaluation (field operators: equals, contains, in, regex, etc.)
- [ ] 2.6.3 Implementar action execution (set_field, assign, notify, set_sla, tag, webhook)
- [ ] 2.6.4 Implementar rule priority ordering y stop_on_match
- [ ] 2.6.5 Integrar rules engine en ticket creation/update pipeline
- [ ] 2.6.6 Crear rule execution logging

---

### 2.7 Backend — Knowledge Base

- [ ] 2.7.1 Crear `lib/schemas/kb.schema.ts`
- [ ] 2.7.2 Crear `lib/actions/kb.ts` — CRUD artículos + categorías
- [ ] 2.7.3 Implementar article versioning (revisions)
- [ ] 2.7.4 Implementar article feedback (helpful/not helpful)
- [ ] 2.7.5 Implementar article search (full-text PostgreSQL)

---

### 2.8 Frontend — Problems Page

- [ ] 2.8.1 Implementar `app/home/problems/page.tsx` — replicar Problems.tsx del template
- [ ] 2.8.2 Implementar 4 stat cards (Active, Known Errors, Resolved, Related Incidents)
- [ ] 2.8.3 Implementar DataTable con status, priority, impact, related incidents
- [ ] 2.8.4 Implementar `app/home/problems/[id]/page.tsx` — detalle con timeline, linked tickets

---

### 2.9 Frontend — Changes Page

- [ ] 2.9.1 Implementar `app/home/changes/page.tsx` — replicar Changes.tsx del template
- [ ] 2.9.2 Implementar 4 stat cards (Pending Approval, Scheduled, Implementing, Completed)
- [ ] 2.9.3 Implementar DataTable con status workflow, risk assessment
- [ ] 2.9.4 Implementar `app/home/changes/[id]/page.tsx` — detalle con approval workflow, implementation plan

---

### 2.10 Frontend — Knowledge Base

- [ ] 2.10.1 Implementar `app/home/kb/page.tsx` — replicar KnowledgeBase.tsx del template
- [ ] 2.10.2 Implementar category sidebar filter
- [ ] 2.10.3 Implementar article grid con view counts, helpfulness votes
- [ ] 2.10.4 Implementar `app/home/kb/articles/new/page.tsx` — editor con Tiptap
- [ ] 2.10.5 Implementar `app/home/kb/articles/[id]/page.tsx` — edición y vista previa

---

### 2.11 Frontend — Settings (Admin)

- [ ] 2.11.1 Implementar `app/home/settings/page.tsx` — replicar Settings.tsx del template (left sidebar + form panels)
- [ ] 2.11.2 Implementar Settings > General (company, timezone, language, ticket prefix)
- [ ] 2.11.3 Implementar Settings > Agents (CRUD agentes, asignar perfil)
- [ ] 2.11.4 Implementar Settings > Groups (CRUD grupos, asignar miembros)
- [ ] 2.11.5 Implementar Settings > Profiles (CRUD perfiles, asignar permisos por resource/action/scope)
- [ ] 2.11.6 Implementar Settings > Categories (CRUD categorías jerárquicas)
- [ ] 2.11.7 Implementar Settings > SLA/OLA (CRUD SLAs con tiempos por prioridad, levels, calendarios)
- [ ] 2.11.8 Implementar Settings > Rules (rule builder visual: conditions + actions)
- [ ] 2.11.9 Implementar Settings > Calendars (horarios laborales, holidays)

---

### 2.12 Testing — Fase 2

- [ ] 2.12.1 Tests unitarios para SLA calculator (business hours, holidays)
- [ ] 2.12.2 Tests unitarios para rules engine (condition evaluation, action execution)
- [ ] 2.12.3 Tests unitarios para ticket state machine (valid/invalid transitions)
- [ ] 2.12.4 Test E2E: Workflow completo ticket → assign → resolve → close → satisfaction
- [ ] 2.12.5 Test E2E: Problem management → link tickets
- [ ] 2.12.6 Test E2E: Change management → CAB approval flow
- [ ] 2.12.7 Test E2E: KB article CRUD + search

---

## FASE 3 — AI LAYER (Semanas 9-12)

> Objetivo: AI Triage, RAG pipeline, Knowledge Agent, Classification, Suggestions

---

### 3.1 Database — AI & RAG

#### Migration 00009: AI Agents & RAG

- [ ] 3.1.1 Habilitar extensión `pgvector` en Supabase
- [ ] 3.1.2 Crear tabla `ai_agents` (configuración por tenant) con RLS
- [ ] 3.1.3 Crear tabla `knowledge_documents` con RLS
- [ ] 3.1.4 Crear tabla `knowledge_embeddings` (vector(1536)) con RLS
- [ ] 3.1.5 Crear índice vectorial `ivfflat` en embeddings
- [ ] 3.1.6 Crear función `match_knowledge()` para búsqueda semántica
- [ ] 3.1.7 Seed data: agentes AI default por tenant (triage, support, resolution, routing)

---

### 3.2 Backend — RAG Pipeline

- [ ] 3.2.1 Crear `lib/ai/rag/embeddings.ts` — generar embeddings con OpenAI text-embedding-3-small
- [ ] 3.2.2 Crear `lib/ai/rag/chunker.ts` — dividir documentos en chunks de 500 tokens
- [ ] 3.2.3 Crear `lib/ai/rag/indexer.ts` — indexar documentos (KB articles, tickets resueltos, docs externos)
- [ ] 3.2.4 Crear `lib/ai/rag/search.ts` — búsqueda semántica con `match_knowledge()`
- [ ] 3.2.5 Crear `api/cron/knowledge-sync/route.ts` — sincronización periódica de KB a embeddings
- [ ] 3.2.6 Implementar auto-indexing: cuando se crea/actualiza un KB article → generar embeddings

---

### 3.3 Backend — AI Agents

- [ ] 3.3.1 Crear `lib/ai/agents/triage.ts` — Triage Agent (clasificar tipo, urgencia, categoría)
- [ ] 3.3.2 Crear `lib/ai/agents/support.ts` — Support Agent (asistir usuario final en portal)
- [ ] 3.3.3 Crear `lib/ai/agents/resolution.ts` — Resolution Agent (sugerir soluciones al técnico)
- [ ] 3.3.4 Crear `lib/ai/agents/routing.ts` — Routing Agent (asignar agente/grupo óptimo)
- [ ] 3.3.5 Crear `lib/ai/agents/knowledge.ts` — Knowledge Agent (RAG search + answer)
- [ ] 3.3.6 Crear `lib/ai/agents/inbox.ts` — Inbox Agent (procesar mensajes entrantes)
- [ ] 3.3.7 Crear `lib/ai/tools/` — Tool definitions para AI agents (searchKB, classifyTicket, createTicket, suggestSolution, getTicketHistory)

---

### 3.4 Backend — AI API Endpoints

- [ ] 3.4.1 Crear `api/ai/chat/route.ts` — Streaming chat con Claude (Vercel AI SDK)
- [ ] 3.4.2 Crear `api/ai/classify/route.ts` — Tipificación de ticket (warranty/support/backlog/incident/request)
- [ ] 3.4.3 Crear `api/ai/suggest/route.ts` — Sugerencias de solución basadas en RAG
- [ ] 3.4.4 Crear `api/ai/summarize/route.ts` — Resumen de ticket para handoff
- [ ] 3.4.5 Crear `api/ai/analyze-document/route.ts` — Análisis de documentos/transcripciones/HUs adjuntos

---

### 3.5 Backend — AI Integration en Ticket Pipeline

- [ ] 3.5.1 Integrar Triage Agent en pipeline de creación de ticket (auto-classify al crear)
- [ ] 3.5.2 Integrar Routing Agent en pipeline de asignación (smart routing post-triage)
- [ ] 3.5.3 Integrar Resolution Agent en ticket detail (sugerencias al abrir ticket)
- [ ] 3.5.4 Implementar confidence threshold (si AI < 80% confianza, no auto-clasificar)
- [ ] 3.5.5 Implementar AI usage tracking (count queries por tenant para límites del plan)
- [ ] 3.5.6 Implementar duplicate detection con embeddings (antes de crear ticket)

---

### 3.6 Frontend — AI Components

- [ ] 3.6.1 Crear `packages/ui/src/itsm/ai-chat.tsx` — Widget de chat AI con streaming
- [ ] 3.6.2 Implementar AI chat en ticket detail (panel izquierdo)
- [ ] 3.6.3 Implementar AI classification badges en ticket list/detail
- [ ] 3.6.4 Implementar AI suggested solutions en ticket detail
- [ ] 3.6.5 Implementar AI auto-summary en ticket header
- [ ] 3.6.6 Implementar AI similar tickets panel en ticket detail
- [ ] 3.6.7 Implementar AI confidence score display

---

### 3.7 Frontend — Settings > AI Configuration

- [ ] 3.7.1 Implementar `app/home/settings/ai/page.tsx`
- [ ] 3.7.2 Implementar configuración de agentes AI por tenant (enable/disable, model, temperature)
- [ ] 3.7.3 Implementar configuración de knowledge sources (repos, docs, URLs)
- [ ] 3.7.4 Implementar AI usage metrics (queries used / limit)

---

### 3.8 Testing — Fase 3

- [ ] 3.8.1 Tests unitarios para chunker (correct chunk sizes)
- [ ] 3.8.2 Tests unitarios para embeddings generation
- [ ] 3.8.3 Tests de integración para RAG pipeline (index → search → retrieve)
- [ ] 3.8.4 Tests de integración para Triage Agent (classification accuracy)
- [ ] 3.8.5 Test E2E: Crear ticket → AI auto-classifica → asigna → sugiere solución

---

## FASE 4 — OMNICHANNEL INBOX (Semanas 13-16)

> Objetivo: Inbox unificado con Email, Office 365, WhatsApp, Web Widget

---

### 4.1 Database — Inbox

#### Migration 00007: Inbox

- [ ] 4.1.1 Crear tabla `inbox_channels` con RLS
- [ ] 4.1.2 Crear tabla `inbox_conversations` con RLS + índices
- [ ] 4.1.3 Crear tabla `inbox_messages` con RLS + índices
- [ ] 4.1.4 Agregar FK: tickets.inbox_message_id → inbox_messages.id

---

### 4.2 Backend — Inbox Core

- [ ] 4.2.1 Crear `lib/services/inbox.service.ts` — NormalizedMessage interface
- [ ] 4.2.2 Crear `lib/services/inbox.service.ts` — createConversation, addMessage, linkToTicket
- [ ] 4.2.3 Crear `lib/actions/inbox.ts` — Server Actions para reply, resolve, assign
- [ ] 4.2.4 Crear ChannelAdapter interface

---

### 4.3 Backend — Email Channel

- [ ] 4.3.1 Crear `lib/integrations/email/imap-adapter.ts` — IMAP polling
- [ ] 4.3.2 Crear `lib/integrations/email/smtp-adapter.ts` — SMTP send
- [ ] 4.3.3 Crear `api/cron/inbox-sync/route.ts` — Vercel Cron para polling IMAP
- [ ] 4.3.4 Implementar email parsing (subject, body, attachments, from, to)
- [ ] 4.3.5 Implementar contact matching (email → contact)

---

### 4.4 Backend — Office 365 Channel

- [ ] 4.4.1 Crear `lib/integrations/office365/graph-adapter.ts` — Microsoft Graph API
- [ ] 4.4.2 Implementar OAuth2 flow para Office 365
- [ ] 4.4.3 Implementar webhook subscription para nuevos emails
- [ ] 4.4.4 Implementar send via Graph API

---

### 4.5 Backend — WhatsApp Channel

- [ ] 4.5.1 Crear `lib/integrations/whatsapp/whatsapp-adapter.ts` — WhatsApp Cloud API
- [ ] 4.5.2 Crear `api/v1/inbox/webhooks/whatsapp/route.ts` — webhook receiver
- [ ] 4.5.3 Implementar webhook signature verification
- [ ] 4.5.4 Implementar message parsing (text, image, document, location)
- [ ] 4.5.5 Implementar send message via Cloud API

---

### 4.6 Backend — Web Widget Channel

- [ ] 4.6.1 Crear `lib/integrations/widget/widget-adapter.ts` — Supabase Realtime
- [ ] 4.6.2 Implementar embeddable widget script (`<script src="novadesk-widget.js">`)
- [ ] 4.6.3 Implementar Realtime channel per conversation (Supabase broadcast)

---

### 4.7 Backend — Inbox AI Processing

- [ ] 4.7.1 Integrar Inbox Agent en message pipeline (auto-classify, auto-respond)
- [ ] 4.7.2 Implementar auto ticket creation from inbox messages
- [ ] 4.7.3 Implementar contact auto-detection/creation
- [ ] 4.7.4 Implementar sentiment analysis en mensajes entrantes

---

### 4.8 Frontend — Inbox Page

- [ ] 4.8.1 Implementar `app/home/inbox/page.tsx` — replicar Inbox.tsx del template
- [ ] 4.8.2 Implementar `packages/ui/src/itsm/inbox-view.tsx` — split view (conversation list + message detail)
- [ ] 4.8.3 Implementar conversation list con search, filters, channel icons
- [ ] 4.8.4 Implementar message thread view con timeline
- [ ] 4.8.5 Implementar reply composer (text + attachments)
- [ ] 4.8.6 Implementar actions: Create Ticket, Assign, Resolve, Snooze
- [ ] 4.8.7 Implementar AI classification badges en conversaciones
- [ ] 4.8.8 Implementar Supabase Realtime para nuevos mensajes (push)

---

### 4.9 Frontend — Settings > Channels

- [ ] 4.9.1 Implementar `app/home/settings/channels/page.tsx`
- [ ] 4.9.2 Implementar configuración de canal Email (IMAP/SMTP credentials)
- [ ] 4.9.3 Implementar configuración de canal Office 365 (OAuth connect)
- [ ] 4.9.4 Implementar configuración de canal WhatsApp (API key, phone number)
- [ ] 4.9.5 Implementar configuración de Web Widget (embed code, customization)

---

### 4.10 Testing — Fase 4

- [ ] 4.10.1 Tests unitarios para email parser
- [ ] 4.10.2 Tests unitarios para WhatsApp webhook verification
- [ ] 4.10.3 Tests de integración para inbox pipeline (message → conversation → ticket)
- [ ] 4.10.4 Test E2E: Recibir email → crea conversación → crea ticket automáticamente

---

## FASE 5 — PORTAL, WORKFLOWS & AUTOMATION (Semanas 17-20)

> Objetivo: Portal del cliente, AI Assistant, Service Catalog, Workflow Engine

---

### 5.1 Database — Workflows & Forms

#### Migration 00010: Workflows

- [ ] 5.1.1 Crear tabla `workflows` con RLS
- [ ] 5.1.2 Crear tabla `workflow_steps` con RLS
- [ ] 5.1.3 Crear tabla `workflow_executions` con RLS
- [ ] 5.1.4 Crear tabla `workflow_step_logs` con RLS

#### Service Catalog (parte de migration 00004 o nueva)

- [ ] 5.1.5 Crear tabla `service_catalogs` con RLS
- [ ] 5.1.6 Crear tabla `forms` con RLS
- [ ] 5.1.7 Crear tabla `form_sections` con RLS
- [ ] 5.1.8 Crear tabla `form_questions` con RLS
- [ ] 5.1.9 Crear tabla `form_submissions` con RLS
- [ ] 5.1.10 Crear tabla `form_destinations` con RLS

---

### 5.2 Backend — Workflow Engine

- [ ] 5.2.1 Crear `lib/services/workflow.service.ts` — WorkflowEngine class
- [ ] 5.2.2 Implementar trigger matching (find active workflows for event)
- [ ] 5.2.3 Implementar step execution: condition (if/else)
- [ ] 5.2.4 Implementar step execution: action (set_field, assign, notify, webhook)
- [ ] 5.2.5 Implementar step execution: delay (wait N minutes/hours)
- [ ] 5.2.6 Implementar step execution: ai_decision (Claude evaluates condition)
- [ ] 5.2.7 Implementar step execution: human_approval (pause until approved)
- [ ] 5.2.8 Implementar step execution: webhook (HTTP POST)
- [ ] 5.2.9 Implementar execution logging (step by step)
- [ ] 5.2.10 Crear `api/cron/workflow-processor/route.ts` — procesar delayed steps

---

### 5.3 Backend — Portal & Service Catalog

- [ ] 5.3.1 Crear `lib/actions/portal.ts` — Server Actions para portal del cliente
- [ ] 5.3.2 Implementar portal auth (contact login via magic link)
- [ ] 5.3.3 Implementar service catalog CRUD
- [ ] 5.3.4 Implementar form builder (dynamic forms → ticket creation)
- [ ] 5.3.5 Implementar form submission → ticket creation via form_destinations

---

### 5.4 Frontend — Portal del Cliente

- [ ] 5.4.1 Implementar `app/portal/layout.tsx` — branding del tenant (logo, colors from tenants.brand_colors)
- [ ] 5.4.2 Implementar `app/portal/page.tsx` — replicar ServicePortal.tsx del template (hero search, categories, popular articles)
- [ ] 5.4.3 Implementar `app/portal/tickets/page.tsx` — mis tickets (solo los del contact)
- [ ] 5.4.4 Implementar `app/portal/tickets/[id]/page.tsx` — detalle de mi ticket
- [ ] 5.4.5 Implementar `app/portal/tickets/new/page.tsx` — crear solicitud (con AI assistant)
- [ ] 5.4.6 Implementar `app/portal/kb/page.tsx` — knowledge base pública
- [ ] 5.4.7 Implementar `app/portal/chat/page.tsx` — AI Assistant chat

---

### 5.5 Frontend — Service Catalog

- [ ] 5.5.1 Implementar `app/home/service-catalog/page.tsx` — replicar ServiceCatalog.tsx del template
- [ ] 5.5.2 Implementar service cards con icons, approval requirements, delivery times
- [ ] 5.5.3 Implementar request flow → dynamic form → submit

---

### 5.6 Frontend — Workflow Builder

- [ ] 5.6.1 Implementar `app/home/workflows/page.tsx` — lista de workflows
- [ ] 5.6.2 Implementar `app/home/workflows/[id]/page.tsx` — replicar WorkflowBuilder.tsx del template
- [ ] 5.6.3 Implementar `packages/ui/src/itsm/workflow-editor.tsx` usando React Flow
- [ ] 5.6.4 Implementar left sidebar: trigger/condition/action building blocks
- [ ] 5.6.5 Implementar center canvas: drag-and-drop nodes with connectors
- [ ] 5.6.6 Implementar right panel: step properties editor
- [ ] 5.6.7 Implementar bottom panel: execution logs

---

### 5.7 Frontend — Automations Hub

- [ ] 5.7.1 Implementar `app/home/automations/page.tsx` — replicar Automations.tsx del template
- [ ] 5.7.2 Implementar 4 stat cards (Active Workflows, Executions Today, Success Rate, Avg Duration)
- [ ] 5.7.3 Implementar tabs: Workflows, Business Rules, Scheduled Tasks
- [ ] 5.7.4 Implementar workflow cards con execution metrics

---

### 5.8 Frontend — Settings > Portal

- [ ] 5.8.1 Implementar `app/home/settings/portal/page.tsx`
- [ ] 5.8.2 Implementar branding config (logo, colors, domain)
- [ ] 5.8.3 Implementar portal feature toggles (AI enabled, KB enabled)

---

### 5.9 Testing — Fase 5

- [ ] 5.9.1 Tests unitarios para workflow engine (condition evaluation, action execution)
- [ ] 5.9.2 Tests de integración para workflow execution pipeline
- [ ] 5.9.3 Test E2E: Portal → AI chat → crear ticket
- [ ] 5.9.4 Test E2E: Workflow builder → crear workflow → trigger ejecuta
- [ ] 5.9.5 Test E2E: Service catalog → submit form → ticket creado

---

## FASE 6 — ANALYTICS, NOTIFICATIONS & POLISH (Semanas 21-24)

> Objetivo: Dashboards de métricas, notificaciones multi-canal, webhooks, API REST, partners, assets, projects

---

### 6.1 Database — Restantes

#### Migration 00012: Notifications

- [ ] 6.1.1 Crear tabla `notification_templates` con RLS
- [ ] 6.1.2 Crear tabla `notification_queue` con RLS
- [ ] 6.1.3 Crear tabla `notifications` (in-app) con RLS

#### Migration 00013: Reports & Metrics

- [ ] 6.1.4 Crear tabla `ticket_metrics` con RLS (pre-calculated per ticket)
- [ ] 6.1.5 Crear tabla `daily_metrics` con RLS (partitioned by month)
- [ ] 6.1.6 Crear `api/cron/metrics-snapshot/route.ts` — snapshot diario

#### Migration 00014: Audit Logs

- [ ] 6.1.7 Crear tabla `audit_logs` (partitioned by month) con RLS
- [ ] 6.1.8 Crear trigger para auto-log mutaciones en tablas principales

#### Migration 00015: Projects

- [ ] 6.1.9 Crear tabla `projects` con RLS
- [ ] 6.1.10 Crear tabla `project_tasks` con RLS
- [ ] 6.1.11 Crear tabla `project_members` con RLS

#### Migration 00016: Assets

- [ ] 6.1.12 Crear tabla `asset_types` con RLS
- [ ] 6.1.13 Crear tabla `assets` con RLS
- [ ] 6.1.14 Crear tabla `asset_assignments` con RLS

#### Migration 00017: Partners

- [ ] 6.1.15 Crear tabla `partners` con RLS
- [ ] 6.1.16 Crear tabla `partner_agents` con RLS
- [ ] 6.1.17 Crear tabla `ticket_partner_assignments` con RLS

#### Migration 00018: Webhooks

- [ ] 6.1.18 Crear tabla `webhooks` con RLS
- [ ] 6.1.19 Crear tabla `webhook_logs` con RLS

---

### 6.2 Backend — Notification Engine

- [ ] 6.2.1 Crear `lib/services/notification.service.ts` — NotificationEngine
- [ ] 6.2.2 Implementar template rendering con variables ({{ticket.number}}, {{ticket.title}})
- [ ] 6.2.3 Implementar recipient resolution (requester, assigned agent, group, watchers)
- [ ] 6.2.4 Implementar notification queue processing
- [ ] 6.2.5 Implementar canal email: Resend API
- [ ] 6.2.6 Implementar canal in-app: INSERT en notifications + Supabase Realtime broadcast
- [ ] 6.2.7 Implementar canal WhatsApp: Cloud API send
- [ ] 6.2.8 Implementar canal webhook: HTTP POST
- [ ] 6.2.9 Crear `api/cron/notification-processor/route.ts` — procesar cola
- [ ] 6.2.10 Crear React Email templates (ticket created, assigned, resolved, SLA warning)

---

### 6.3 Backend — Metrics & Reports

- [ ] 6.3.1 Crear `lib/services/metrics.service.ts` — calcular métricas
- [ ] 6.3.2 Implementar ticket_metrics calculation (on ticket close: first_response, resolution_time, sla_met)
- [ ] 6.3.3 Implementar daily_metrics snapshot (group by type, status, channel, priority, group)
- [ ] 6.3.4 Implementar métricas granulares: Casos Cerrados/Nuevos/Progreso/Testing/Pendientes × Garantía/Soporte
- [ ] 6.3.5 Implementar SLA compliance rate calculation
- [ ] 6.3.6 Implementar AI Resolution Rate
- [ ] 6.3.7 Implementar Agent Utilization metrics
- [ ] 6.3.8 Implementar Channel Distribution metrics
- [ ] 6.3.9 Implementar Backlog Aging calculation
- [ ] 6.3.10 Implementar Reopen Rate calculation

---

### 6.4 Backend — REST API v1

- [ ] 6.4.1 Crear `api/v1/tickets/route.ts` — GET (list), POST (create)
- [ ] 6.4.2 Crear `api/v1/tickets/[id]/route.ts` — GET, PATCH, DELETE
- [ ] 6.4.3 Crear `api/v1/tickets/[id]/followups/route.ts` — POST
- [ ] 6.4.4 Crear `api/v1/tickets/[id]/assign/route.ts` — POST
- [ ] 6.4.5 Crear `api/v1/problems/route.ts` — GET, POST
- [ ] 6.4.6 Crear `api/v1/changes/route.ts` — GET, POST
- [ ] 6.4.7 Crear `api/v1/changes/[id]/approve/route.ts` — POST
- [ ] 6.4.8 Crear `api/v1/kb/articles/route.ts` — GET, POST
- [ ] 6.4.9 Crear `api/v1/kb/search/route.ts` — GET
- [ ] 6.4.10 Crear `api/v1/inbox/conversations/route.ts` — GET
- [ ] 6.4.11 Crear `api/v1/inbox/conversations/[id]/reply/route.ts` — POST
- [ ] 6.4.12 Implementar API key authentication + tenant validation
- [ ] 6.4.13 Implementar rate limiting por API key

---

### 6.5 Backend — Webhooks

- [ ] 6.5.1 Crear `lib/services/webhook.service.ts` — dispatch outbound webhooks
- [ ] 6.5.2 Implementar HMAC-SHA256 signature generation
- [ ] 6.5.3 Implementar webhook event dispatch (ticket.created, ticket.closed, etc.)
- [ ] 6.5.4 Implementar webhook retry logic (3 attempts, exponential backoff)
- [ ] 6.5.5 Implementar webhook logging
- [ ] 6.5.6 Crear `api/v1/webhooks/route.ts` — CRUD webhooks
- [ ] 6.5.7 Crear inbound webhook endpoints para custom integrations

---

### 6.6 Backend — Partners & Assets & Projects

- [ ] 6.6.1 Crear `lib/actions/partners.ts` — CRUD partners, partner_agents, ticket assignments
- [ ] 6.6.2 Crear `lib/actions/assets.ts` — CRUD assets, types, assignments
- [ ] 6.6.3 Crear `lib/actions/projects.ts` — CRUD projects, tasks, members

---

### 6.7 Frontend — Reports Page

- [ ] 6.7.1 Implementar `app/home/reports/page.tsx` — replicar Reports.tsx del template
- [ ] 6.7.2 Implementar 4 KPI cards (Total Tickets, Avg Resolution, SLA Compliance, Satisfaction)
- [ ] 6.7.3 Implementar Ticket Volume Trend (LineChart)
- [ ] 6.7.4 Implementar Priority Distribution (PieChart)
- [ ] 6.7.5 Implementar Tickets by Category (BarChart)
- [ ] 6.7.6 Implementar Agent Performance table con satisfaction ratings
- [ ] 6.7.7 Implementar `app/home/reports/tickets/page.tsx` — métricas granulares (Cerrados/Nuevos/Progreso/Testing/Pendientes × Garantía/Soporte)
- [ ] 6.7.8 Implementar `app/home/reports/sla/page.tsx` — SLA compliance report
- [ ] 6.7.9 Implementar `app/home/reports/agents/page.tsx` — agent productivity report
- [ ] 6.7.10 Implementar date range picker y filtros

---

### 6.8 Frontend — Notifications

- [ ] 6.8.1 Implementar `app/home/notifications/page.tsx` — replicar Notifications.tsx del template
- [ ] 6.8.2 Implementar notification bell con unread count (topbar)
- [ ] 6.8.3 Implementar filter tabs (All, Unread, Tickets, Changes, SLA Alerts)
- [ ] 6.8.4 Implementar mark as read/unread
- [ ] 6.8.5 Implementar Supabase Realtime subscription para push notifications
- [ ] 6.8.6 Implementar browser notification permission request

---

### 6.9 Frontend — Projects Page

- [ ] 6.9.1 Implementar `app/home/projects/page.tsx` — replicar Projects.tsx del template
- [ ] 6.9.2 Implementar 4 stat cards (Active, Completed, Total Tasks, Avg Progress)
- [ ] 6.9.3 Implementar project cards con progress bars, team avatars, budget
- [ ] 6.9.4 Implementar `app/home/projects/[id]/page.tsx` — Gantt/Kanban view

---

### 6.10 Frontend — Assets Page

- [ ] 6.10.1 Implementar `app/home/assets/page.tsx` — replicar Assets.tsx del template
- [ ] 6.10.2 Implementar 4 stat cards (Total, In Use, Available, Maintenance)
- [ ] 6.10.3 Implementar DataTable con asset ID, name, type, assignee, status, location

---

### 6.11 Frontend — Settings Restantes

- [ ] 6.11.1 Implementar Settings > Partners (CRUD proveedores, partner agents)
- [ ] 6.11.2 Implementar Settings > Notifications (CRUD templates, event → channel mapping)
- [ ] 6.11.3 Implementar Settings > Webhooks (CRUD webhooks in/out, logs)
- [ ] 6.11.4 Implementar Settings > Billing (plan actual, upgrade, usage metrics)

---

### 6.12 Frontend — Satisfaction Surveys

- [ ] 6.12.1 Implementar email template de satisfaction survey
- [ ] 6.12.2 Implementar `app/portal/survey/[token]/page.tsx` — formulario de encuesta (1-5 stars + comment)
- [ ] 6.12.3 Implementar auto-send survey después de ticket closed

---

### 6.13 Testing — Fase 6

- [ ] 6.13.1 Tests unitarios para notification engine (template rendering, recipient resolution)
- [ ] 6.13.2 Tests unitarios para metrics calculation
- [ ] 6.13.3 Tests unitarios para webhook dispatch + signature
- [ ] 6.13.4 Tests de integración para REST API v1 (auth, CRUD, rate limiting)
- [ ] 6.13.5 Test E2E: Reports dashboard con datos reales
- [ ] 6.13.6 Test E2E: Notification flow (event → queue → deliver)
- [ ] 6.13.7 Test E2E: Webhook outbound (ticket.created → HTTP POST)
- [ ] 6.13.8 Test E2E: Satisfaction survey flow
- [ ] 6.13.9 Test E2E completo: Portal → AI chat → ticket → assign → resolve → close → survey → report

---

## RESUMEN DE ENTREGABLES POR FASE

| Fase | Semanas | Tablas DB | Pages Frontend | API Endpoints | AI Agents | Tests |
|------|---------|-----------|----------------|---------------|-----------|-------|
| **1 - Foundation** | 1-4 | ~20 | 8 | 0 | 0 | 8 |
| **2 - ITSM Core** | 5-8 | ~15 | 8 | 0 | 0 | 7 |
| **3 - AI Layer** | 9-12 | ~3 | 2 | 5 | 6 | 5 |
| **4 - Inbox** | 13-16 | ~3 | 3 | 3 | 1 | 4 |
| **5 - Portal & Workflows** | 17-20 | ~9 | 8 | 1 | 0 | 5 |
| **6 - Analytics & Polish** | 21-24 | ~12 | 8 | 13 | 0 | 9 |
| **TOTAL** | 24 | ~55 | 37 | 22 | 7 | 38 |

---

## PROGRESO GLOBAL

```
Fase 1: [x] Foundation          ██████████ 95%
Fase 2: [x] ITSM Core           ████████░░ 80% (pending: cron jobs, tests)
Fase 3: [ ] AI Layer             ░░░░░░░░░░ 0%
Fase 4: [ ] Omnichannel Inbox    ░░░░░░░░░░ 0%
Fase 5: [ ] Portal & Workflows   ░░░░░░░░░░ 0%
Fase 6: [ ] Analytics & Polish   ░░░░░░░░░░ 0%

Total Tasks: ~350
Completed:   ~165
Progress:    ~47%
```

---

**Documento vivo. Se actualiza conforme avanza el desarrollo.**
**Cada tarea completada se marca con `[x]`.**
