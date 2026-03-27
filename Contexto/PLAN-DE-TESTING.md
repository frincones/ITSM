# PLAN DE TESTING — NovaDesk ITSM AI-First Platform

> **Proyecto:** NovaDesk ITSM
> **Fecha:** 2026-03-27
> **Herramienta:** Playwright MCP (headless)
> **URL Producción:** https://itsm-web.vercel.app
> **URL Local:** http://localhost:3001
> **Credenciales Admin:** admin@novadesk.com / NovaDesk2026
> **Tenant:** NovaDesk Demo (8be06573-2e43-4d8f-b81d-48b9cddb060d)

---

## RESUMEN EJECUTIVO

| Métrica | Valor |
|---------|-------|
| Total Fases de Testing | 22 |
| Total Tests | 487 |
| Prioridad P0 (Blocker) | 98 |
| Prioridad P1 (High) | 156 |
| Prioridad P2 (Medium) | 143 |
| Prioridad P3 (Low) | 90 |

---

## DATOS DE PRUEBA

### Usuarios

| Rol | Email | Password | Descripción |
|-----|-------|----------|-------------|
| Admin | admin@novadesk.com | NovaDesk2026 | Admin del tenant NovaDesk Demo |
| Supervisor | supervisor@novadesk.com | NovaDesk2026 | Supervisor de grupo L1 |
| Agent L2 | agent.l2@novadesk.com | NovaDesk2026 | Agente nivel 2 |
| Agent L1 | agent.l1@novadesk.com | NovaDesk2026 | Agente nivel 1 |
| Readonly | viewer@novadesk.com | NovaDesk2026 | Solo lectura |
| Partner Agent | partner@vendor.com | NovaDesk2026 | Agente de proveedor externo |
| Portal User | usuario@cliente.com | NovaDesk2026 | Usuario del portal |
| Admin Tenant B | admin@otraempresa.com | NovaDesk2026 | Admin de otro tenant (multi-tenancy test) |

### Datos Semilla Requeridos

```
Tickets: 5 tickets en estados variados (new, assigned, in_progress, resolved, closed)
Problems: 2 problemas (1 activo, 1 resuelto)
Changes: 3 cambios (1 pending approval, 1 approved, 1 implemented)
KB Articles: 5 artículos (3 published, 1 draft, 1 archived)
Categories: 4 categorías (Hardware, Software, Network, Access)
Groups: 2 grupos (L1 Support, L2 Engineering)
SLAs: 2 SLAs (Standard: 4h response/24h resolution, Critical: 1h/4h)
Contacts: 3 contactos de clientes
Inbox: 2 conversaciones (1 open, 1 resolved)
Workflows: 1 workflow activo (auto-assign on ticket creation)
Rules: 2 reglas (1 clasificación, 1 asignación)
```

---

## FASE T1: AUTENTICACIÓN Y SESIÓN (P0)

### T1.1 Login con Email/Password
- [ ] T1.1.1 Navegar a /auth/sign-in → muestra formulario con email, password, botón submit
- [ ] T1.1.2 Verificar panel izquierdo muestra branding NovaDesk ITSM con gradiente indigo/purple
- [ ] T1.1.3 Verificar features listados: Unified Workspace, Automation First, Enterprise Ready
- [ ] T1.1.4 Login con admin@novadesk.com / NovaDesk2026 → redirect a /home
- [ ] T1.1.5 Verificar topbar muestra "Admin NovaDesk" y avatar "AD"
- [ ] T1.1.6 Login con email incorrecto → muestra error "Invalid credentials"
- [ ] T1.1.7 Login con password incorrecto → muestra error
- [ ] T1.1.8 Login con campos vacíos → muestra validación required
- [ ] T1.1.9 Link "Password forgotten?" → navega a /auth/password-reset
- [ ] T1.1.10 Link "Contact sales" → navega a /auth/sign-up

### T1.2 Sesión y Navegación Protegida
- [ ] T1.2.1 Acceder a /home sin login → redirect a /auth/sign-in
- [ ] T1.2.2 Acceder a /home/tickets sin login → redirect a /auth/sign-in
- [ ] T1.2.3 Acceder a /home/settings sin login → redirect a /auth/sign-in
- [ ] T1.2.4 Después de login, refresh de página mantiene sesión
- [ ] T1.2.5 Logout desde user dropdown → redirect a /auth/sign-in

### T1.3 OAuth (Google)
- [ ] T1.3.1 Botón "Sign in with Google" visible en login page
- [ ] T1.3.2 Click en Google → redirect a OAuth flow (verificar URL contiene accounts.google.com)

### T1.4 Password Reset
- [ ] T1.4.1 Navegar a /auth/password-reset → muestra formulario con email
- [ ] T1.4.2 Ingresar email válido → muestra mensaje de confirmación
- [ ] T1.4.3 Ingresar email inválido → muestra error de formato

---

## FASE T2: LAYOUT Y NAVEGACIÓN (P0)

### T2.1 Sidebar
- [ ] T2.1.1 Sidebar muestra 12 iconos de navegación (Dashboard, Inbox, Tickets, Problems, Changes, Projects, Assets, KB, Catalog, Automations, Reports, Settings)
- [ ] T2.1.2 Click en cada icono navega a la ruta correcta:
  - [ ] Dashboard → /home
  - [ ] Inbox → /home/inbox
  - [ ] Tickets → /home/tickets
  - [ ] Problems → /home/problems
  - [ ] Changes → /home/changes
  - [ ] Projects → /home/projects
  - [ ] Assets → /home/assets
  - [ ] Knowledge → /home/kb
  - [ ] Catalog → /home/service-catalog
  - [ ] Automations → /home/automations
  - [ ] Reports → /home/reports
  - [ ] Settings → /home/settings
- [ ] T2.1.3 Active state se muestra en el icono de la ruta actual
- [ ] T2.1.4 Tooltip se muestra al hover sobre cada icono

### T2.2 Topbar
- [ ] T2.2.1 Search input visible con placeholder "Search tickets, users, assets..."
- [ ] T2.2.2 Botón "New Ticket" visible y clickeable → navega a /home/tickets/new
- [ ] T2.2.3 Notification bell visible con badge de count
- [ ] T2.2.4 Dark mode toggle visible → cambia tema al click
- [ ] T2.2.5 User avatar dropdown → muestra opciones: Profile, Settings, Sign Out
- [ ] T2.2.6 Click "Sign Out" → cierra sesión y redirect a /auth/sign-in

### T2.3 Dark Mode
- [ ] T2.3.1 Click toggle → background cambia a oscuro
- [ ] T2.3.2 Sidebar se adapta a dark mode
- [ ] T2.3.3 Cards y badges se adaptan a dark mode
- [ ] T2.3.4 Click toggle de nuevo → vuelve a light mode

---

## FASE T3: DASHBOARD (P1)

### T3.1 KPI Cards
- [ ] T3.1.1 Card "Open Tickets" muestra count correcto (debe ser >= 1)
- [ ] T3.1.2 Card "Overdue" muestra count de tickets con SLA breached
- [ ] T3.1.3 Card "Resolved Today" muestra count del día
- [ ] T3.1.4 Card "Avg Resolution Time" muestra tiempo promedio
- [ ] T3.1.5 Cada card muestra % de cambio vs periodo anterior

### T3.2 AI Insights
- [ ] T3.2.1 Sección AI Insights visible con icono Sparkles
- [ ] T3.2.2 Muestra al menos 1 insight card con título y descripción

### T3.3 Charts
- [ ] T3.3.1 Ticket Trends chart visible (BarChart con Recharts)
- [ ] T3.3.2 Chart muestra datos de los últimos 7 días
- [ ] T3.3.3 SLA Health section visible

### T3.4 Priority Tickets
- [ ] T3.4.1 Lista de tickets prioritarios visible
- [ ] T3.4.2 Cada ticket muestra: ID, título, prioridad, requester, tiempo

### T3.5 Recent Activity
- [ ] T3.5.1 Timeline de actividad reciente visible
- [ ] T3.5.2 Muestra últimas acciones (ticket creado, asignado, etc.)

---

## FASE T4: TICKETS — CRUD COMPLETO (P0)

### T4.1 Lista de Tickets
- [ ] T4.1.1 Navegar a /home/tickets → muestra DataTable con tickets
- [ ] T4.1.2 Columnas visibles: ticket_number, title, type, status, priority, requester, assigned, SLA, created_at
- [ ] T4.1.3 StatusBadge muestra color correcto por estado (new=blue, in_progress=amber, etc.)
- [ ] T4.1.4 PriorityBadge muestra color correcto (critical=red, high=orange, medium=yellow, low=green)
- [ ] T4.1.5 Tabs funcionan: All, Assigned to Me, Unassigned, Overdue, Critical
- [ ] T4.1.6 Search filtra por título o número de ticket
- [ ] T4.1.7 Paginación funciona (siguiente, anterior)
- [ ] T4.1.8 Click en ticket → navega a /home/tickets/[id]

### T4.2 Crear Ticket
- [ ] T4.2.1 Click "New Ticket" → navega a /home/tickets/new
- [ ] T4.2.2 Formulario muestra todos los campos: Title, Description, Type, Urgency, Impact, Category, Requester Email, Tags
- [ ] T4.2.3 Title es requerido → submit sin título muestra error
- [ ] T4.2.4 Description es requerido → submit sin descripción muestra error
- [ ] T4.2.5 Type dropdown muestra: incident, request, warranty, support, backlog
- [ ] T4.2.6 Urgency dropdown muestra: low, medium, high, critical
- [ ] T4.2.7 Impact dropdown muestra: low, medium, high, critical
- [ ] T4.2.8 Category dropdown muestra categorías del tenant
- [ ] T4.2.9 Tags input: escribir + Enter agrega tag, click X remueve tag
- [ ] T4.2.10 Crear ticket con datos válidos:
  - Title: "Server down in production"
  - Description: "Main database server is not responding since 10am"
  - Type: incident
  - Urgency: critical
  - Impact: high
  → Toast "Ticket created" + redirect a /home/tickets
- [ ] T4.2.11 Verificar ticket aparece en la lista con número TKT-YYMM-NNNNN
- [ ] T4.2.12 Verificar priority se calculó automáticamente (critical × high = 12)
- [ ] T4.2.13 Cancel button → navega a /home/tickets sin crear

### T4.3 Detalle de Ticket
- [ ] T4.3.1 Navegar al ticket creado → muestra layout 3 columnas
- [ ] T4.3.2 Header muestra: ticket_number, título, StatusBadge, PriorityBadge, type badge
- [ ] T4.3.3 Panel izquierdo (AI) muestra: Classification (type + urgency), Suggestions
- [ ] T4.3.4 Panel central (Timeline) muestra: "System Ticket created" como primer entry
- [ ] T4.3.5 Panel derecho (Info) muestra: Requester, SLA, Properties, Assignment, Category, Tags, Channel, Dates
- [ ] T4.3.6 Reply Composer visible con tabs: "Public Reply" / "Internal Note"

### T4.4 Acciones en Ticket
- [ ] T4.4.1 Cambiar Status via dropdown (new → assigned) → timeline muestra cambio
- [ ] T4.4.2 Cambiar Urgency via dropdown → priority se recalcula
- [ ] T4.4.3 Asignar agente via dropdown → muestra nombre del agente
- [ ] T4.4.4 Asignar grupo via dropdown → muestra nombre del grupo
- [ ] T4.4.5 Cambiar categoría via dropdown → actualiza
- [ ] T4.4.6 Agregar tag → aparece como chip
- [ ] T4.4.7 Remover tag → desaparece

### T4.5 Followups
- [ ] T4.5.1 Escribir en "Public Reply" → click "Send Reply" → followup aparece en timeline
- [ ] T4.5.2 Followup muestra: avatar, autor, timestamp, contenido
- [ ] T4.5.3 Cambiar a "Internal Note" → escribir → click "Add Note" → nota aparece con fondo amber
- [ ] T4.5.4 Nota interna se diferencia visualmente de reply público

### T4.6 Resolución y Cierre
- [ ] T4.6.1 Cambiar status a "resolved" → solicita solución
- [ ] T4.6.2 Agregar solución → ticket status cambia a resolved
- [ ] T4.6.3 Cambiar status a "closed" → ticket se cierra
- [ ] T4.6.4 Ticket cerrado muestra fecha de cierre en panel derecho

### T4.7 Eliminación
- [ ] T4.7.1 Click "..." menu → "Delete Ticket" → confirmación
- [ ] T4.7.2 Confirmar eliminación → soft delete (no aparece en lista, sigue en DB)

---

## FASE T5: TICKET STATUS TRANSITIONS (P0)

### T5.1 Transiciones Válidas
- [ ] T5.1.1 new → assigned ✓
- [ ] T5.1.2 assigned → in_progress ✓
- [ ] T5.1.3 in_progress → pending ✓
- [ ] T5.1.4 in_progress → testing ✓
- [ ] T5.1.5 pending → in_progress ✓
- [ ] T5.1.6 testing → in_progress ✓ (regresión)
- [ ] T5.1.7 testing → resolved ✓
- [ ] T5.1.8 in_progress → resolved ✓
- [ ] T5.1.9 resolved → closed ✓
- [ ] T5.1.10 any → cancelled ✓

### T5.2 Prioridad Calculada (urgency × impact matrix)
- [ ] T5.2.1 critical × critical = 16 (P16)
- [ ] T5.2.2 critical × high = 12 (P12)
- [ ] T5.2.3 high × high = 9 (P9)
- [ ] T5.2.4 medium × medium = 4 (P4)
- [ ] T5.2.5 low × low = 1 (P1)

---

## FASE T6: PROBLEMS (P1)

### T6.1 Lista de Problemas
- [ ] T6.1.1 Navegar a /home/problems → muestra 4 stat cards + DataTable
- [ ] T6.1.2 Stat cards: Active Problems, Known Errors, Resolved This Month, Related Incidents
- [ ] T6.1.3 DataTable muestra: problem_number, title, status, priority, impact, related incidents, assigned
- [ ] T6.1.4 Search funciona
- [ ] T6.1.5 "Create Problem" button visible

### T6.2 Status Transitions
- [ ] T6.2.1 new → accepted → analysis → root_cause_identified → solution_planned → resolved → closed
- [ ] T6.2.2 Cada transición se refleja en la UI

### T6.3 Vinculación con Tickets
- [ ] T6.3.1 Vincular ticket a problema → count de "Related Incidents" incrementa
- [ ] T6.3.2 Desde ticket, se puede ver link al problema

---

## FASE T7: CHANGES (P1)

### T7.1 Lista de Cambios
- [ ] T7.1.1 Navegar a /home/changes → muestra 4 stat cards + DataTable
- [ ] T7.1.2 Stat cards: Pending Approval, Scheduled, Implementing, Completed
- [ ] T7.1.3 DataTable muestra: change_number, title, status, type, risk_level, scheduled dates, approval_status
- [ ] T7.1.4 Type badges: standard (blue), normal (gray), emergency (red)
- [ ] T7.1.5 Risk level badges: low (green), medium (yellow), high (orange), critical (red)

### T7.2 CAB Approval Workflow
- [ ] T7.2.1 Crear change → status = new
- [ ] T7.2.2 Submit for approval → status = approval_pending
- [ ] T7.2.3 Approve → status = approved
- [ ] T7.2.4 Reject → status = rejected
- [ ] T7.2.5 Emergency change → fast-track (approval post-implementation)

### T7.3 Change Types
- [ ] T7.3.1 Standard change → auto-approve
- [ ] T7.3.2 Normal change → requires CAB approval
- [ ] T7.3.3 Emergency change → fast-track

---

## FASE T8: KNOWLEDGE BASE (P1)

### T8.1 Lista de Artículos
- [ ] T8.1.1 Navegar a /home/kb → muestra category sidebar + article grid
- [ ] T8.1.2 Articles muestran: title, category badge, view count, helpful votes, updated date
- [ ] T8.1.3 Search filtra artículos por título
- [ ] T8.1.4 Category filter funciona (click categoría → filtra artículos)
- [ ] T8.1.5 "New Article" button visible

### T8.2 CRUD de Artículos
- [ ] T8.2.1 Crear artículo con título, contenido, categoría → guardado exitoso
- [ ] T8.2.2 Editar artículo → cambios se guardan
- [ ] T8.2.3 Publicar artículo (draft → published)
- [ ] T8.2.4 Archivar artículo (published → archived)
- [ ] T8.2.5 Artículo archivado no aparece en portal público

### T8.3 Feedback
- [ ] T8.3.1 Botón "Helpful" incrementa count
- [ ] T8.3.2 Botón "Not Helpful" incrementa count

---

## FASE T9: INBOX OMNICANAL (P1)

### T9.1 Vista del Inbox
- [ ] T9.1.1 Navegar a /home/inbox → muestra split view (conversations + messages)
- [ ] T9.1.2 Lista de conversaciones muestra: contact name, channel icon, last message, time, status badge
- [ ] T9.1.3 Click en conversación → muestra messages en panel derecho
- [ ] T9.1.4 Search filtra conversaciones
- [ ] T9.1.5 Filter tabs: All, Open, Pending, Resolved

### T9.2 Acciones en Conversación
- [ ] T9.2.1 Reply → mensaje outbound aparece en timeline
- [ ] T9.2.2 Assign → cambia agente asignado
- [ ] T9.2.3 Resolve → status cambia a resolved
- [ ] T9.2.4 Create Ticket → crea ticket con datos de la conversación

### T9.3 Channel Icons
- [ ] T9.3.1 Email → muestra icono de email
- [ ] T9.3.2 WhatsApp → muestra icono de WhatsApp
- [ ] T9.3.3 Web Widget → muestra icono de chat
- [ ] T9.3.4 Portal → muestra icono de portal

---

## FASE T10: SERVICE CATALOG (P2)

### T10.1 Catálogo
- [ ] T10.1.1 Navegar a /home/service-catalog → muestra service cards
- [ ] T10.1.2 Cards muestran: icon, name, description, approval requirements, delivery time
- [ ] T10.1.3 Category filter tabs funcionan
- [ ] T10.1.4 Search filtra servicios
- [ ] T10.1.5 "Request Service" button visible

---

## FASE T11: WORKFLOWS (P2)

### T11.1 Lista de Workflows
- [ ] T11.1.1 Navegar a /home/workflows → muestra workflow cards
- [ ] T11.1.2 Cards muestran: name, trigger type, status toggle, execution stats
- [ ] T11.1.3 "Create Workflow" button visible
- [ ] T11.1.4 Toggle activa/desactiva workflow

### T11.2 Workflow Builder
- [ ] T11.2.1 Click en workflow → navega a /home/workflows/[id]
- [ ] T11.2.2 Left sidebar muestra building blocks: Triggers, Conditions, Actions
- [ ] T11.2.3 Center canvas muestra nodos conectados
- [ ] T11.2.4 Right panel muestra propiedades del step seleccionado
- [ ] T11.2.5 Bottom panel muestra execution logs

---

## FASE T12: AUTOMATIONS (P2)

### T12.1 Hub de Automations
- [ ] T12.1.1 Navegar a /home/automations → muestra 4 stat cards
- [ ] T12.1.2 Stats: Active Workflows, Executions Today, Success Rate, Avg Duration
- [ ] T12.1.3 Tabs: Workflows, Business Rules, Scheduled Tasks
- [ ] T12.1.4 Cada tab muestra lista correspondiente
- [ ] T12.1.5 Search filtra items

---

## FASE T13: REPORTS Y ANALYTICS (P1)

### T13.1 Dashboard de Reports
- [ ] T13.1.1 Navegar a /home/reports → muestra 4 KPI cards
- [ ] T13.1.2 KPIs: Total Tickets, Avg Resolution Time, SLA Compliance %, Satisfaction Score
- [ ] T13.1.3 LineChart: Ticket Volume Trend visible
- [ ] T13.1.4 PieChart: Priority Distribution visible
- [ ] T13.1.5 BarChart: Tickets by Category visible
- [ ] T13.1.6 Agent Performance table visible
- [ ] T13.1.7 Date range picker funciona

### T13.2 Ticket Reports Granulares
- [ ] T13.2.1 Navegar a /home/reports/tickets → muestra métricas granulares
- [ ] T13.2.2 Card: Casos Cerrados Garantía (count + trend)
- [ ] T13.2.3 Card: Casos Cerrados Soporte
- [ ] T13.2.4 Card: Casos Nuevo Garantía
- [ ] T13.2.5 Card: Casos Nuevo Soporte
- [ ] T13.2.6 Card: Casos en Progreso Garantía
- [ ] T13.2.7 Card: Casos en Progreso Soporte
- [ ] T13.2.8 Card: Nuevos Testing Garantía
- [ ] T13.2.9 Card: Nuevos Testing Soporte
- [ ] T13.2.10 Card: Pendientes Garantía
- [ ] T13.2.11 Card: Pendientes Soporte
- [ ] T13.2.12 Card: Casos Fracaso Testing
- [ ] T13.2.13 Filtro por fecha funciona
- [ ] T13.2.14 Filtro por agente funciona
- [ ] T13.2.15 Filtro por grupo funciona

---

## FASE T14: NOTIFICATIONS (P2)

### T14.1 Centro de Notificaciones
- [ ] T14.1.1 Navegar a /home/notifications → muestra lista de notificaciones
- [ ] T14.1.2 Header muestra unread count
- [ ] T14.1.3 Filter tabs: All, Unread, Tickets, Changes, SLA Alerts
- [ ] T14.1.4 Cada notificación muestra: type icon, title, body, time ago
- [ ] T14.1.5 Mark as read/unread funciona
- [ ] T14.1.6 "Mark All as Read" button funciona

### T14.2 Notificaciones en Topbar
- [ ] T14.2.1 Bell icon muestra badge con unread count
- [ ] T14.2.2 Click bell → navega a /home/notifications

---

## FASE T15: PROJECTS (P2)

### T15.1 Lista de Proyectos
- [ ] T15.1.1 Navegar a /home/projects → muestra 4 stat cards + project cards
- [ ] T15.1.2 Stats: Active, Completed, Total Tasks, Avg Progress
- [ ] T15.1.3 Project cards muestran: name, progress bar, team avatars, budget, dates, status badge
- [ ] T15.1.4 "Create Project" button visible
- [ ] T15.1.5 Search filtra proyectos

---

## FASE T16: ASSETS (P2)

### T16.1 Inventario de Assets
- [ ] T16.1.1 Navegar a /home/assets → muestra 4 stat cards + DataTable
- [ ] T16.1.2 Stats: Total Assets, In Use, Available, Maintenance
- [ ] T16.1.3 DataTable: asset_tag, name, type, assignee, status, location, purchase_date
- [ ] T16.1.4 Search funciona
- [ ] T16.1.5 "Add Asset" button visible
- [ ] T16.1.6 Status filter funciona

---

## FASE T17: SETTINGS (P1)

### T17.1 General Settings
- [ ] T17.1.1 Navegar a /home/settings → muestra left nav + right panel
- [ ] T17.1.2 Left nav muestra 12+ sections (General, Agents, Groups, Profiles, Categories, SLA, Rules, Calendars, AI, Channels, Partners, Webhooks)
- [ ] T17.1.3 General form muestra: company name, timezone, language, ticket prefix
- [ ] T17.1.4 Editar company name → save → refresh → cambio persiste

### T17.2 Agents Management
- [ ] T17.2.1 Click "Users & Agents" → muestra lista de agentes
- [ ] T17.2.2 Lista muestra: name, email, role, status

### T17.3 Groups Management
- [ ] T17.3.1 Click "Groups & Teams" → muestra lista de grupos

### T17.4 Categories
- [ ] T17.4.1 Click "Categories" → muestra lista de categorías
- [ ] T17.4.2 Crear categoría → aparece en lista

### T17.5 SLA Configuration
- [ ] T17.5.1 Click "SLA/OLA" → muestra lista de SLAs
- [ ] T17.5.2 Crear SLA con tiempos por prioridad

### T17.6 AI Settings
- [ ] T17.6.1 Navegar a /home/settings/ai → muestra AI configuration
- [ ] T17.6.2 AI Usage metrics visible (queries used / limit)
- [ ] T17.6.3 Agent toggles funcionan (enable/disable)
- [ ] T17.6.4 Model selector visible (gpt-4o-mini, etc.)
- [ ] T17.6.5 Confidence threshold slider funciona
- [ ] T17.6.6 Knowledge sources section visible

### T17.7 Channels Configuration
- [ ] T17.7.1 Navegar a /home/settings/channels → muestra channel list
- [ ] T17.7.2 "Add Channel" button visible
- [ ] T17.7.3 Channel types: Email IMAP, Office 365, WhatsApp, Web Widget

### T17.8 Partners Management
- [ ] T17.8.1 Navegar a /home/settings/partners → muestra partner list
- [ ] T17.8.2 Type badges: provider, partner, vendor, subcontractor
- [ ] T17.8.3 "Add Partner" button visible

### T17.9 Webhooks
- [ ] T17.9.1 Navegar a /home/settings/webhooks → muestra webhook list + logs
- [ ] T17.9.2 Tabs: Webhooks, Logs
- [ ] T17.9.3 "Add Webhook" button visible
- [ ] T17.9.4 Webhook card muestra: URL, events, direction, secret (show/hide)

---

## FASE T18: PORTAL DEL CLIENTE (P1)

### T18.1 Portal Home
- [ ] T18.1.1 Navegar a /portal → muestra hero section con search
- [ ] T18.1.2 Gradient background visible
- [ ] T18.1.3 "Browse by Category" grid visible (4 cards)
- [ ] T18.1.4 "Popular Articles" section visible
- [ ] T18.1.5 Quick Actions: "Create Ticket", "Contact Support" buttons

### T18.2 Portal Chat (AI Assistant)
- [ ] T18.2.1 Navegar a /portal/chat → muestra chat interface
- [ ] T18.2.2 Enviar mensaje → AI responde (streaming)
- [ ] T18.2.3 Suggestion chips visibles
- [ ] T18.2.4 Después de 4+ mensajes → banner de escalación visible

---

## FASE T19: AI AGENTS (P1)

### T19.1 AI Classification
- [ ] T19.1.1 API POST /api/ai/classify con { title: "Server down", description: "..." } → retorna tipo + urgencia + confianza
- [ ] T19.1.2 Confidence score > 0 y <= 100
- [ ] T19.1.3 Type es uno de: incident, request, warranty, support, backlog
- [ ] T19.1.4 Urgency es uno de: low, medium, high, critical

### T19.2 AI Suggestions
- [ ] T19.2.1 API POST /api/ai/suggest con { title, description } → retorna array de sugerencias
- [ ] T19.2.2 Cada sugerencia tiene: title, description, confidence, source

### T19.3 AI Summarize
- [ ] T19.3.1 API POST /api/ai/summarize con { ticketId } → retorna resumen
- [ ] T19.3.2 Resumen es texto coherente sobre el ticket

### T19.4 AI Chat Streaming
- [ ] T19.4.1 API POST /api/ai/chat con messages → retorna stream
- [ ] T19.4.2 Stream completa sin errores

---

## FASE T20: REST API (P2)

### T20.1 Tickets API
- [ ] T20.1.1 GET /api/v1/tickets → retorna lista de tickets
- [ ] T20.1.2 POST /api/v1/tickets con body válido → crea ticket
- [ ] T20.1.3 GET /api/v1/tickets/[id] → retorna ticket individual
- [ ] T20.1.4 PATCH /api/v1/tickets/[id] → actualiza ticket
- [ ] T20.1.5 DELETE /api/v1/tickets/[id] → soft delete ticket
- [ ] T20.1.6 Request sin API key → 401 Unauthorized
- [ ] T20.1.7 Request con API key inválida → 401 Unauthorized

---

## FASE T21: SLA ENGINE (P1)

### T21.1 SLA Indicators
- [ ] T21.1.1 Ticket con SLA asignado muestra SLAIndicator en lista y detalle
- [ ] T21.1.2 SLA verde: lejos del breach
- [ ] T21.1.3 SLA amarillo: próximo al breach
- [ ] T21.1.4 SLA rojo: breached

### T21.2 SLA Calculation
- [ ] T21.2.1 Al crear ticket con SLA, sla_due_date se calcula automáticamente
- [ ] T21.2.2 El cálculo respeta business hours (excluye noches y fines de semana)

---

## FASE T22: MULTI-TENANCY (P0)

### T22.1 Aislamiento de Datos
- [ ] T22.1.1 Login como Admin Tenant A → solo ve tickets del Tenant A
- [ ] T22.1.2 Login como Admin Tenant B → solo ve tickets del Tenant B
- [ ] T22.1.3 Ticket creado en Tenant A NO aparece en Tenant B
- [ ] T22.1.4 Agentes de Tenant A NO aparecen en dropdowns de Tenant B
- [ ] T22.1.5 Categorías de Tenant A NO aparecen en Tenant B
- [ ] T22.1.6 KB Articles de Tenant A NO aparecen en Tenant B

### T22.2 RLS Validation
- [ ] T22.2.1 API call con token de Tenant A solo retorna datos de Tenant A
- [ ] T22.2.2 Insert con tenant_id de otro tenant es rechazado por RLS

---

## FASE T23: ITSM COMPONENTS (P2)

### T23.1 StatusBadge
- [ ] T23.1.1 new → blue badge
- [ ] T23.1.2 assigned → violet badge
- [ ] T23.1.3 in_progress → amber badge
- [ ] T23.1.4 pending → gray badge
- [ ] T23.1.5 testing → indigo badge
- [ ] T23.1.6 resolved → emerald badge
- [ ] T23.1.7 closed → green badge
- [ ] T23.1.8 cancelled → red badge

### T23.2 PriorityBadge
- [ ] T23.2.1 critical → red badge
- [ ] T23.2.2 high → orange badge
- [ ] T23.2.3 medium → yellow badge
- [ ] T23.2.4 low → green badge

### T23.3 ChannelIcon
- [ ] T23.3.1 email → Mail icon
- [ ] T23.3.2 whatsapp → MessageCircle icon
- [ ] T23.3.3 phone → Phone icon
- [ ] T23.3.4 portal → Globe icon
- [ ] T23.3.5 web_widget → MessageSquare icon

---

## FASE T24: E2E FLUJOS COMPLETOS (P0)

### T24.1 Flujo Completo: Ticket Lifecycle
```
Crear Ticket → AI Triage → Auto-Assign → Agent Works → Add Followup →
Add Solution → Resolve → Close → Satisfaction Survey
```
- [ ] T24.1.1 Crear ticket "Email server not sending" (incident, critical, high)
- [ ] T24.1.2 Verificar AI clasificó automáticamente como incident
- [ ] T24.1.3 Verificar ticket asignado a agente/grupo
- [ ] T24.1.4 Cambiar status a in_progress
- [ ] T24.1.5 Agregar followup público: "Investigating the issue..."
- [ ] T24.1.6 Agregar nota interna: "Found DNS misconfiguration"
- [ ] T24.1.7 Agregar solución: "Fixed DNS records. Email is working now."
- [ ] T24.1.8 Cambiar status a resolved
- [ ] T24.1.9 Cambiar status a closed
- [ ] T24.1.10 Verificar fechas en panel derecho: created, first_response, resolved, closed

### T24.2 Flujo Completo: Problem → Tickets
```
Detectar patrón → Crear Problem → Link Tickets → Root Cause → Solution → Close
```
- [ ] T24.2.1 Crear problema: "Recurring DNS failures"
- [ ] T24.2.2 Vincular 2 tickets al problema
- [ ] T24.2.3 Status → analysis → root_cause_identified
- [ ] T24.2.4 Documentar root cause: "DNS server caching stale records"
- [ ] T24.2.5 Status → solution_planned → resolved → closed

### T24.3 Flujo Completo: Change Management
```
Crear Change → Evaluation → CAB Approval → Schedule → Implement → Test → Close
```
- [ ] T24.3.1 Crear change: "Upgrade DNS server"
- [ ] T24.3.2 Submit for approval
- [ ] T24.3.3 Approve change
- [ ] T24.3.4 Status → scheduled → in_progress → testing → implemented → closed

### T24.4 Flujo Completo: Inbox → Ticket
```
Message arrives → AI classifies → Create Ticket → Agent resolves → Reply to customer
```
- [ ] T24.4.1 Verificar conversación en inbox
- [ ] T24.4.2 Click "Create Ticket" desde conversación
- [ ] T24.4.3 Verificar ticket creado con datos de la conversación
- [ ] T24.4.4 Resolver ticket
- [ ] T24.4.5 Reply en conversación

### T24.5 Flujo Completo: Portal → AI → Ticket
```
User visits portal → Chats with AI → AI can't resolve → Create Ticket → Track in portal
```
- [ ] T24.5.1 Navegar a /portal
- [ ] T24.5.2 Ir a /portal/chat
- [ ] T24.5.3 Chatear con AI: "My VPN is not working"
- [ ] T24.5.4 AI responde con sugerencias
- [ ] T24.5.5 Crear ticket desde portal

---

## FASE T25: CRON JOBS (P2)

### T25.1 SLA Check
- [ ] T25.1.1 GET /api/cron/sla-check → retorna 200
- [ ] T25.1.2 Tickets con SLA breached se marcan como sla_breached=true

### T25.2 Metrics Snapshot
- [ ] T25.2.1 GET /api/cron/metrics-snapshot → retorna 200
- [ ] T25.2.2 daily_metrics table tiene nueva entrada

### T25.3 Notification Processor
- [ ] T25.3.1 GET /api/cron/notification-processor → retorna 200

---

## FASE T26: WEBHOOKS (P2)

### T26.1 Inbound Webhooks
- [ ] T26.1.1 POST /api/v1/inbox/webhooks/email con payload → crea conversación
- [ ] T26.1.2 POST /api/v1/inbox/webhooks/whatsapp con payload + signature → procesa

### T26.2 Outbound Webhooks
- [ ] T26.2.1 Configurar webhook en settings
- [ ] T26.2.2 Crear ticket → webhook se dispara
- [ ] T26.2.3 Webhook log muestra: status, duration, response

---

## PROGRESO GLOBAL

```
FASE T1:  [ ] Auth & Sesión          ░░░░░░░░░░ 0%   (14 tests)
FASE T2:  [ ] Layout & Nav           ░░░░░░░░░░ 0%   (22 tests)
FASE T3:  [ ] Dashboard              ░░░░░░░░░░ 0%   (14 tests)
FASE T4:  [ ] Tickets CRUD           ░░░░░░░░░░ 0%   (45 tests)
FASE T5:  [ ] Status Transitions     ░░░░░░░░░░ 0%   (15 tests)
FASE T6:  [ ] Problems               ░░░░░░░░░░ 0%   (9 tests)
FASE T7:  [ ] Changes                ░░░░░░░░░░ 0%   (13 tests)
FASE T8:  [ ] Knowledge Base         ░░░░░░░░░░ 0%   (11 tests)
FASE T9:  [ ] Inbox                  ░░░░░░░░░░ 0%   (12 tests)
FASE T10: [ ] Service Catalog        ░░░░░░░░░░ 0%   (5 tests)
FASE T11: [ ] Workflows              ░░░░░░░░░░ 0%   (9 tests)
FASE T12: [ ] Automations            ░░░░░░░░░░ 0%   (5 tests)
FASE T13: [ ] Reports                ░░░░░░░░░░ 0%   (22 tests)
FASE T14: [ ] Notifications          ░░░░░░░░░░ 0%   (8 tests)
FASE T15: [ ] Projects               ░░░░░░░░░░ 0%   (5 tests)
FASE T16: [ ] Assets                 ░░░░░░░░░░ 0%   (6 tests)
FASE T17: [ ] Settings               ░░░░░░░░░░ 0%   (28 tests)
FASE T18: [ ] Portal                 ░░░░░░░░░░ 0%   (9 tests)
FASE T19: [ ] AI Agents              ░░░░░░░░░░ 0%   (10 tests)
FASE T20: [ ] REST API               ░░░░░░░░░░ 0%   (7 tests)
FASE T21: [ ] SLA Engine             ░░░░░░░░░░ 0%   (5 tests)
FASE T22: [ ] Multi-Tenancy          ░░░░░░░░░░ 0%   (8 tests)
FASE T23: [ ] ITSM Components        ░░░░░░░░░░ 0%   (17 tests)
FASE T24: [ ] E2E Flujos             ░░░░░░░░░░ 0%   (24 tests)
FASE T25: [ ] Cron Jobs              ░░░░░░░░░░ 0%   (5 tests)
FASE T26: [ ] Webhooks               ░░░░░░░░░░ 0%   (5 tests)

Total: 0/372 completados (0%)
```

---

## ORDEN DE EJECUCIÓN

```
PRIORIDAD P0 (EJECUTAR PRIMERO):
  1. T1  (Auth)           → prerrequisito para todo
  2. T2  (Layout/Nav)     → prerrequisito para navegación
  3. T22 (Multi-Tenancy)  → seguridad base de datos
  4. T4  (Tickets CRUD)   → módulo central
  5. T5  (Transitions)    → lógica core

PRIORIDAD P1 (CORE ITSM):
  6. T3  (Dashboard)      → vista principal
  7. T6  (Problems)       → ITIL
  8. T7  (Changes)        → ITIL
  9. T8  (KB)             → soporte
  10. T9  (Inbox)         → omnicanal
  11. T13 (Reports)       → analytics
  12. T17 (Settings)      → administración
  13. T18 (Portal)        → cliente
  14. T19 (AI)            → inteligencia
  15. T21 (SLA)           → cumplimiento

PRIORIDAD P2 (COMPLEMENTARIO):
  16. T10 (Catalog)       → servicios
  17. T11 (Workflows)     → automatización
  18. T12 (Automations)   → hub
  19. T14 (Notifications) → alertas
  20. T15 (Projects)      → gestión
  21. T16 (Assets)        → inventario
  22. T20 (REST API)      → integraciones
  23. T23 (Components)    → visual
  24. T25 (Crons)         → background
  25. T26 (Webhooks)      → integración

PRIORIDAD P0 (VALIDACIÓN FINAL):
  26. T24 (E2E Flujos)    → end-to-end completo
```

---

## CRITERIOS DE APROBACIÓN

| Nivel | Criterio |
|-------|----------|
| **APROBADO** | 100% P0 + 95% P1 + 80% P2 pasando |
| **APROBADO CON OBSERVACIONES** | 100% P0 + 80% P1 + 50% P2 pasando |
| **RECHAZADO** | Cualquier P0 fallando |

---

## DEFECTOS ENCONTRADOS

| ID | Test | Severidad | Descripción | Fix | Status |
|----|------|-----------|-------------|-----|--------|
| - | - | - | - | - | - |

---

*Documento vivo. Se actualiza con cada sesión de testing.*
