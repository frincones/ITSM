# ANÁLISIS PROFUNDO DEL PRODUCTO — NovaDesk ITSM

> **Documento generado:** 2026-04-25
> **Autor:** @arquitecto (validación contra `Contexto/ARQUITECTURA.md`)
> **Propósito:** Inventario exhaustivo de lo que la aplicación hace HOY, distinguiendo lo realmente funcional de lo maquetado o planeado, como insumo para identificar mejoras de producto.
> **Branch:** `main` — commit base `2bd979f`

---

## 0. RESUMEN EJECUTIVO

**NovaDesk** es una plataforma SaaS multi-tenant de **IT Service Management** con foco AI-first, construida sobre Next.js 15 + Supabase + Claude/OpenAI. Está pensada para dos perfiles de comprador:

1. **Consultoras / MSPs** que gestionan múltiples clientes desde una sola consola (caso piloto: TDX gestionando Podenza, ACME, etc.)
2. **Empresas medianas (50-5.000 empleados)** que necesitan centralizar soporte interno con SLA, RBAC y multicanal.

El producto cubre las prácticas ITIL de **Incident, Request, Problem, Change, Knowledge, Service Catalog, Asset/CMDB y SLM** con distintos niveles de madurez. La capa core (tickets + inbox omnicanal + portal cliente + AI assistant + RBAC + multi-org) está **operativa en producción**, mientras que módulos secundarios (Assets, Projects, Service Catalog admin, CAB visual, Workflow Builder) están **maquetados o parcialmente conectados**.

**Estado global:** ~75-80% de funcionalidad declarada en el roadmap. Foundation, AI Layer, Omnichannel y Portal están a nivel productivo. Analytics, CMDB y Workflow visual son los principales focos de deuda.

**Vector de ventaja competitiva (vs. Freshservice / Zendesk / GLPI):**
- IA agéntica end-to-end (assistant con tool-use, copilot multi-aspecto, auto-clasificación, auto-asignación, auto-cierre por strikes).
- Multi-tenant + multi-organización en el mismo tenant (modelo MSP nativo).
- Inbox unificado con reconciliación de email (gap recovery del 15% que pierde Resend).
- Portal AI-first con token sin auth tradicional.

---

## 1. STACK Y ARQUITECTURA (RESUMEN)

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 (App Router), React Server + Client Components, TypeScript strict |
| UI | shadcn/ui, Radix UI, Tailwind CSS 4, Lucide, Recharts, Tiptap |
| Estado/Forms | TanStack Query 5, React Hook Form, Zod |
| Backend | Server Actions + Route Handlers (`/api`) |
| DB | Supabase PostgreSQL 15+ (RLS forzado, pgvector instalado) |
| Auth | Supabase Auth (JWT cookies, OAuth, MFA) |
| AI | OpenAI gpt-4o-mini en endpoints actuales, Claude/Anthropic disponible vía Vercel AI SDK |
| Email | Resend (entrante con webhook + reconciliación, saliente con templates) |
| Cron | Vercel Cron (8 jobs activos) |
| Realtime | Supabase Realtime (REPLICA IDENTITY FULL en tickets) |
| Deploy | Vercel + Supabase Cloud |
| Monorepo | Turborepo + pnpm |

**Migraciones SQL a la fecha:** hasta `00029_client_access_rls.sql` (visibles en `supabase/migrations/`); el repo histórico habla de hasta migración `00038` con realtime tickets.

**Reglas arquitectónicas no negociables (per `ARQUITECTURA.md`):**
- Toda tabla con `tenant_id NOT NULL` + RLS `ENABLE + FORCE` + 4 policies que usen `get_current_tenant_id()`.
- Frontend: data fetching siempre en Server Components; Client Components solo para forms/AI chat/interactividad.
- Backend: validación Zod obligatoria; nunca exponer errores internos; audit log para toda mutación.
- Performance: paginación server-side máx. 50 filas, sin `SELECT *`.

---

## 2. INVENTARIO DE CASOS DE USO POR MÓDULO

### 2.1 TICKETS (núcleo operativo) — ✅ Productivo

**Ubicación:** [apps/web/app/home/tickets/](apps/web/app/home/tickets/), [lib/actions/tickets.ts](apps/web/lib/actions/tickets.ts)

**Casos de uso reales:**
- **Crear ticket** (`createTicket`): validación Zod, auto-asignación round-robin, auto-follow del creador, notificación.
- **Listado avanzado**: búsqueda global vía RPC `search_global` (title/description/tags/comentarios), filtros multivalor (status, type, priority, category, agent, fecha), paginación 50, ordenamiento por 8 columnas.
- **Actualizar ticket** (`updateTicket`): cambia properties; auto-follow del nuevo asignado.
- **Asignar** (`assignTicket`): a agente o grupo; transición auto a `assigned` si era `new`.
- **Cambiar estado** (`changeTicketStatus`) con **máquina de estados validada**: `new → assigned → in_progress → testing → resolved → closed`, con rama `pending`/`detenido`/`reopened`/`cancelled`, tracking de `first_response_at`, `resolved_at`, `closed_at`, contador de reaperturas.
- **Follow-ups** (`addFollowup`): comentarios públicos vs privados (`is_private`), HTML rico, menciones a agentes/contactos, `email_message_id` único (idempotencia inbound), notificación selectiva (público → requester, privado → solo agentes).
- **Tareas internas** (`addTask`): subtarea con asignado, due_date, estimated_hours.
- **Soluciones** (`addSolution`): documenta solución y transiciona a `resolved`.
- **Soft delete** (`deleteTicket`) con audit trail.
- **Followers manuales** (`followTicket`/`unfollowTicket`) + auto-follow por mención/asignación.
- **Sub-estado testing** (`setTestingResult`): valores `pendiente/exitoso/fracaso`.
- **Client priority rank** (`setClientPriorityRank`): ranking 1-50 que el cliente readonly puede setear sobre sus propios tickets.
- **Realtime** vía hook `useTicketRealtime` (websocket Supabase, INSERT/UPDATE).
- **Plantillas de respuesta** (`response_templates` table, migración 00027).

**Estados:** `new, backlog, assigned, in_progress, pending, detenido, testing, resolved, reopened, closed, cancelled`.
**Tipos:** `incident, request, warranty, support, backlog, desarrollo_pendiente`.

**Notificaciones disparadas:** created, assigned, status_changed, commented, resolved (con dedupe para reducir volumen — commit `f1bd033`).

**API REST:** `GET /api/v1/tickets` y `POST /api/v1/tickets` (auth con `X-API-Key`).

---

### 2.2 INBOX OMNICANAL — ✅ Productivo

**Ubicación:** [apps/web/app/home/inbox/](apps/web/app/home/inbox/), [lib/actions/inbox.ts](apps/web/lib/actions/inbox.ts)

**Canales soportados:**
- `email_imap`, `email_office365`
- `whatsapp`
- `web_widget`
- Adapter pattern extensible (`/lib/integrations/registry`)

**Casos de uso:**
- Listado de conversaciones por status (`open / pending / snoozed / resolved`).
- Reply interno (solo agentes) vs outbound (dispatch al canal vía adapter).
- Asignar / resolver / snooze (`metadata.snoozed_until`).
- **Crear ticket desde conversación** con AI clasificando tipo, urgencia y sugerencias.
- Receptor de webhooks `POST /api/v1/inbox/webhooks/[channel]` con normalización a `NormalizedMessage`, get/create contact, dedupe.
- Webhook entrante de Resend (`/api/webhooks/resend`): detecta `TKT-…` o `PDZ-…` en subject → reabre tickets resueltos/cerrados; si no encuentra → crea ticket nuevo con `createTicketFromInboundEmail()`.
- **Cron de reconciliación** (`reconcile-inbound-emails`) que rescata el ~15% de emails que el webhook pierde.

**Tablas:** `inbox_conversations, inbox_messages, inbox_channels, inbox_contacts`.

---

### 2.3 PORTAL DEL CLIENTE — ✅ Productivo

**Ubicación:** [apps/web/app/portal/](apps/web/app/portal/), [api/portal/](apps/web/app/api/portal/)

**Acceso:**
- Sin auth tradicional: token público por organización (`organizations.portal_token`).
- Cada token == una organización == una vista aislada.

**Funciones:**
- Dashboard cliente con KPIs personales.
- Listado y detalle de **sus** tickets (filtrado server-side por `requester_email` + `organization_id`).
- Creación de tickets desde portal (form limitado: title, desc, type, urgency).
- KB pública filtrada por `organization_id` (org-only + global).
- **Chat AI** (`/portal/chat`) con RAG sobre KB y contexto de org.
- Status bar de incidentes activos (`is_major=true`).
- Subida de adjuntos (`/api/portal/upload`).
- Activity logging (`/api/portal/activity`) para upvotes / views.
- Encuesta NPS post-cierre (`/nps/[token]`) con score 1-10 + comentario, prefill por query param.

**Branding:** logo y colores por organización aplicados en `/portal/[token]`.

---

### 2.4 PROBLEMS — 🟡 Listado real, sin edición

**Ubicación:** [apps/web/app/home/problems/](apps/web/app/home/problems/)

**Funcional:**
- Lista paginada con búsqueda y filtros por status (`new, accepted, analysis, root_cause_identified, solution_planned, resolved, closed`).
- Cards de KPI: Active, Known Errors, Resolved This Month, Related Incidents.
- Auto-numeración `PRB-YYMM-XXXXX`.
- Cálculo de prioridad = urgency × impact.
- Vínculo `problems ↔ tickets` vía `problem_ticket_links`.
- Subtareas (`problem_tasks`) y soluciones/workarounds.
- Campos AI (`ai_pattern_detected`, `root_cause_ai`) presentes en DB.

**Gaps:**
- ❌ No hay página de detalle (`[id]/`).
- ❌ No hay formulario "New Problem" funcional.
- ❌ No se edita root cause / workaround desde UI.
- ❌ AI fields no se exponen en UI.

---

### 2.5 CHANGES — 🟡 Listado real, CAB sin UI

**Ubicación:** [apps/web/app/home/changes/](apps/web/app/home/changes/)

**Funcional:**
- Lista con filtros por status / change_type (`standard, normal, emergency`) + búsqueda.
- KPIs: Pending Approval, Scheduled, Implementing, Completed.
- Schema DB completo: `changes, change_validations (CAB), change_tasks, change_costs`.
- Auto-numeración `CHG-YYMM-XXXXX`.
- Estados: `new → evaluation → approval_pending → approved → scheduled → in_progress → testing → implemented/rolled_back/closed/rejected`.
- Tracking de `scheduled_start/end` y `actual_start/end`.

**Gaps:**
- ❌ No hay detail/edit page.
- ❌ **No existe workflow CAB en UI** (la tabla `change_validations` existe pero no se opera).
- ❌ Risk assessment / impact analysis (campos JSON) no se renderizan.
- ❌ Costos no se gestionan desde UI.

---

### 2.6 KNOWLEDGE BASE — 🟡 Lectura sí, autoría no

**Ubicación:** [apps/web/app/home/kb/](apps/web/app/home/kb/), [apps/web/app/portal/[token]/kb/](apps/web/app/portal/)

**Funcional:**
- Listado de artículos publicados con filtro por categoría.
- Categorías jerárquicas con slug y conteo.
- Versionado (`kb_article_revisions`), feedback helpful/not_helpful, view_count, tags, multi-idioma (default `es`).
- Portal público lee KB por organización + globales.
- Endpoints AI (copilot/suggest) consumen KB para RAG textual (ilike, sin embeddings aún).

**Gaps:**
- ❌ No hay editor admin (WYSIWYG / Markdown) para crear/editar artículos.
- ❌ Revisions no comparables.
- ❌ Feedback recibido no se muestra a admin.
- ❌ AI auto-generation flag existe pero no hay flujo de generación.

---

### 2.7 ASSETS / CMDB — 🔴 Maquetado

**Ubicación:** [apps/web/app/home/assets/](apps/web/app/home/assets/)

**Funcional:**
- Tabla con tags, status, location, serial, purchase date, asignado.
- 4 KPI cards (Total / In Use / Available / Maintenance).
- Schema DB OK: `assets, asset_types, asset_assignments`.

**Gaps:**
- ❌ Form "Add Asset" no persiste (handlers vacíos).
- ❌ No hay edición ni detalle.
- ❌ No hay historial de asignaciones en UI.
- ❌ No hay relaciones CI ↔ CI ni mapa de impacto.
- ❌ No hay depreciación.

---

### 2.8 PROJECTS — 🔴 Mock

**Ubicación:** [apps/web/app/home/projects/](apps/web/app/home/projects/)

- Usa `DEMO_PROJECTS` cuando la DB está vacía.
- Form Create Project no persiste.
- Sin detalle, sin edición, sin vínculos a Changes/Problems.

---

### 2.9 SERVICE CATALOG — 🟡 Lectura con fallback mock

**Ubicación:** [apps/web/app/home/service-catalog/](apps/web/app/home/service-catalog/)

**Funcional:**
- Grid de servicios publicados desde `service_catalog_items`.
- Approval-required flag, estimated time, iconos.
- Schema relacional: `service_catalogs, service_catalog_items, forms, form_sections, form_questions, form_submissions, form_destinations`.

**Gaps:**
- ❌ Sin admin para crear/editar servicios y formularios.
- ❌ Sin gestión de service requests (workflow de aprobación).
- ❌ SLA por servicio no enforced.

---

### 2.10 AUTOMATIONS / WORKFLOWS — 🟡 Esqueleto

**Ubicación:** [apps/web/app/home/automations/](apps/web/app/home/automations/), [apps/web/app/home/workflows/](apps/web/app/home/workflows/)

**Funcional:**
- Lista de workflows con `trigger_type`, `is_active`, `execution_count`, `success_rate`, `last_run_at`.
- Builder visual `[id]/page` con steps (`trigger / condition / action / delay`).
- Servicios `workflow.service.ts` con `findMatchingWorkflows`, `executeStep`.

**Gaps:**
- ❌ Persistencia de pasos desde el builder no integrada.
- ❌ Engine de ejecución no orquestado (existe el código, no hay dispatcher productivo).
- ❌ Business Rules tienen tabla pero no dispatcher.

---

### 2.11 NOTIFICATIONS — ✅ Productivo

**Ubicación:** [apps/web/app/home/notifications/](apps/web/app/home/notifications/), `lib/services/notification.service.ts`

- Tabla `notifications` por user + tabla `notification_queue` con dispatcher cron `*/1 * * * *`.
- Plantillas (`notification_templates`) parametrizadas por evento + canal.
- Resolución de recipients: requester / assigned_agent / group_members / watchers / all_agents.
- Canales: email (Resend) e in_app; webhook + WhatsApp definidos en schema.
- Dedupe de emails para reducir volumen (commit `f1bd033`).

---

### 2.12 SLA ENGINE — ✅ Productivo

- Tablas: `slas, sla_calendars, calendar_holidays`.
- Cálculo respeta horas laborales, calendario por día y holidays con timezone (`America/Bogota` por defecto).
- Cron `sla-check` cada minuto:
  - Detecta breach (`due ≤ now`) → marca `sla_breached=true` + escala (`notify / escalate / reassign`).
  - Detecta warning (`due ≤ 30 min`) → notif única (anti-spam).
- Acciones de escalación reasignan a grupo o agente configurado.

---

### 2.13 AI LAYER — ✅ Productivo (con headroom)

**Endpoints:** [apps/web/app/api/ai/](apps/web/app/api/ai/)

| Endpoint | Función |
|----------|---------|
| `assistant` | Copilot conversacional con tool-use (search/list/count/create/assign/resolve tickets), 5 pasos, timeout 25 s |
| `copilot` | Análisis multi-aspecto: clasificación, sentimiento, draft de respuesta, escalation risk, similar tickets |
| `classify` | Tipo + urgencia + categoría con confianza, salida estructurada Zod |
| `suggest` | 2-4 soluciones con fuente (KB / similar_ticket / ai_generated), confianza |
| `summarize` | Resumen ejecutivo de tickets cerrados |
| `chat` | Chat de portal (lógica básica) |

**Modelo actual:** **gpt-4o-mini en todas las rutas**. Temperature 0–0.4. **Claude / Anthropic está en stack pero no en uso productivo en estos endpoints**.

**RAG:** búsqueda en KB por `ilike` (texto plano). **pgvector instalado pero no usado para semantic search**.

**Cron AI:**
- `ai-insights` (diario 1AM UTC): genera insights + métricas de performance por tenant.
- `metrics-snapshot` (diario): KPIs en `daily_metrics`.

---

### 2.14 CRON JOBS — ✅ 8 jobs activos

| Job | Schedule | Función |
|-----|----------|---------|
| `sla-check` | `* * * * *` | Breach + warning + escalation |
| `notification-processor` | `* * * * *` | Procesa queue + retry webhooks |
| `ticket-auto-assign` | `0 */4 * * *` | Round-robin sobre tickets sin asignar |
| `ai-insights` | `0 1 * * *` | Tendencias + AI performance por tenant |
| `csat-dispatcher` | `*/5 * * * *` | NPS surveys post-resolución |
| `reconcile-inbound-emails` | manual / GH Actions | Recupera emails no entregados por webhook |
| `metrics-snapshot` | `0 0 * * *` | KPIs diarios por tenant |
| `testing-strike-check` | `0 * * * *` | 3 strikes (24/48/72 h) → auto-resolve + CSAT |

**Auto-asignación:** round-robin **puro alfabético con cursor en `tenants.settings.round_robin_last_agent_id`** (no balanceo por carga real).

**Strike de testing:** S1=email recordatorio, S2=warning + alerta agente, S3=auto-resolve + email de cierre + queue CSAT.

---

### 2.15 AUTH & ONBOARDING — ✅ Productivo

**Rutas:** [apps/web/app/auth/](apps/web/app/auth/)

- sign-in (email/password + Google OAuth), sign-up, password-reset, set-password, activate, verify, callback, confirm.
- Branding panel lateral con i18n.
- Onboarding agentes: invitación → activate → set password → org default.
- Onboarding org_users: invitación con prefilled org_id → portal token.

---

### 2.16 RBAC UNIFICADO — ✅ Productivo

**Migración:** `00022_rbac_modules.sql` (seed de 3 perfiles base).

**Perfiles:**
- **Admin:** full access en todos los módulos.
- **Agent L1:** dashboard read, tickets create/read/update con scope `own`.
- **Agent L2:** scope `group` en tickets/problems, CRUD en KB, read en reports/assets/projects.

**Mecánica:**
- `profile_permissions(resource, actions[], scope)`.
- `checkPermission(client, agentId, resource, action, ownerId?, groupId?)`.
- Sidebar dinámico por `allowed_modules`.
- Roles legacy a deprecar: `readonly`, `partner`, `portal_admin`.

---

### 2.17 MULTI-TENANT + MULTI-CLIENTE — ✅ Productivo

```
Tenant (TDX, master)
├── Agents (staff con `agent_organizations` ↔ access_level)
├── Organizations (clientes finales con portal_token, brand_colors, sla_id)
└── Organization_users (usuarios del cliente)
```

**Tablas clave:** `tenants, organizations, agent_organizations (pivote con access_level), organization_users`.

**Access levels para agentes:** `full | tickets_only | readonly | portal_admin`.

**Filtros enforced:** todas las queries de tickets, contacts, KB, inbox, reports filtran `organization_id` + `tenant_id`.

---

### 2.18 REPORTS — ✅ Productivo limitado

**Ubicación:** [apps/web/app/home/reports/](apps/web/app/home/reports/)

- **Gestion-Soporte (diario):** tickets cerrados (garantía vs soporte), nuevos, en progreso, testing (nuevos/failed/pendientes), pendientes. Filtro por fecha + org.
- **Tickets:** dashboard de status / type counts; filtros por agente/grupo.

**Gaps obvios:**
- ❌ Sin SLA compliance report visible.
- ❌ Sin agent performance / load comparativo.
- ❌ Sin AI performance dashboard end-user (los datos existen en `daily_metrics`).
- ❌ Sin export (CSV/Excel) ni programación de envío.

---

### 2.19 SETTINGS — ✅ Productivo

| Sección | Estado |
|---------|--------|
| Organizations | ✅ CRUD + branding + SLA + agentes asignados |
| Users-Permissions | ✅ Matriz unificada + perfiles |
| AI | ✅ Config de agentes AI por org + knowledge_documents |
| Channels | ✅ Inbox multicanal |
| Partners | ✅ Lista y CRUD |
| Webhooks | ✅ Subscripciones + delivery logs |

---

### 2.20 MARKETING / PRICING / LEGAL — ✅ Estático funcional

**Rutas:** [apps/web/app/(marketing)/](apps/web/app/(marketing)/)

- Landing + Pricing (Free / Starter $19 / Professional $49 / Enterprise) — destacando Pro.
- Legal: terms, privacy, cookies, refund.
- FAQ.
- **No hay billing real (Stripe/Paddle no integrado todavía).**

---

## 3. CASOS DE USO TRANSVERSALES

### 3.1 NPS / CSAT
Queue post-resolución → cron `csat-dispatcher` envía survey con token único → respuesta en `/nps/[token]`. Se permite auto-resolved-by-strike también disparar CSAT.

### 3.2 Email idempotente
- Subject pattern `TKT-…` / `PDZ-…` activa append a ticket existente.
- `email_message_id` + `source_ref='resend:{id}'` evitan duplicados.
- Reapertura automática si el ticket estaba `resolved/closed`, con incremento de `reopened_count`.

### 3.3 Audit
- `audit_logs` para mutaciones (incluye soft-delete).
- `created_by`, `updated_by`, `deleted_at` en tablas operativas.

### 3.4 Realtime
- Lista y workspace de tickets reciben updates en vivo (commit `fabc098`).
- Hook `useTicketRealtime` filtra por tenant_id + permisos del usuario.

---

## 4. MAPA ITIL — COBERTURA ACTUAL

| Práctica ITIL | Estado | Comentarios |
|---------------|--------|-------------|
| Incident Management | ✅ Sólido | Tickets con state machine, SLA, escalación, NPS |
| Service Request | 🟡 Parcial | Service Catalog read-only; sin workflow de aprobación |
| Problem Management | 🟡 Solo lectura | Falta detail/CRUD, sin RCA workflow |
| Change Management | 🟡 Esqueleto | Sin CAB ni risk UI |
| Knowledge Management | 🟡 Lectura | Falta editor admin + semantic search |
| Service Level Mgmt | ✅ Funcional | Calendarios + breach + escalation |
| IT Asset / CMDB | 🔴 Maquetado | Sin CRUD real ni relaciones |
| Service Catalog | 🟡 Read | Sin admin |
| Project Mgmt | 🔴 Mock | Solo demo data |
| Continual Improvement | 🟡 Métricas snapshot OK, dashboard CSI no |
| Business Relationship | ❌ No | Fuera de scope |
| Financial Mgmt | ❌ No | `change_costs` existe; sin chargeback |

---

## 5. INTEGRACIONES Y EXTENSIBILIDAD

| Integración | Estado |
|-------------|--------|
| Resend (email out + webhook in) | ✅ |
| IMAP / Office 365 | ✅ adapter |
| WhatsApp Cloud API | ✅ adapter |
| Web Widget | ✅ |
| API REST v1 (tickets + inbox) | ✅ con `X-API-Key` |
| Webhooks salientes a sistemas externos | 🟡 Schema + retry; UI básica |
| OAuth Google/GitHub | ✅ login |
| Stripe / Paddle | ❌ pricing sin billing |
| SAML / SSO Enterprise | ❌ |
| Slack / Teams | ❌ |
| Jira / ServiceNow sync | ❌ |

---

## 6. SEGURIDAD Y COMPLIANCE

**Implementado:**
- Supabase Auth (cookies HttpOnly), CSRF middleware, RLS forzado en tablas, soft delete + audit, hashing bcrypt para API keys, validación mime/size en uploads.

**Gaps detectados:**
- ❌ SOC 2 / ISO 27001 / GDPR DPA: solo mencionados en marketing, sin evidencia técnica (no encryption-at-rest customer keys, no DPIA template).
- ❌ MFA disponible en Supabase pero no exigido por policy.
- ❌ Sin `Data Residency` por tenant (todo en mismo proyecto Supabase).
- ❌ No hay export GDPR ni "right to be forgotten" automatizado.

---

## 7. PERFORMANCE — SLOs declarados vs riesgos

| SLO declarado | Riesgo observado |
|---------------|------------------|
| API < 500 ms p95 | RPC `search_global` sin índice GIN explícito visible |
| Page load < 2 s p95 | Tickets list pre-fetcha hasta 500 abiertos en workspace; sin virtualization en tabla |
| DB < 100 ms | `audit_logs` y `daily_metrics` no particionadas todavía |
| Pagination 50 max | Cumplido en server actions |

---

## 8. ROLES Y PERSONAS RECONOCIDOS

| Rol | Acceso |
|-----|--------|
| Admin TDX | Master tenant — CRUD global + settings + RBAC |
| Supervisor | Reportes + supervisión de grupo |
| Agent L2 | CRUD tickets/problems/changes + KB + inbox group scope |
| Agent L1 | Tickets propios + KB read |
| Readonly | Solo lectura (legacy) |
| Partner | Externos asociados |
| Org Admin (cliente) | Admin de su organización |
| Org User (cliente) | Crear ticket + KB + chat |
| Portal anónimo via token | Acceso público a portal |

---

## 9. GAPS CRÍTICOS — ORDENADOS POR IMPACTO DE NEGOCIO

### 🔴 Bloqueantes para venta enterprise
1. **Sin billing integrado** (Free/Starter/Pro/Enterprise solo en marketing).
2. **Sin SSO empresarial** (SAML / Azure AD / Okta).
3. **Sin SOC 2 evidence** ni Data Processing Agreement / Subprocessor list.
4. **Sin export de datos** (GDPR, customer offboarding).
5. **Sin app móvil** ni PWA del agente.

### 🟡 Bloqueantes para diferenciación AI
6. **pgvector instalado pero sin embeddings** → "RAG" actual es búsqueda léxica.
7. **AI usa gpt-4o-mini exclusivamente** → ningún uso productivo de Claude pese al stack declarado.
8. **Sin medición de calidad AI** (accuracy de clasificación, deflection rate, AI ROI por tenant) expuesta al usuario.
9. **Auto-asignación es round-robin alfabético** — no considera carga, skills, ni horario del agente.

### 🟡 Bloqueantes para ITIL completo
10. **CMDB y CI relations vacíos** — bloquea Impact Analysis para Changes y Problems.
11. **CAB workflow no en UI** — Changes no aprobables.
12. **KB sin editor admin** — el equipo no puede mantener contenido ni publicar resoluciones.
13. **Service Catalog sin admin** — no se pueden definir servicios reales con SLAs y forms.
14. **Workflow Builder sin engine productivo** — pierde valor diferencial vs Zapier-like.
15. **Problems / Changes sin detail page** — bloqueador funcional.

### 🟢 UX / operación diaria
16. Reports limitados a 2 vistas; sin export ni programación.
17. Sin filtros guardados / vistas custom en tickets.
18. Sin bulk actions visibles en lista.
19. Sin colaboración en vivo (typing indicators, mentions live).
20. Sin atajos de teclado documentados.
21. Sin dark mode validado en toda la app.

---

## 10. OPORTUNIDADES DE MEJORA — ROADMAP SUGERIDO

### Horizonte 0–4 semanas (ganancias rápidas)
- ✅ Activar **embeddings + pgvector** en KB y tickets resueltos → upgrade real del RAG.
- ✅ Implementar **detail / edit page** de Problems y Changes.
- ✅ Construir **editor admin de KB** (Tiptap ya está en stack) con publish flow + preview portal.
- ✅ **Bulk actions** en tickets list (assign, status, tag, delete).
- ✅ Filtros guardados ("vistas") y favoritos por agente.
- ✅ **Export CSV/Excel** en reports.
- ✅ Auto-asignación **load-balanced** (no solo round-robin) considerando tickets abiertos por agente.

### Horizonte 4–10 semanas (ITIL completion)
- 🚀 **CAB workflow visual** (Kanban approval steps, validators, sign-off audit).
- 🚀 **CMDB con relaciones CI** (gráfico de dependencias para Impact Analysis automático).
- 🚀 **Service Catalog admin** + form builder + request workflow.
- 🚀 **Workflow Builder productivo** con engine de ejecución y librería de plantillas (auto-resolve, auto-tag, escalation, notificación condicional).
- 🚀 **Reportes ITIL** estandarizados: SLA compliance, MTTR/MTTA, first-contact resolution, agent load, AI deflection rate, CSAT trend.
- 🚀 **AI Quality Console:** muestra al cliente el accuracy de clasificación y el ROI por org.

### Horizonte 10–20 semanas (Enterprise readiness)
- 🏢 **Stripe/Paddle billing** + plan entitlements + cost control granular.
- 🏢 **SSO SAML/OIDC** + SCIM provisioning.
- 🏢 **Audit explorer** + export GDPR + retention policies por tenant.
- 🏢 **SOC 2 evidence collection** y subprocessor list públicos.
- 🏢 **Data residency** opcional (proyecto Supabase por región).
- 🏢 **PWA / móvil del agente** (next-pwa + push notifications).
- 🏢 **Marketplace de integraciones** (Jira, ServiceNow, Slack, Teams, Microsoft Graph nativo).

### Horizonte > 20 semanas (apuestas estratégicas)
- 🤖 **Agentic resolutions end-to-end:** AI con tool-use que ejecute remediaciones (run-book, restart service, push KB) bajo aprobación humana.
- 🤖 **Predictive SLA breach** (model que prediga riesgo de breach a partir de carga + histórico).
- 🤖 **Auto-KB generation** desde tickets resueltos exitosos (con validación humana).
- 🤖 **Voice agent** para canal telefónico + transcripción.
- 📊 **Customer Success cockpit** (Health Score por organización: NPS + ticket volume + breach + AI usage).

---

## 11. RIESGOS TÉCNICOS A VIGILAR

1. **Crecimiento de `audit_logs` y `daily_metrics`** — particionado por mes prometido en `ARQUITECTURA.md` pero no observable en migraciones públicas.
2. **Round-robin con cursor en `tenants.settings`** — race condition posible bajo concurrencia alta.
3. **`search_global` RPC** — sin Postgres FTS / GIN visible; degrada a `O(n)` con volumen.
4. **AI calls síncronas en endpoints** — sin queue + retry; si OpenAI cae, UI se degrada.
5. **Notificaciones en `notification_queue`** sin partición ni TTL → tabla puede crecer indefinidamente.
6. **No hay feature flags por tenant** observables (PLAN-SAAS-MVP los menciona pero no se implementan en código).

---

## 12. MÉTRICAS CLAVE PARA INSTRUMENTAR YA

Para tomar decisiones de mejora basadas en datos, instrumentar:

- **AI deflection rate** (tickets cerrados sin agente humano).
- **Auto-classification accuracy** (cuántas sugerencias el agente acepta sin cambios).
- **Median time to first response** y **MTTR** por organización + tipo.
- **SLA compliance rate** y **% de breaches por categoría**.
- **Inbound channel mix** (email vs WhatsApp vs portal vs API).
- **Re-open rate** post-strike auto-close (calidad de la resolución forzada).
- **NPS por org** y trending mensual.
- **AI cost per ticket** (tokens consumidos / ticket resuelto).

---

## 13. CONCLUSIÓN

NovaDesk tiene un **núcleo SaaS multi-tenant funcional y diferenciado por su capa AI agéntica e inbox omnicanal**, con un modelo MSP nativo (multi-org dentro de un tenant) que es difícil de encontrar en competidores como Freshservice o Zendesk. La cobertura ITIL es seria en Incident y SLM, suficiente en Knowledge y Request, e incipiente en Problem/Change/CMDB.

**Las tres palancas de mayor retorno** identificadas para los próximos 90 días son:

1. **Cerrar el círculo ITIL operativo** (detail/edit pages de Problems y Changes, CAB workflow, KB editor admin).
2. **Activar el "real" AI moat** (embeddings + pgvector, AI Quality Console, auto-asignación load-balanced, predictive SLA breach).
3. **Pavimentar la venta enterprise** (Stripe billing, SSO SAML, evidence SOC 2, export GDPR).

Con estas tres palancas, NovaDesk pasaría de "MVP sólido" a "producto comercial diferenciado en LatAm" sin necesidad de una refundación arquitectónica — la base ya está construida correctamente.

---

**Fin del análisis.**
