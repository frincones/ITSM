# PRD — ITSM AI-First Platform

**Producto:** ITSM AI Platform
**Versión:** 1.0
**Fecha:** 2026-03-26
**Autor:** Product Management
**Stack:** Next.js 15 + Vercel + Supabase + AI SDK
**Estado:** Draft

---

## 1. Visión del Producto

Construir la plataforma de IT Service Management **AI-first** más moderna del mercado: una solución SaaS multi-tenant que reemplaza herramientas legacy como GLPI, ServiceNow y Jira Service Management con una experiencia nativa en inteligencia artificial, agentes autónomos y automatización omnicanal.

**Diferenciadores clave:**
- Agentes de AI autónomos integrados en cada flujo ITSM (no un chatbot añadido, sino AI como capa central)
- Portal personalizado por cliente con asistente AI que analiza repositorios, documentación y HUs del cliente
- Tipificación automática de casos (garantía vs soporte vs backlog vs incidente vs request)
- Arquitectura multi-agente, multi-tenant, multi-proveedor, multi-aliado
- Inbox omnicanal unificado (Email, WhatsApp, Web, Office 365)
- Motor de workflows/automatización visual
- Capa de integración extensible

---

## 2. Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 15)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  Portal   │  │  Agent   │  │  Admin   │  │   Customer    │   │
│  │  Técnico  │  │  Console │  │  Panel   │  │   Portal      │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     API LAYER (Next.js API Routes)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  REST API │  │  AI SDK  │  │ Webhooks │  │  Realtime WS  │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     AI ORCHESTRATION LAYER                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Triage    │  │ Support  │  │ Routing  │  │  Knowledge    │   │
│  │ Agent     │  │ Agent    │  │ Agent    │  │  Agent (RAG)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     BACKEND SERVICES                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Workflow  │  │ Rules    │  │ SLA      │  │ Notification  │   │
│  │ Engine    │  │ Engine   │  │ Engine   │  │ Engine        │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     DATA LAYER (Supabase)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ PostgreSQL│  │ Auth     │  │ Storage  │  │  Realtime     │   │
│  │ + pgvector│  │ (RLS)    │  │ (S3)     │  │  (WebSocket)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     INTEGRATION LAYER                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Email    │  │ WhatsApp │  │ Office   │  │  Custom       │   │
│  │ SMTP/IMAP│  │ Cloud API│  │ 365 Graph│  │  Webhooks     │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Módulos del Producto

---

### 3.1 HELPDESK / TICKETING (Mesa de Ayuda)

#### 3.1.1 Tickets (Incidentes y Solicitudes)

**Descripción:** Módulo central para gestionar incidentes, solicitudes de servicio y cualquier caso reportado por usuarios finales o detectado por sistemas de monitoreo.

**Entidades:**

| Entidad | Tabla Supabase | Descripción |
|---------|---------------|-------------|
| Ticket | `tickets` | Registro principal del caso |
| TicketTask | `ticket_tasks` | Tareas asignables dentro de un ticket |
| TicketFollowup | `ticket_followups` | Comentarios y seguimientos |
| TicketSolution | `ticket_solutions` | Solución documentada |
| TicketValidation | `ticket_validations` | Pasos de aprobación/validación |
| TicketCost | `ticket_costs` | Registro de costos (horas, materiales) |
| TicketSatisfaction | `ticket_satisfactions` | Encuesta de satisfacción post-cierre |
| TicketTemplate | `ticket_templates` | Plantillas predefinidas |
| TicketRecurrent | `ticket_recurrents` | Tickets recurrentes programados |
| TicketAttachment | `ticket_attachments` | Evidencia adjunta (archivos, screenshots) |
| TicketRelation | `ticket_relations` | Relaciones entre tickets (duplicado, relacionado, padre-hijo) |

**Campos del Ticket:**

```
id                  uuid PK
tenant_id           uuid FK → tenants.id (aislamiento multi-tenant)
ticket_number       text UNIQUE (auto-generado: TENANT-PREFIX-YYYYMM-NNNNN)
title               text NOT NULL
description         text NOT NULL
description_html    text (rich text)

-- Tipificación AI
type                enum: 'incident' | 'request' | 'warranty' | 'support' | 'backlog'
ai_classification   jsonb (confidence scores por tipo)
ai_classified_at    timestamptz
ai_classified_by    text (modelo usado)

-- Estado y workflow
status              enum: 'new' | 'assigned' | 'in_progress' | 'pending' | 'testing' |
                          'resolved' | 'closed' | 'cancelled'
urgency             enum: 'low' | 'medium' | 'high' | 'critical'
impact              enum: 'low' | 'medium' | 'high' | 'critical'
priority            integer (calculado: urgency × impact matrix)

-- Asignación
requester_id        uuid FK → contacts.id
requester_email     text
assigned_agent_id   uuid FK → agents.id
assigned_group_id   uuid FK → groups.id
escalation_level    integer DEFAULT 0

-- SLA
sla_id              uuid FK → slas.id
ola_id              uuid FK → olas.id
sla_due_date        timestamptz
ola_due_date        timestamptz
sla_breached        boolean DEFAULT false
ola_breached        boolean DEFAULT false

-- Categorización
category_id         uuid FK → categories.id
subcategory_id      uuid FK → categories.id
service_id          uuid FK → services.id

-- Canal de origen
channel             enum: 'portal' | 'email' | 'whatsapp' | 'phone' | 'api' | 'ai_agent' | 'web_widget'
inbox_message_id    uuid FK → inbox_messages.id

-- AI Context
ai_summary          text (resumen generado por AI)
ai_suggested_solution text (solución sugerida por AI)
ai_evidence         jsonb (evidencia recolectada por agente AI)
ai_repository_refs  jsonb (referencias a código/docs del cliente)

-- Metadata
tags                text[]
custom_fields       jsonb
internal_notes      text

-- Auditoría
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
resolved_at         timestamptz
closed_at           timestamptz
first_response_at   timestamptz
created_by          uuid FK → auth.users
updated_by          uuid FK → auth.users
```

**Workflow del Ticket:**

```
                                    ┌─────────────┐
                                    │   CREACIÓN   │
                                    │  (Manual /   │
                                    │  AI Agent /  │
                                    │  Email /     │
                                    │  WhatsApp)   │
                                    └──────┬───────┘
                                           │
                                    ┌──────▼───────┐
                                    │     NEW      │
                                    │  AI Triage   │──── Tipifica: warranty/support/
                                    │  Agent       │     backlog/incident/request
                                    └──────┬───────┘
                                           │
                              ┌─────── Rules Engine ───────┐
                              │  Auto-asigna agente/grupo  │
                              │  Aplica SLA/OLA            │
                              │  Categoriza                │
                              └─────────┬──────────────────┘
                                        │
                                 ┌──────▼───────┐
                                 │   ASSIGNED   │
                                 └──────┬───────┘
                                        │
                                 ┌──────▼───────┐
                                 │ IN_PROGRESS  │◄──── Tareas (TicketTask)
                                 │              │◄──── Seguimientos (TicketFollowup)
                                 │              │◄──── AI Agent asiste al técnico
                                 └──────┬───────┘
                                        │
                              ┌─────────┤
                              │         │
                       ┌──────▼──┐  ┌───▼─────────┐
                       │ PENDING │  │   TESTING   │
                       │(espera  │  │ (validación │
                       │ cliente)│  │  técnica)   │
                       └──────┬──┘  └───┬─────────┘
                              │         │
                              └────┬────┘
                                   │
                            ┌──────▼───────┐
                            │   RESOLVED   │◄──── TicketSolution
                            └──────┬───────┘
                                   │
                         ┌─────────┤ (si requiere validación)
                         │         │
                  ┌──────▼──┐  ┌───▼──────┐
                  │VALIDATION│  │  CLOSED  │
                  │(aprobac.)│  │          │
                  └──────┬──┘  └───┬──────┘
                         │         │
                         └────┬────┘
                              │
                       ┌──────▼───────┐
                       │ SATISFACTION │
                       │   SURVEY     │
                       └──────────────┘
```

**Funcionalidades AI en Tickets:**

| Feature | Descripción |
|---------|-------------|
| Auto-Triage | Clasifica automáticamente el tipo (garantía, soporte, backlog, incidente, request) analizando título, descripción, adjuntos y contexto del cliente |
| Smart Routing | Asigna al agente/grupo más adecuado basándose en habilidades, carga de trabajo y SLA |
| Solution Suggestion | Busca en la base de conocimiento, tickets previos y documentación del cliente para sugerir soluciones |
| Evidence Collection | El agente AI recolecta y organiza toda la evidencia necesaria antes de escalar |
| Auto-Summary | Genera resúmenes ejecutivos del ticket para handoffs entre agentes |
| Sentiment Analysis | Analiza el sentimiento del usuario para priorizar tickets con usuarios frustrados |
| Duplicate Detection | Detecta tickets duplicados o relacionados antes de crear uno nuevo |
| Repository Analysis | Analiza repos del cliente (GitHub/GitLab) para correlacionar issues con código |
| Document Analysis | Analiza documentación, transcripciones, historias de usuario (HUs) adjuntas |

---

#### 3.1.2 Problemas (Problem Management)

**Descripción:** Gestión de problemas que subyacen a múltiples incidentes. Identificación de causa raíz y soluciones permanentes.

**Entidades:**

| Entidad | Tabla | Descripción |
|---------|-------|-------------|
| Problem | `problems` | Registro del problema |
| ProblemTask | `problem_tasks` | Tareas de investigación |
| ProblemTicketLink | `problem_ticket_links` | Tickets vinculados al problema |
| ProblemCost | `problem_costs` | Costos de investigación |

**Campos principales del Problem:**

```
id                  uuid PK
tenant_id           uuid FK → tenants.id
problem_number      text UNIQUE
title               text NOT NULL
description         text
status              enum: 'new' | 'accepted' | 'analysis' | 'root_cause_identified' |
                          'solution_planned' | 'resolved' | 'closed'
urgency             enum: 'low' | 'medium' | 'high' | 'critical'
impact              enum: 'low' | 'medium' | 'high' | 'critical'
priority            integer
root_cause          text
root_cause_ai       text (análisis de causa raíz por AI)
workaround          text
solution            text
category_id         uuid FK
assigned_agent_id   uuid FK
assigned_group_id   uuid FK
affected_tickets    integer (count de tickets vinculados)
ai_pattern_detected jsonb (patrones detectados por AI entre tickets)
created_at          timestamptz
updated_at          timestamptz
resolved_at         timestamptz
```

**AI en Problem Management:**
- Detección automática de patrones entre tickets para proponer creación de problemas
- Análisis de causa raíz asistido por AI
- Correlación con cambios recientes (Change Management) para identificar regresiones

---

#### 3.1.3 Cambios (Change Management)

**Descripción:** Gestión formal de cambios en infraestructura y servicios con workflow de aprobación (CAB).

**Entidades:**

| Entidad | Tabla | Descripción |
|---------|-------|-------------|
| Change | `changes` | Registro del cambio |
| ChangeTask | `change_tasks` | Tareas del plan de implementación |
| ChangeValidation | `change_validations` | Pasos de aprobación (CAB) |
| ChangeRollbackPlan | `change_rollback_plans` | Plan de rollback |
| ChangeCost | `change_costs` | Costos del cambio |
| RecurrentChange | `recurrent_changes` | Cambios programados recurrentes |

**Campos principales del Change:**

```
id                  uuid PK
tenant_id           uuid FK → tenants.id
change_number       text UNIQUE
title               text NOT NULL
description         text
status              enum: 'new' | 'evaluation' | 'approval_pending' | 'approved' |
                          'scheduled' | 'in_progress' | 'testing' | 'implemented' |
                          'rolled_back' | 'closed' | 'rejected'
change_type         enum: 'standard' | 'normal' | 'emergency'
risk_level          enum: 'low' | 'medium' | 'high' | 'critical'
impact_analysis     text
rollback_plan       text
implementation_plan text
scheduled_start     timestamptz
scheduled_end       timestamptz
actual_start        timestamptz
actual_end          timestamptz
category_id         uuid FK
assigned_agent_id   uuid FK
assigned_group_id   uuid FK
approval_status     enum: 'pending' | 'approved' | 'rejected'
ai_risk_assessment  jsonb (evaluación de riesgo por AI)
ai_impact_analysis  jsonb (análisis de impacto por AI)
created_at          timestamptz
updated_at          timestamptz
```

**Workflow de Aprobación (CAB):**

```
Change creado → Evaluación → Solicitud de Aprobación
  → CAB Review (N aprobadores configurables)
    → Aprobado → Programado → En Ejecución → Testing → Implementado
    → Rechazado → Cerrado
    → Emergency → Fast-track (aprobación post-implementación)
```

---

#### 3.1.4 SLA / OLA Engine

**Descripción:** Motor de acuerdos de nivel de servicio con escalación automática y métricas de cumplimiento.

**Entidades:**

| Entidad | Tabla | Descripción |
|---------|-------|-------------|
| SLA | `slas` | Definición del acuerdo de servicio |
| SLALevel | `sla_levels` | Niveles de escalación |
| SLALevelAction | `sla_level_actions` | Acciones por nivel |
| OLA | `olas` | Acuerdos operativos internos |
| OLALevel | `ola_levels` | Niveles de escalación OLA |
| OLALevelAction | `ola_level_actions` | Acciones por nivel OLA |

**Campos SLA:**

```
id                  uuid PK
tenant_id           uuid FK
name                text NOT NULL
description         text
type                enum: 'time_to_first_response' | 'time_to_resolution'
calendar_id         uuid FK → calendars.id (horas laborales)
-- Tiempos por prioridad (en minutos)
target_critical     integer
target_high         integer
target_medium       integer
target_low          integer
is_active           boolean DEFAULT true
created_at          timestamptz
```

**Campos SLA Level (escalación):**

```
id                  uuid PK
sla_id              uuid FK → slas.id
name                text
execution_time      integer (minutos antes/después del breach)
is_before_breach    boolean (true = antes del breach, false = después)
actions             jsonb[] (notificar, reasignar, cambiar prioridad, etc.)
```

**Motor de SLA - Lógica:**
1. Al crear/actualizar un ticket, se calcula `sla_due_date` basándose en prioridad + calendario laboral
2. Un cron job (Supabase pg_cron o Vercel Cron) evalúa cada minuto los tickets activos
3. Cuando se acerca al breach (según SLA Levels), ejecuta acciones: notificación, reasignación, escalación
4. Registra métricas: `first_response_time`, `resolution_time`, `sla_met` (boolean)

---

#### 3.1.5 Catálogo de Servicios

**Descripción:** Portal de autoservicio donde los usuarios finales pueden solicitar servicios mediante formularios dinámicos. El agente AI guía al usuario antes de crear un ticket.

**Entidades:**

| Entidad | Tabla | Descripción |
|---------|-------|-------------|
| ServiceCatalog | `service_catalogs` | Categorías del catálogo |
| ServiceItem | `service_items` | Servicios disponibles |
| Form | `forms` | Formularios dinámicos |
| FormSection | `form_sections` | Secciones del formulario |
| FormQuestion | `form_questions` | Preguntas/campos |
| FormSubmission | `form_submissions` | Envíos del formulario |
| FormDestination | `form_destinations` | Enrutamiento del envío |

**Flujo con AI Agent:**

```
Usuario accede al portal
  → AI Agent saluda y pregunta en qué puede ayudar
  → Usuario describe su problema en lenguaje natural
  → AI Agent:
      1. Busca en KB, docs y repos del cliente
      2. Si encuentra solución → la presenta al usuario
      3. Si NO puede resolver:
         a. Recolecta evidencia (screenshots, logs, pasos)
         b. Tipifica automáticamente (warranty/support/incident/request)
         c. Crea ticket con toda la info y contexto
         d. Notifica al equipo técnico
```

---

### 3.2 AI AGENTS LAYER (Multi-Agente)

#### 3.2.1 Arquitectura Multi-Agente

**Descripción:** Sistema de agentes AI especializados que operan de forma autónoma y coordinada en todos los flujos ITSM.

**Agentes:**

| Agente | Rol | Herramientas |
|--------|-----|-------------|
| **Triage Agent** | Clasifica, tipifica y prioriza tickets entrantes | Acceso a KB, historial, reglas de negocio |
| **Support Agent** | Asiste al usuario final en el portal del cliente | RAG sobre repos, docs, KB; crea tickets |
| **Resolution Agent** | Asiste al técnico con sugerencias de solución | Acceso a tickets similares, KB, docs técnicos |
| **Routing Agent** | Asigna tickets al agente/grupo óptimo | Skills matrix, carga de trabajo, SLA |
| **Escalation Agent** | Monitorea SLAs y ejecuta escalaciones | SLA engine, reglas de escalación |
| **Analytics Agent** | Genera insights y reportes bajo demanda | Acceso a métricas, dashboards |
| **Quality Agent** | Evalúa calidad de resoluciones y detecta patrones | Historial de tickets, satisfaction scores |
| **Inbox Agent** | Procesa mensajes omnicanal y los convierte en tickets | Email parser, WhatsApp API, NLP |

**Stack AI:**
- **LLM:** Claude API (Anthropic) como modelo principal
- **Embeddings:** Voyage AI o OpenAI Embeddings para RAG
- **Vector Store:** pgvector (extensión de Supabase PostgreSQL)
- **Orchestration:** Vercel AI SDK con tool calling
- **Agent Framework:** Claude Agent SDK para agentes complejos

**Tabla de Agentes AI:**

```sql
-- Configuración de agentes AI por tenant
ai_agents:
  id                  uuid PK
  tenant_id           uuid FK
  agent_type          enum: 'triage' | 'support' | 'resolution' | 'routing' |
                            'escalation' | 'analytics' | 'quality' | 'inbox'
  name                text
  system_prompt       text (prompt personalizable por tenant)
  model               text DEFAULT 'claude-sonnet-4-6'
  temperature         float DEFAULT 0.3
  tools_enabled       text[] (herramientas habilitadas)
  knowledge_sources   jsonb (repos, docs, URLs a indexar)
  is_active           boolean DEFAULT true
  config              jsonb (configuración adicional)
  created_at          timestamptz
```

**Tabla de Knowledge Base para RAG:**

```sql
-- Documentos indexados para RAG
knowledge_documents:
  id                  uuid PK
  tenant_id           uuid FK
  source_type         enum: 'kb_article' | 'repository' | 'document' | 'transcript' |
                            'user_story' | 'webpage' | 'ticket_solution'
  source_id           text (referencia al documento original)
  source_url          text
  title               text
  content             text
  content_chunks      text[] (chunks para embedding)
  metadata            jsonb
  last_synced_at      timestamptz
  created_at          timestamptz

-- Embeddings vectoriales
knowledge_embeddings:
  id                  uuid PK
  document_id         uuid FK → knowledge_documents.id
  tenant_id           uuid FK
  chunk_index         integer
  chunk_text          text
  embedding           vector(1536)
  metadata            jsonb
  created_at          timestamptz

-- Índice para búsqueda vectorial
CREATE INDEX ON knowledge_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 3.2.2 Portal del Cliente con AI Assistant

**Descripción:** Cada cliente (tenant) obtiene un portal personalizado con un asistente AI que conoce su entorno.

**Funcionalidades:**

1. **Onboarding del Conocimiento:**
   - Conectar repositorios (GitHub, GitLab, Bitbucket)
   - Indexar documentación (Confluence, Notion, Google Docs)
   - Indexar transcripciones y HUs
   - Sincronización periódica automática

2. **Conversación Inteligente:**
   - Chat en lenguaje natural
   - El AI busca en toda la base de conocimiento del cliente
   - Muestra fuentes y referencias
   - Escala a ticket si no puede resolver

3. **Recolección de Evidencia:**
   - Solicita screenshots, logs, pasos de reproducción
   - Analiza imágenes y archivos adjuntos
   - Genera un resumen estructurado del caso

4. **Personalización por Tenant:**
   - Prompt system personalizable
   - Tono y idioma configurables
   - Branding del portal (logo, colores, dominio custom)

---

### 3.3 INBOX OMNICANAL

**Descripción:** Sistema de inbox unificado que recibe y gestiona mensajes de múltiples canales, similar a Chatwoot. Cada mensaje puede convertirse en ticket o vincularse a uno existente.

#### 3.3.1 Canales Soportados

| Canal | Integración | Protocolo |
|-------|------------|-----------|
| Email (genérico) | IMAP/SMTP | Polling + webhooks |
| Office 365 | Microsoft Graph API | OAuth2 + Webhooks |
| Gmail / Google Workspace | Gmail API | OAuth2 + Push notifications |
| WhatsApp Business | WhatsApp Cloud API (Meta) | Webhooks |
| Web Widget | Embeddable chat widget | WebSocket (Supabase Realtime) |
| API | REST API directa | HTTP |
| Web Form | Portal del cliente | HTTP POST |

#### 3.3.2 Entidades del Inbox

```sql
-- Canales configurados por tenant
inbox_channels:
  id                  uuid PK
  tenant_id           uuid FK
  channel_type        enum: 'email_imap' | 'email_office365' | 'email_gmail' |
                            'whatsapp' | 'web_widget' | 'api' | 'web_form'
  name                text
  config              jsonb (credenciales encriptadas, endpoints, etc.)
  is_active           boolean DEFAULT true
  auto_create_ticket  boolean DEFAULT true
  default_category_id uuid FK
  default_group_id    uuid FK
  ai_processing       boolean DEFAULT true (procesar con AI agent)
  created_at          timestamptz

-- Conversaciones (agrupación de mensajes)
inbox_conversations:
  id                  uuid PK
  tenant_id           uuid FK
  channel_id          uuid FK → inbox_channels.id
  contact_id          uuid FK → contacts.id
  ticket_id           uuid FK → tickets.id (nullable, se vincula al crear ticket)
  status              enum: 'open' | 'pending' | 'snoozed' | 'resolved'
  subject             text
  last_message_at     timestamptz
  assigned_agent_id   uuid FK
  assigned_group_id   uuid FK
  ai_summary          text
  metadata            jsonb (headers de email, WhatsApp metadata, etc.)
  created_at          timestamptz
  updated_at          timestamptz

-- Mensajes individuales
inbox_messages:
  id                  uuid PK
  tenant_id           uuid FK
  conversation_id     uuid FK → inbox_conversations.id
  direction           enum: 'inbound' | 'outbound'
  sender_type         enum: 'contact' | 'agent' | 'ai_agent' | 'system'
  sender_id           uuid
  content_text        text
  content_html        text
  attachments         jsonb[] (array de {url, filename, mime_type, size})
  channel_message_id  text (ID del mensaje en el canal original)
  ai_classification   jsonb (tipo, urgencia, sentimiento detectado)
  metadata            jsonb
  created_at          timestamptz

-- Contactos (usuarios finales / remitentes)
contacts:
  id                  uuid PK
  tenant_id           uuid FK
  name                text
  email               text
  phone               text
  whatsapp_id         text
  company             text
  avatar_url          text
  channel_identifiers jsonb (mapeo de IDs por canal)
  metadata            jsonb
  created_at          timestamptz
  updated_at          timestamptz
```

#### 3.3.3 Flujo del Inbox

```
Mensaje entrante (cualquier canal)
  → Inbox Agent (AI):
      1. Identifica o crea contacto
      2. Busca conversación existente o crea nueva
      3. Clasifica: urgencia, sentimiento, tipo
      4. Si auto_create_ticket = true:
         a. Verifica si ya existe ticket vinculado
         b. Si no → crea ticket con tipificación AI
         c. Si sí → agrega como followup al ticket
      5. Si ai_processing = true:
         a. Intenta resolver con Knowledge Agent
         b. Sugiere respuesta al agente humano
  → Notificación en tiempo real al equipo asignado
```

---

### 3.4 TOOLS (Herramientas)

#### 3.4.1 Gestión de Proyectos

**Entidades:**

```sql
projects:
  id, tenant_id, name, description, status, start_date, end_date,
  project_manager_id, budget, actual_cost, progress_percent,
  created_at, updated_at

project_tasks:
  id, project_id, tenant_id, title, description, status,
  assigned_to, start_date, due_date, estimated_hours, actual_hours,
  parent_task_id (self-referencing for subtasks),
  depends_on_task_id, sort_order, created_at, updated_at

project_members:
  id, project_id, user_id, role (manager|member|viewer), created_at
```

#### 3.4.2 Base de Conocimiento (Knowledge Base)

**Entidades:**

```sql
kb_categories:
  id, tenant_id, name, parent_id (tree), slug, sort_order, icon

kb_articles:
  id, tenant_id, category_id, title, slug, content_markdown, content_html,
  status (draft|published|archived), author_id,
  is_public (visible en portal del cliente), view_count,
  helpful_count, not_helpful_count,
  ai_auto_generated (boolean), ai_source_ticket_id,
  tags text[], language, version,
  created_at, updated_at, published_at

kb_article_revisions:
  id, article_id, content_markdown, revised_by, revision_note, created_at

kb_article_feedback:
  id, article_id, user_id, is_helpful boolean, comment text, created_at
```

**AI en Knowledge Base:**
- Generación automática de artículos a partir de soluciones de tickets
- Sugerencia de artículos existentes cuando un técnico resuelve un ticket
- Detección de artículos desactualizados
- Traducción automática multi-idioma

#### 3.4.3 Reportes y Analytics

**Descripción:** Dashboard de métricas granulares con filtros por tenant, periodo, tipo, estado, agente, grupo.

**Métricas Requeridas (MVP):**

| Métrica | Descripción | Filtros |
|---------|-------------|---------|
| Casos Cerrados Garantía | Tickets tipo warranty en estado closed | Periodo, agente, grupo |
| Casos Cerrados Soporte | Tickets tipo support en estado closed | Periodo, agente, grupo |
| Casos Nuevo Garantía | Tickets tipo warranty en estado new | Periodo |
| Casos Nuevo Soporte | Tickets tipo support en estado new | Periodo |
| Casos en Progreso Garantía | Tickets warranty en in_progress | Periodo, agente |
| Casos en Progreso Soporte | Tickets support en in_progress | Periodo, agente |
| Nuevos Testing Garantía | Tickets warranty en testing | Periodo |
| Nuevos Testing Soporte | Tickets support en testing | Periodo |
| Pendientes Garantía | Tickets warranty en pending | Periodo |
| Pendientes Soporte | Tickets support en pending | Periodo |
| Casos Fracaso Testing | Tickets que volvieron de testing a in_progress | Periodo |
| SLA Compliance Rate | % de tickets resueltos dentro del SLA | Periodo, prioridad |
| First Response Time | Tiempo promedio de primera respuesta | Periodo, canal |
| Resolution Time | Tiempo promedio de resolución | Periodo, tipo |
| Customer Satisfaction | Score promedio de encuestas | Periodo, agente |
| AI Resolution Rate | % de tickets resueltos por AI sin intervención humana | Periodo |
| Agent Utilization | Carga de trabajo por agente | Periodo |
| Channel Distribution | Volumen de tickets por canal de origen | Periodo |
| Backlog Aging | Distribución de antigüedad del backlog | Estado |
| Reopen Rate | % de tickets reabiertos | Periodo |

**Tabla de métricas pre-calculadas (para performance):**

```sql
ticket_metrics:
  id                      uuid PK
  tenant_id               uuid FK
  ticket_id               uuid FK UNIQUE
  first_response_minutes  integer
  resolution_minutes      integer
  sla_first_response_met  boolean
  sla_resolution_met      boolean
  reopen_count            integer DEFAULT 0
  reassignment_count      integer DEFAULT 0
  followup_count          integer
  task_count              integer
  agent_touch_count       integer
  ai_interactions         integer
  ai_resolved             boolean DEFAULT false
  satisfaction_score      integer (1-5)
  created_at              timestamptz

-- Snapshot diario para dashboards rápidos
daily_metrics:
  id                      uuid PK
  tenant_id               uuid FK
  date                    date
  ticket_type             text
  status                  text
  channel                 text
  priority                integer
  group_id                uuid FK
  count                   integer
  avg_resolution_minutes  float
  sla_met_count           integer
  sla_breached_count      integer
  created_at              timestamptz

-- Índice compuesto para queries rápidas
CREATE INDEX idx_daily_metrics_lookup
  ON daily_metrics (tenant_id, date, ticket_type, status);
```

#### 3.4.4 Otros Módulos de Herramientas

| Módulo | Tabla Principal | Descripción |
|--------|----------------|-------------|
| Planning | `planning_events` | Calendario con eventos, recordatorios y sincronización |
| Reminders | `reminders` | Recordatorios personales/grupo con notificación push |
| SavedSearch | `saved_searches` | Búsquedas guardadas con alertas programables |
| Impact Analysis | `impact_items`, `impact_relations` | Mapa de dependencias entre servicios/activos |

---

### 3.5 ADMINISTRATION

#### 3.5.1 Multi-Tenancy

**Descripción:** Aislamiento completo de datos por tenant con RLS (Row Level Security) de Supabase como capa principal de seguridad.

**Entidades Core:**

```sql
-- Tenants (clientes/organizaciones)
tenants:
  id                  uuid PK
  name                text NOT NULL
  slug                text UNIQUE NOT NULL (para subdomain: slug.app.com)
  domain              text UNIQUE (dominio custom opcional)
  plan                enum: 'free' | 'starter' | 'professional' | 'enterprise'
  logo_url            text
  brand_colors        jsonb ({primary, secondary, accent})
  settings            jsonb (configuración global del tenant)
  features_enabled    text[] (feature flags)
  max_agents          integer
  max_ai_queries      integer (límite mensual de queries AI)
  ai_queries_used     integer DEFAULT 0
  subscription_status enum: 'active' | 'trial' | 'suspended' | 'cancelled'
  trial_ends_at       timestamptz
  created_at          timestamptz
  updated_at          timestamptz

-- Usuarios del sistema (agentes, admins, técnicos)
agents:
  id                  uuid PK
  tenant_id           uuid FK → tenants.id
  user_id             uuid FK → auth.users (Supabase Auth)
  name                text NOT NULL
  email               text NOT NULL
  role                enum: 'admin' | 'supervisor' | 'agent' | 'readonly'
  profile_id          uuid FK → profiles.id
  groups              uuid[] (grupos asignados)
  skills              text[] (habilidades para smart routing)
  avatar_url          text
  is_active           boolean DEFAULT true
  last_active_at      timestamptz
  settings            jsonb (preferencias personales)
  created_at          timestamptz

-- RLS Policy base (se aplica a TODAS las tablas con tenant_id)
-- Ejemplo para tickets:
CREATE POLICY tenant_isolation ON tickets
  FOR ALL
  USING (tenant_id = (
    SELECT tenant_id FROM agents WHERE user_id = auth.uid()
  ));
```

#### 3.5.2 Perfiles y Permisos (RBAC)

```sql
profiles:
  id                  uuid PK
  tenant_id           uuid FK
  name                text NOT NULL (ej: 'Admin', 'Supervisor', 'Agente L1', 'Agente L2')
  description         text
  is_system           boolean DEFAULT false (perfiles predeterminados no editables)
  created_at          timestamptz

profile_permissions:
  id                  uuid PK
  profile_id          uuid FK → profiles.id
  resource            text NOT NULL (ej: 'tickets', 'problems', 'changes', 'kb_articles')
  actions             text[] (ej: ['create', 'read', 'update', 'delete', 'assign', 'close'])
  scope               enum: 'own' | 'group' | 'all'
  conditions          jsonb (condiciones adicionales)
  created_at          timestamptz

-- Ejemplo de permisos:
-- Admin:       tickets → ['create','read','update','delete','assign','close'] → scope: all
-- Supervisor:  tickets → ['create','read','update','assign','close'] → scope: group
-- Agent L1:    tickets → ['create','read','update'] → scope: own
-- Agent L2:    tickets → ['create','read','update','close'] → scope: group
```

#### 3.5.3 Grupos y Equipos

```sql
groups:
  id                  uuid PK
  tenant_id           uuid FK
  name                text NOT NULL
  description         text
  parent_group_id     uuid FK (jerarquía de grupos)
  manager_agent_id    uuid FK → agents.id
  email               text (email del grupo)
  auto_assign         boolean DEFAULT false
  auto_assign_method  enum: 'round_robin' | 'least_busy' | 'ai_smart'
  calendar_id         uuid FK → calendars.id
  sla_id              uuid FK → slas.id (SLA default del grupo)
  created_at          timestamptz

group_members:
  id                  uuid PK
  group_id            uuid FK
  agent_id            uuid FK
  role                enum: 'member' | 'leader'
  created_at          timestamptz
```

#### 3.5.4 Entidades Multi-Proveedor / Multi-Aliado

**Descripción:** Soporte para múltiples proveedores y aliados que pueden gestionar tickets dentro del mismo tenant.

```sql
-- Proveedores / Aliados externos
partners:
  id                  uuid PK
  tenant_id           uuid FK
  name                text NOT NULL
  type                enum: 'provider' | 'partner' | 'vendor' | 'subcontractor'
  contact_email       text
  contact_phone       text
  sla_id              uuid FK (SLA específico con el proveedor)
  is_active           boolean DEFAULT true
  api_key             text (para acceso API del proveedor)
  config              jsonb
  created_at          timestamptz

-- Agentes externos (de proveedores/aliados)
partner_agents:
  id                  uuid PK
  partner_id          uuid FK → partners.id
  tenant_id           uuid FK
  user_id             uuid FK → auth.users
  name                text
  email               text
  permissions         jsonb (permisos limitados)
  is_active           boolean DEFAULT true
  created_at          timestamptz

-- Asignación de tickets a proveedores
ticket_partner_assignments:
  id                  uuid PK
  ticket_id           uuid FK → tickets.id
  partner_id          uuid FK → partners.id
  partner_agent_id    uuid FK → partner_agents.id
  status              enum: 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'rejected'
  notes               text
  assigned_at         timestamptz
  completed_at        timestamptz
```

#### 3.5.5 Motor de Reglas

**Descripción:** Sistema configurable de reglas de negocio que ejecuta acciones automáticas basadas en condiciones.

```sql
rules:
  id                  uuid PK
  tenant_id           uuid FK
  name                text NOT NULL
  description         text
  rule_type           enum: 'ticket_creation' | 'ticket_update' | 'sla_breach' |
                            'email_routing' | 'assignment' | 'escalation' |
                            'classification' | 'notification'
  is_active           boolean DEFAULT true
  priority            integer (orden de ejecución)
  stop_on_match       boolean DEFAULT false
  created_at          timestamptz

rule_conditions:
  id                  uuid PK
  rule_id             uuid FK → rules.id
  field               text (ej: 'ticket.type', 'ticket.priority', 'contact.company')
  operator            enum: 'equals' | 'not_equals' | 'contains' | 'not_contains' |
                            'greater_than' | 'less_than' | 'in' | 'not_in' |
                            'is_empty' | 'is_not_empty' | 'regex'
  value               jsonb
  logical_group       integer DEFAULT 0 (para AND/OR grouping)
  created_at          timestamptz

rule_actions:
  id                  uuid PK
  rule_id             uuid FK → rules.id
  action_type         enum: 'set_field' | 'assign_agent' | 'assign_group' |
                            'send_notification' | 'add_tag' | 'set_sla' |
                            'set_priority' | 'add_followup' | 'trigger_webhook' |
                            'run_ai_agent' | 'create_task' | 'escalate'
  config              jsonb (configuración de la acción)
  execution_order     integer
  created_at          timestamptz

rule_execution_logs:
  id                  uuid PK
  rule_id             uuid FK
  ticket_id           uuid FK
  tenant_id           uuid FK
  matched             boolean
  actions_executed    jsonb[]
  execution_time_ms   integer
  created_at          timestamptz
```

#### 3.5.6 Auditoría y Logs

```sql
audit_logs:
  id                  uuid PK
  tenant_id           uuid FK
  user_id             uuid FK
  action              enum: 'create' | 'update' | 'delete' | 'login' | 'logout' |
                            'assign' | 'escalate' | 'close' | 'reopen' | 'export'
  resource_type       text (ej: 'ticket', 'change', 'problem')
  resource_id         uuid
  changes             jsonb (diff del cambio: {field: {old, new}})
  ip_address          inet
  user_agent          text
  created_at          timestamptz

-- Índice para queries de auditoría
CREATE INDEX idx_audit_lookup
  ON audit_logs (tenant_id, resource_type, resource_id, created_at DESC);

-- Partición por mes para performance
-- Se recomienda particionar audit_logs por rango de created_at
```

#### 3.5.7 Tareas Programadas (Cron)

```sql
scheduled_tasks:
  id                  uuid PK
  tenant_id           uuid FK
  name                text
  task_type           enum: 'sla_check' | 'recurrent_ticket' | 'report_generation' |
                            'inbox_sync' | 'knowledge_sync' | 'metrics_snapshot' |
                            'stale_ticket_reminder' | 'satisfaction_survey'
  cron_expression     text (ej: '*/5 * * * *')
  config              jsonb
  is_active           boolean DEFAULT true
  last_run_at         timestamptz
  next_run_at         timestamptz
  last_run_status     enum: 'success' | 'failure' | 'running'
  last_run_log        text
  created_at          timestamptz
```

---

### 3.6 WORKFLOW / AUTOMATION ENGINE

**Descripción:** Motor visual de automatización de procesos que permite crear flujos de trabajo personalizados sin código (no-code/low-code).

#### 3.6.1 Entidades

```sql
workflows:
  id                  uuid PK
  tenant_id           uuid FK
  name                text NOT NULL
  description         text
  trigger_type        enum: 'ticket_created' | 'ticket_updated' | 'ticket_status_changed' |
                            'sla_warning' | 'sla_breach' | 'message_received' |
                            'scheduled' | 'manual' | 'webhook' | 'form_submitted'
  trigger_config      jsonb (condiciones del trigger)
  is_active           boolean DEFAULT true
  version             integer DEFAULT 1
  created_at          timestamptz
  updated_at          timestamptz

workflow_steps:
  id                  uuid PK
  workflow_id         uuid FK → workflows.id
  step_type           enum: 'condition' | 'action' | 'delay' | 'loop' | 'parallel' |
                            'ai_decision' | 'human_approval' | 'webhook' | 'sub_workflow'
  name                text
  config              jsonb (configuración del step)
  position_x          integer (para editor visual)
  position_y          integer
  next_step_id        uuid FK (siguiente paso si true/default)
  false_step_id       uuid FK (siguiente paso si false, para conditions)
  created_at          timestamptz

workflow_executions:
  id                  uuid PK
  workflow_id         uuid FK
  tenant_id           uuid FK
  trigger_resource_type text
  trigger_resource_id   uuid
  status              enum: 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting'
  current_step_id     uuid FK
  execution_data      jsonb (contexto acumulado durante la ejecución)
  started_at          timestamptz
  completed_at        timestamptz
  error               text

workflow_step_logs:
  id                  uuid PK
  execution_id        uuid FK → workflow_executions.id
  step_id             uuid FK → workflow_steps.id
  status              enum: 'started' | 'completed' | 'failed' | 'skipped'
  input_data          jsonb
  output_data         jsonb
  duration_ms         integer
  created_at          timestamptz
```

**Tipos de Step disponibles:**

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| condition | Evalúa una condición (if/else) | Si prioridad = critical |
| action | Ejecuta una acción | Asignar a grupo, enviar email |
| delay | Espera un tiempo | Esperar 30 minutos |
| ai_decision | AI toma una decisión | ¿Es este ticket de garantía? |
| human_approval | Solicita aprobación humana | CAB approval para changes |
| webhook | Llama a un endpoint externo | Notificar a Slack |
| sub_workflow | Ejecuta otro workflow | Ejecutar flujo de escalación |

---

### 3.7 SETUP / CONFIGURACIÓN

#### 3.7.1 Configuración Global

```sql
tenant_settings:
  id                  uuid PK
  tenant_id           uuid FK UNIQUE
  -- General
  timezone            text DEFAULT 'America/Bogota'
  date_format         text DEFAULT 'DD/MM/YYYY'
  language            text DEFAULT 'es'
  -- Tickets
  ticket_prefix       text DEFAULT 'TKT'
  auto_assign         boolean DEFAULT true
  require_category    boolean DEFAULT true
  -- AI
  ai_auto_triage      boolean DEFAULT true
  ai_auto_respond     boolean DEFAULT false
  ai_confidence_threshold float DEFAULT 0.8
  ai_model_preference text DEFAULT 'claude-sonnet-4-6'
  -- Notifications
  notify_on_create    boolean DEFAULT true
  notify_on_assign    boolean DEFAULT true
  notify_on_update    boolean DEFAULT true
  notify_on_close     boolean DEFAULT true
  -- Portal
  portal_enabled      boolean DEFAULT true
  portal_ai_enabled   boolean DEFAULT true
  portal_kb_enabled   boolean DEFAULT true
  -- Security
  session_timeout     integer DEFAULT 480 (minutos)
  mfa_required        boolean DEFAULT false
  ip_whitelist        text[]
  updated_at          timestamptz
```

#### 3.7.2 Categorías y Catálogos

```sql
categories:
  id                  uuid PK
  tenant_id           uuid FK
  name                text NOT NULL
  parent_id           uuid FK (árbol jerárquico)
  applies_to          text[] (ej: ['ticket', 'problem', 'change'])
  default_group_id    uuid FK
  default_sla_id      uuid FK
  icon                text
  sort_order          integer
  is_active           boolean DEFAULT true
  created_at          timestamptz

services:
  id                  uuid PK
  tenant_id           uuid FK
  category_id         uuid FK
  name                text NOT NULL
  description         text
  sla_id              uuid FK
  owner_group_id      uuid FK
  is_active           boolean DEFAULT true
  created_at          timestamptz
```

#### 3.7.3 Calendarios Laborales

```sql
calendars:
  id                  uuid PK
  tenant_id           uuid FK
  name                text NOT NULL
  timezone            text
  is_default          boolean DEFAULT false
  created_at          timestamptz

calendar_schedules:
  id                  uuid PK
  calendar_id         uuid FK
  day_of_week         integer (0=domingo, 6=sábado)
  start_time          time
  end_time            time

calendar_holidays:
  id                  uuid PK
  calendar_id         uuid FK
  name                text
  date                date
  is_recurring        boolean DEFAULT false
```

---

### 3.8 SISTEMA DE NOTIFICACIONES

#### 3.8.1 Entidades

```sql
notification_templates:
  id                  uuid PK
  tenant_id           uuid FK
  event_type          text (ej: 'ticket.created', 'ticket.assigned', 'sla.warning')
  channel             enum: 'email' | 'in_app' | 'webhook' | 'whatsapp'
  subject_template    text (con variables: {{ticket.number}}, {{ticket.title}})
  body_template       text (HTML/Markdown con variables)
  is_active           boolean DEFAULT true
  language            text DEFAULT 'es'
  created_at          timestamptz

notification_queue:
  id                  uuid PK
  tenant_id           uuid FK
  template_id         uuid FK
  channel             enum: 'email' | 'in_app' | 'webhook' | 'whatsapp'
  recipient_type      enum: 'agent' | 'contact' | 'group' | 'partner'
  recipient_id        uuid
  recipient_address   text (email, phone, webhook URL)
  subject             text (renderizado)
  body                text (renderizado)
  status              enum: 'pending' | 'sent' | 'failed' | 'cancelled'
  attempts            integer DEFAULT 0
  last_attempt_at     timestamptz
  error               text
  scheduled_for       timestamptz
  sent_at             timestamptz
  created_at          timestamptz

-- Notificaciones in-app (tiempo real via Supabase Realtime)
notifications:
  id                  uuid PK
  tenant_id           uuid FK
  user_id             uuid FK → auth.users
  title               text
  body                text
  link                text (deep link a la entidad)
  is_read             boolean DEFAULT false
  resource_type       text
  resource_id         uuid
  created_at          timestamptz
```

#### 3.8.2 Flujo de Notificaciones

```
Evento ocurre (ej: ticket.created)
  → Notification Engine evalúa reglas
  → Identifica destinatarios según NotificationTargets:
      • Requester
      • Assigned Agent
      • Group members
      • Supervisors
      • Watchers
  → Para cada destinatario + canal:
      1. Selecciona template
      2. Renderiza variables
      3. Encola en notification_queue
  → Worker procesa la cola:
      • Email → SMTP / SendGrid / SES
      • In-app → Supabase Realtime (INSERT en notifications)
      • WhatsApp → WhatsApp Cloud API
      • Webhook → HTTP POST al endpoint configurado
```

---

### 3.9 INTEGRATION LAYER

#### 3.9.1 API REST

**Endpoints principales:**

```
# Tickets
GET    /api/v1/tickets
POST   /api/v1/tickets
GET    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id
DELETE /api/v1/tickets/:id
POST   /api/v1/tickets/:id/followups
POST   /api/v1/tickets/:id/tasks
POST   /api/v1/tickets/:id/solution
POST   /api/v1/tickets/:id/assign

# Problems
GET    /api/v1/problems
POST   /api/v1/problems
GET    /api/v1/problems/:id
PATCH  /api/v1/problems/:id

# Changes
GET    /api/v1/changes
POST   /api/v1/changes
GET    /api/v1/changes/:id
PATCH  /api/v1/changes/:id
POST   /api/v1/changes/:id/approve
POST   /api/v1/changes/:id/reject

# Knowledge Base
GET    /api/v1/kb/articles
POST   /api/v1/kb/articles
GET    /api/v1/kb/search?q=...

# AI
POST   /api/v1/ai/chat (conversación con AI agent)
POST   /api/v1/ai/classify (tipificación de ticket)
POST   /api/v1/ai/suggest (sugerencia de solución)

# Inbox
GET    /api/v1/inbox/conversations
POST   /api/v1/inbox/conversations/:id/reply
POST   /api/v1/inbox/webhooks/:channel (recepción de mensajes)

# Webhooks salientes
POST   /api/v1/webhooks (registrar webhook)
GET    /api/v1/webhooks
DELETE /api/v1/webhooks/:id
```

#### 3.9.2 Webhooks Entrantes/Salientes

```sql
webhooks:
  id                  uuid PK
  tenant_id           uuid FK
  direction           enum: 'inbound' | 'outbound'
  name                text
  url                 text (outbound: URL destino; inbound: URL generada)
  secret              text (para firma HMAC)
  events              text[] (ej: ['ticket.created', 'ticket.closed'])
  headers             jsonb (headers custom)
  is_active           boolean DEFAULT true
  last_triggered_at   timestamptz
  failure_count       integer DEFAULT 0
  created_at          timestamptz

webhook_logs:
  id                  uuid PK
  webhook_id          uuid FK
  event               text
  payload             jsonb
  response_status     integer
  response_body       text
  duration_ms         integer
  created_at          timestamptz
```

#### 3.9.3 Integraciones Predefinidas

| Integración | Tipo | Uso |
|-------------|------|-----|
| GitHub / GitLab | OAuth + Webhooks | Vincular repos, PRs, issues a tickets |
| Slack | Bot + Webhooks | Notificaciones, crear tickets desde Slack |
| Microsoft Teams | Bot Framework | Notificaciones, crear tickets desde Teams |
| Office 365 | Graph API | Email inbox, calendar sync |
| Google Workspace | Gmail + Calendar API | Email inbox, calendar sync |
| WhatsApp Business | Cloud API | Inbox omnicanal |
| Jira | REST API | Sincronización bidireccional de issues |
| PagerDuty | Events API | Escalación de incidentes críticos |
| Zapier / n8n | Webhooks | Integración con 1000+ apps |

---

## 4. Schema de Base de Datos — Mejores Prácticas

### 4.1 Estrategia Multi-Tenant

```
Enfoque: Row-Level Security (RLS) con tenant_id en cada tabla

Ventajas:
  ✅ Un solo schema de BD (simplicidad operacional)
  ✅ RLS nativo de PostgreSQL (seguridad en la capa de datos)
  ✅ Fácil de mantener y migrar
  ✅ Compatible con Supabase

Mitigación de performance:
  ✅ tenant_id como primera columna en TODOS los índices compuestos
  ✅ Partición de tablas grandes por tenant_id (audit_logs, ticket_metrics)
  ✅ Connection pooling via Supabase (PgBouncer)
```

### 4.2 Convenciones de Schema

```sql
-- TODA tabla incluye:
  id          uuid PK DEFAULT gen_random_uuid()
  tenant_id   uuid NOT NULL REFERENCES tenants(id)
  created_at  timestamptz NOT NULL DEFAULT now()
  updated_at  timestamptz NOT NULL DEFAULT now()

-- Trigger automático para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas:
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS base para TODAS las tablas:
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON {table_name}
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM agents WHERE user_id = auth.uid()
      UNION
      SELECT tenant_id FROM partner_agents WHERE user_id = auth.uid()
    )
  );
```

### 4.3 Índices Obligatorios

```sql
-- En TODA tabla con tenant_id:
CREATE INDEX idx_{table}_tenant ON {table} (tenant_id);

-- En tickets (tabla más consultada):
CREATE INDEX idx_tickets_tenant_status ON tickets (tenant_id, status);
CREATE INDEX idx_tickets_tenant_type_status ON tickets (tenant_id, type, status);
CREATE INDEX idx_tickets_tenant_assigned ON tickets (tenant_id, assigned_agent_id, status);
CREATE INDEX idx_tickets_tenant_group ON tickets (tenant_id, assigned_group_id, status);
CREATE INDEX idx_tickets_tenant_sla ON tickets (tenant_id, sla_due_date) WHERE status NOT IN ('closed', 'cancelled');
CREATE INDEX idx_tickets_tenant_created ON tickets (tenant_id, created_at DESC);
CREATE INDEX idx_tickets_number ON tickets (ticket_number);

-- En inbox_messages:
CREATE INDEX idx_inbox_msg_conversation ON inbox_messages (conversation_id, created_at DESC);
CREATE INDEX idx_inbox_msg_tenant ON inbox_messages (tenant_id, created_at DESC);

-- En audit_logs (tabla de alto volumen):
CREATE INDEX idx_audit_tenant_resource ON audit_logs (tenant_id, resource_type, resource_id, created_at DESC);

-- En knowledge_embeddings (búsqueda vectorial):
CREATE INDEX idx_embeddings_tenant ON knowledge_embeddings (tenant_id);
CREATE INDEX idx_embeddings_vector ON knowledge_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- En notification_queue:
CREATE INDEX idx_notif_queue_pending ON notification_queue (status, scheduled_for)
  WHERE status = 'pending';
```

### 4.4 Particionamiento

```sql
-- audit_logs: particionar por mes (alto volumen)
CREATE TABLE audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- ... otros campos
) PARTITION BY RANGE (created_at);

-- Crear particiones automáticamente con pg_partman o manualmente:
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- ... etc

-- daily_metrics: particionar por mes
CREATE TABLE daily_metrics (
  -- ... campos
) PARTITION BY RANGE (date);
```

### 4.5 Soft Deletes

```sql
-- Para entidades que NO deben eliminarse físicamente:
-- tickets, problems, changes, contacts, kb_articles

-- Agregar a estas tablas:
  deleted_at    timestamptz (NULL = activo)
  deleted_by    uuid FK

-- RLS incluye filtro:
CREATE POLICY active_only ON tickets
  FOR SELECT
  USING (tenant_id = current_tenant() AND deleted_at IS NULL);
```

---

## 5. Frontend — Estructura de Páginas

### 5.1 App Map

```
/                                   → Landing / Marketing
/auth/sign-in                       → Login
/auth/sign-up                       → Registro

/home                               → Dashboard principal
/home/tickets                       → Lista de tickets
/home/tickets/new                   → Crear ticket
/home/tickets/[id]                  → Detalle de ticket (timeline, tasks, etc.)
/home/problems                      → Lista de problemas
/home/problems/[id]                 → Detalle de problema
/home/changes                       → Lista de cambios
/home/changes/[id]                  → Detalle de cambio

/home/inbox                         → Inbox omnicanal
/home/inbox/[conversationId]        → Conversación

/home/kb                            → Knowledge Base (admin)
/home/kb/articles/new               → Crear artículo
/home/kb/articles/[id]              → Editar artículo

/home/projects                      → Proyectos
/home/projects/[id]                 → Detalle de proyecto (Gantt/Kanban)

/home/reports                       → Dashboard de métricas
/home/reports/tickets               → Reporte detallado de tickets
/home/reports/sla                   → Reporte de SLA compliance
/home/reports/agents                → Reporte de productividad

/home/workflows                     → Editor visual de workflows
/home/workflows/[id]                → Editar workflow

/home/settings                      → Configuración general
/home/settings/categories           → Categorías y servicios
/home/settings/sla                  → SLA / OLA
/home/settings/rules                → Motor de reglas
/home/settings/agents               → Gestión de agentes
/home/settings/groups               → Gestión de grupos
/home/settings/profiles             → Perfiles y permisos
/home/settings/partners             → Proveedores y aliados
/home/settings/channels             → Canales de inbox
/home/settings/notifications        → Templates de notificación
/home/settings/calendars            → Calendarios laborales
/home/settings/webhooks             → Integraciones y webhooks
/home/settings/ai                   → Configuración de AI agents
/home/settings/portal               → Configuración del portal cliente
/home/settings/billing              → Plan y facturación

# Portal del Cliente (subdomain o ruta separada)
/portal                             → Home del portal del cliente
/portal/tickets                     → Mis tickets
/portal/tickets/[id]                → Detalle de mi ticket
/portal/tickets/new                 → Crear solicitud (con AI assistant)
/portal/kb                          → Knowledge Base pública
/portal/chat                        → Chat con AI assistant
```

### 5.2 Componentes Clave del Frontend

| Componente | Descripción |
|------------|-------------|
| TicketTimeline | Timeline vertical con followups, tasks, solutions, status changes |
| InboxView | Vista split: lista de conversaciones + detalle del mensaje |
| AIChat | Widget de chat con AI (streaming, markdown, file upload) |
| WorkflowEditor | Editor visual drag-and-drop para workflows |
| KanbanBoard | Vista Kanban para tickets (por estado, por prioridad) |
| MetricsDashboard | Grid de cards con métricas + gráficos (recharts) |
| RuleBuilder | Constructor visual de condiciones y acciones |
| FormBuilder | Constructor de formularios para el catálogo de servicios |
| SLAIndicator | Badge visual que muestra estado del SLA (verde/amarillo/rojo) |
| OmniSearch | Búsqueda global con filtros facetados |

---

## 6. Stack Tecnológico Detallado

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Framework** | Next.js 15 (App Router) | SSR, API routes, Server Actions |
| **Hosting** | Vercel | Edge functions, cron jobs, analytics |
| **Database** | Supabase PostgreSQL | RLS, Realtime, Auth, Storage, pgvector |
| **Auth** | Supabase Auth | OAuth2, MFA, Magic Links, SSO |
| **Realtime** | Supabase Realtime | WebSocket para notificaciones y chat |
| **Storage** | Supabase Storage | Archivos adjuntos, avatares, documentos |
| **AI SDK** | Vercel AI SDK | Streaming, tool calling, multi-provider |
| **AI Model** | Claude API (Anthropic) | Reasoning, clasificación, RAG |
| **Embeddings** | OpenAI / Voyage AI | Vectores para búsqueda semántica |
| **Vector DB** | pgvector (Supabase) | Embeddings en PostgreSQL nativo |
| **UI** | shadcn/ui + Tailwind CSS 4 | Design system consistente |
| **State** | TanStack Query | Cache, optimistic updates, realtime sync |
| **Forms** | React Hook Form + Zod | Validación type-safe |
| **Charts** | Recharts | Gráficos para dashboards |
| **Tables** | TanStack Table | Tablas con sort, filter, pagination |
| **Workflow Editor** | React Flow | Editor visual de nodos |
| **Rich Text** | Tiptap | Editor WYSIWYG para descripciones |
| **Email** | React Email + Resend | Templates de email |
| **Monorepo** | Turborepo + pnpm | Build system optimizado |
| **Testing** | Vitest + Playwright | Unit + E2E testing |
| **CI/CD** | GitHub Actions + Vercel | Deploy automático |

---

## 7. Seguridad

| Capa | Medida |
|------|--------|
| **Autenticación** | Supabase Auth con MFA obligatorio (plan enterprise), SSO (SAML/OIDC) |
| **Autorización** | RLS en PostgreSQL + RBAC en app layer |
| **Multi-tenancy** | tenant_id + RLS en 100% de las tablas, sin excepciones |
| **API** | Rate limiting (Vercel), API keys con scopes, JWT validation |
| **Datos** | Encriptación at-rest (Supabase), TLS 1.3 in-transit |
| **Secrets** | Variables de entorno en Vercel, encrypted config en DB |
| **Audit** | Log de toda acción con IP, user agent, timestamp |
| **OWASP** | Input sanitization (Zod), CSP headers, CSRF protection |
| **Compliance** | SOC2-ready logging, data retention policies, GDPR (right to delete) |
| **Backups** | Supabase automated backups + point-in-time recovery |
| **IP Whitelist** | Configurable por tenant (enterprise) |
| **Session** | Timeout configurable, invalidación remota |

---

## 8. Roadmap de Implementación

### Phase 1 — Foundation (Semanas 1-4)
- [ ] Schema de base de datos core (tenants, agents, groups, profiles, permissions)
- [ ] Auth flow con Supabase (login, MFA, roles)
- [ ] RLS policies para multi-tenancy
- [ ] Layout principal y navegación
- [ ] CRUD de tickets (crear, listar, ver, editar)
- [ ] Ticket timeline (followups, status changes)
- [ ] Categorías y servicios

### Phase 2 — ITSM Core (Semanas 5-8)
- [ ] Ticket workflow completo (estados, asignación, resolución)
- [ ] Problem management
- [ ] Change management con aprobaciones
- [ ] SLA/OLA engine con escalación
- [ ] Motor de reglas básico
- [ ] Templates de tickets
- [ ] Knowledge Base (artículos, categorías)

### Phase 3 — AI Layer (Semanas 9-12)
- [ ] AI Triage Agent (tipificación automática)
- [ ] RAG pipeline (pgvector + embeddings)
- [ ] Knowledge Agent (búsqueda semántica)
- [ ] AI classification (warranty/support/backlog/incident/request)
- [ ] AI suggested solutions
- [ ] Document/transcript analysis

### Phase 4 — Omnichannel Inbox (Semanas 13-16)
- [ ] Inbox core (conversaciones, mensajes)
- [ ] Canal Email (IMAP/SMTP)
- [ ] Canal Office 365 (Graph API)
- [ ] Canal WhatsApp (Cloud API)
- [ ] Web Widget embeddable
- [ ] Inbox Agent (AI processing de mensajes)

### Phase 5 — Portal & Workflows (Semanas 17-20)
- [ ] Portal del cliente (branding, subdomain)
- [ ] AI Assistant en portal
- [ ] Catálogo de servicios con form builder
- [ ] Workflow engine (editor visual)
- [ ] Automation templates predefinidos
- [ ] Tickets recurrentes

### Phase 6 — Analytics & Polish (Semanas 21-24)
- [ ] Dashboard de métricas completo
- [ ] Reportes granulares (warranty vs support vs backlog)
- [ ] SLA compliance reports
- [ ] Satisfaction surveys
- [ ] Notificaciones multi-canal
- [ ] Webhooks in/out
- [ ] API REST documentada
- [ ] Partner/vendor management

---

## 9. Métricas de Éxito

| KPI | Target |
|-----|--------|
| AI Triage Accuracy | > 90% de tipificación correcta |
| AI Resolution Rate | > 30% de tickets resueltos sin humano |
| First Response Time | < 5 minutos (con AI) |
| SLA Compliance | > 95% |
| Customer Satisfaction | > 4.2 / 5.0 |
| Portal Adoption | > 60% de tickets creados vía portal/AI |
| System Uptime | > 99.9% |
| Page Load Time | < 2 segundos (P95) |

---

## 10. Diagrama de Relaciones de Base de Datos (Resumen)

```
tenants ─────────┐
  │               │
  ├─ agents       ├─ ALL tables have tenant_id FK
  ├─ groups       │
  ├─ profiles     │
  ├─ partners     │
  │               │
  ├─ tickets ─────┤─ ticket_tasks
  │    │          ├─ ticket_followups
  │    │          ├─ ticket_solutions
  │    │          ├─ ticket_validations
  │    │          ├─ ticket_costs
  │    │          ├─ ticket_satisfactions
  │    │          ├─ ticket_attachments
  │    │          └─ ticket_relations
  │    │
  │    ├─ problems ── problem_tasks, problem_ticket_links
  │    ├─ changes ─── change_tasks, change_validations
  │    │
  │    ├─ slas ────── sla_levels ── sla_level_actions
  │    ├─ olas ────── ola_levels ── ola_level_actions
  │    │
  │    ├─ categories (self-referencing tree)
  │    ├─ services
  │    │
  │    ├─ inbox_channels ── inbox_conversations ── inbox_messages
  │    ├─ contacts
  │    │
  │    ├─ kb_categories ── kb_articles ── kb_article_revisions
  │    │
  │    ├─ rules ── rule_conditions, rule_actions
  │    ├─ workflows ── workflow_steps
  │    │
  │    ├─ ai_agents
  │    ├─ knowledge_documents ── knowledge_embeddings
  │    │
  │    ├─ notification_templates
  │    ├─ notification_queue
  │    ├─ notifications (in-app)
  │    │
  │    ├─ audit_logs (partitioned)
  │    ├─ daily_metrics (partitioned)
  │    ├─ ticket_metrics
  │    │
  │    ├─ calendars ── calendar_schedules, calendar_holidays
  │    ├─ webhooks ── webhook_logs
  │    └─ scheduled_tasks
  │
  └─ tenant_settings
```

---

*Este PRD es un documento vivo. Se actualizará conforme avance el desarrollo y se refinen los requisitos con feedback de usuarios y stakeholders.*
