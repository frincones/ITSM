# 🏗️ Sprint 1 Detallado — NOVAdesk OS (Semanas 1-3)

> **Objetivo Sprint 1:** Tener NOVA Operator (web) operando ITSM completo con 12 tools, dual UI voz+texto, en staging. Listo para concierge MVP en Sprint 3.

---

## 📅 SEMANA 1 — Setup + Architecture

### 🎯 Outcome semana 1
Stack completo deployado en staging, Freddy y Emma trabajando en paralelo sin bloqueos.

### Track A: Backend NOVA Core (Freddy)

**Día 1-2: Setup Railway + FastAPI**
```bash
# Estructura del repo
nova-core/
├── app/
│   ├── main.py                    # FastAPI app
│   ├── core/
│   │   ├── config.py              # Settings (env vars)
│   │   ├── database.py            # Supabase client
│   │   ├── auth.py                # JWT validation
│   │   └── tenant.py              # Tenant resolver
│   ├── agents/
│   │   ├── nova_operator.py       # NOVA - dueño del negocio
│   │   ├── sofia_customer.py      # Sofía - cliente final
│   │   ├── tools/
│   │   │   ├── __init__.py
│   │   │   ├── itsm_tools.py      # 8 tools ITSM
│   │   │   ├── crm_tools.py       # 4 tools CRM
│   │   │   └── admin_tools.py     # tools admin
│   │   └── prompts/
│   │       ├── nova_base.txt
│   │       ├── nova_itsm.txt
│   │       └── sofia_itsm.txt
│   ├── routers/
│   │   ├── voice.py               # /api/nova/session
│   │   ├── chat.py                # /api/nova/chat
│   │   ├── tools_callback.py      # tool execution callbacks
│   │   ├── webhooks.py            # WhatsApp/Stripe webhooks
│   │   └── tenants.py             # tenant CRUD
│   ├── services/
│   │   ├── openai_realtime.py     # Ephemeral tokens
│   │   ├── anthropic_chat.py      # Tool reasoning
│   │   ├── whatsapp.py            # Meta Cloud API
│   │   └── rag.py                 # pgvector search
│   └── models/                    # Pydantic models
├── tests/
├── requirements.txt
├── Dockerfile
└── railway.json
```

**Tareas concretas:**
- [ ] `railway init` + connect to GitHub repo
- [ ] Variables de entorno: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `META_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`
- [ ] Endpoint `/health` para Railway monitoring
- [ ] CORS configurado para Vercel domain
- [ ] Logging con structlog
- [ ] Sentry SDK integration

**Output verificable:** `curl https://api-staging.novadesk.app/health` → 200 OK

---

### Track B: Frontend Web App (Emma)

**Día 1-2: Setup Next.js 15**
```bash
# Estructura del repo
nova-web/
├── app/
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Landing page
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (app)/
│   │   ├── dashboard/             # Dashboard tradicional
│   │   ├── tickets/               # ITSM module
│   │   │   ├── page.tsx           # Lista tickets
│   │   │   ├── [id]/page.tsx      # Detalle ticket
│   │   │   └── new/page.tsx       # Crear ticket
│   │   ├── customers/             # CRM module
│   │   ├── reports/               # Reportes
│   │   └── settings/              # Configuración tenant
│   ├── (admin)/                   # Admin panel NOVAdesk
│   │   ├── tenants/
│   │   ├── subscriptions/
│   │   └── analytics/
│   └── api/                       # API routes (proxy a Railway)
├── components/
│   ├── nova/
│   │   ├── NovaWidget.tsx         # 🌟 Dual UI (voz+texto)
│   │   ├── VoiceOrb.tsx           # Esfera animada
│   │   ├── ChatMessages.tsx       # Lista mensajes
│   │   └── ChatInput.tsx          # Input texto + mic button
│   ├── ui/                        # shadcn/ui
│   └── layout/
├── lib/
│   ├── supabase/
│   ├── openai-realtime/           # WebRTC client
│   └── api/                       # tRPC client
└── package.json
```

**Tareas concretas:**
- [ ] `npx create-next-app@latest nova-web --typescript --tailwind --app`
- [ ] Instalar shadcn/ui base components
- [ ] Setup Supabase client (client + server)
- [ ] Setup Clerk auth (o Supabase Auth)
- [ ] Layout principal con sidebar + topbar
- [ ] Deploy a Vercel staging

**Output verificable:** `https://app-staging.novadesk.app` → login funcional

---

### Track C: Database Schema (Emma + Freddy)

**Día 3-5: Supabase setup**

Ejecutar este SQL inicial:

```sql
-- ============================================================
-- NOVAdesk OS — Schema v1 (CRM Spine + ITSM + Admin + NOVA)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ====================
-- ADMIN PANEL (NOVAdesk)
-- ====================

CREATE TABLE tenants (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            text UNIQUE NOT NULL,
    business_name   text NOT NULL,
    country         text DEFAULT 'CO',
    timezone        text DEFAULT 'America/Bogota',
    language        text DEFAULT 'es-CO',
    
    -- Subscription
    plan            text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','scale')),
    status          text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','churned')),
    trial_ends_at   timestamptz,
    
    -- Branding (white label)
    logo_url        text,
    primary_color   text DEFAULT '#0A0A0F',
    
    -- Limits per plan
    max_users               integer DEFAULT 1,
    max_nova_actions_month  integer DEFAULT 200,
    max_whatsapp_msgs_month integer DEFAULT 500,
    max_contacts            integer DEFAULT 500,
    
    created_at      timestamptz DEFAULT NOW(),
    updated_at      timestamptz DEFAULT NOW()
);

CREATE TABLE vertical_packs (
    id              text PRIMARY KEY,                  -- 'itsm', 'dental', etc.
    name            text NOT NULL,
    description     text,
    available       boolean DEFAULT true,
    config          jsonb,                              -- Pack YAML deserialized
    created_at      timestamptz DEFAULT NOW()
);

INSERT INTO vertical_packs (id, name, description) VALUES
('itsm', 'IT Service Management', 'Para empresas de tecnología y soporte IT'),
('dental', 'Clínica Dental', 'Para consultorios dentales'),
('estetica', 'Estética y Belleza', 'Para spas, peluquerías, centros estéticos'),
('vet', 'Veterinaria', 'Para clínicas veterinarias'),
('inmob', 'Inmobiliaria', 'Para agencias inmobiliarias');

CREATE TABLE tenant_packs (
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    pack_id         text REFERENCES vertical_packs(id),
    activated_at    timestamptz DEFAULT NOW(),
    config_overrides jsonb,
    PRIMARY KEY (tenant_id, pack_id)
);

CREATE TABLE subscriptions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    stripe_subscription_id text,
    mercadopago_subscription_id text,
    plan            text NOT NULL,
    amount_usd      numeric(10,2),
    currency        text DEFAULT 'USD',
    status          text,                               -- active, past_due, canceled
    current_period_start timestamptz,
    current_period_end   timestamptz,
    created_at      timestamptz DEFAULT NOW()
);

-- ====================
-- USERS (multi-role)
-- ====================

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    email           text UNIQUE NOT NULL,
    full_name       text,
    role            text NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','admin','agent','viewer')),
    phone           text,
    avatar_url      text,
    is_active       boolean DEFAULT true,
    last_login_at   timestamptz,
    created_at      timestamptz DEFAULT NOW()
);

-- ====================
-- CRM SPINE (transversal)
-- ====================

CREATE TABLE customers (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            text,
    email           text,
    phone           text,
    company         text,
    
    -- Lifecycle
    lifecycle_stage text DEFAULT 'lead' CHECK (lifecycle_stage IN ('lead','prospect','customer','churned')),
    source          text,                               -- 'whatsapp','email','web','referral'
    
    -- Persistent memory para Sofía
    preferences     jsonb DEFAULT '{}',
    custom_fields   jsonb DEFAULT '{}',                 -- per-vertical fields
    history_summary text,                               -- LLM-generated
    
    -- Lifecycle dates
    first_seen_at   timestamptz DEFAULT NOW(),
    last_seen_at    timestamptz DEFAULT NOW(),
    
    created_at      timestamptz DEFAULT NOW(),
    updated_at      timestamptz DEFAULT NOW(),
    
    UNIQUE(tenant_id, phone),
    UNIQUE(tenant_id, email)
);

CREATE TABLE interactions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id),          -- agente humano si aplica
    
    channel         text NOT NULL CHECK (channel IN ('whatsapp','email','voice_web','voice_phone','live_call','manual')),
    direction       text CHECK (direction IN ('inbound','outbound')),
    content         text,
    metadata        jsonb,
    
    -- AI metadata
    handled_by_ai   boolean DEFAULT false,
    ai_summary      text,
    sentiment       text,
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE notes (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    user_id         uuid REFERENCES users(id),
    content         text NOT NULL,
    is_ai_generated boolean DEFAULT false,
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE tasks (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_to     uuid REFERENCES users(id),
    customer_id     uuid REFERENCES customers(id),
    
    title           text NOT NULL,
    description     text,
    due_date        timestamptz,
    status          text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
    priority        text DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    
    created_by_ai   boolean DEFAULT false,
    
    created_at      timestamptz DEFAULT NOW(),
    completed_at    timestamptz
);

-- ====================
-- ITSM VERTICAL (primer vertical)
-- ====================

CREATE TABLE itsm_tickets (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    assigned_to     uuid REFERENCES users(id),
    
    -- Identification
    ticket_number   text NOT NULL,                      -- TKT-001234
    title           text NOT NULL,
    description     text,
    
    -- Classification
    type            text CHECK (type IN ('incident','request','problem','change')),
    category        text,
    priority        text CHECK (priority IN ('low','medium','high','critical')),
    impact          text CHECK (impact IN ('low','medium','high')),
    urgency         text CHECK (urgency IN ('low','medium','high')),
    
    -- Status (ITSM specific pipeline)
    status          text DEFAULT 'new' CHECK (status IN ('new','assigned','in_progress','pending','resolved','closed','cancelled')),
    
    -- SLA
    sla_target_minutes  integer,
    sla_breached    boolean DEFAULT false,
    response_due_at timestamptz,
    resolution_due_at timestamptz,
    first_response_at timestamptz,
    resolved_at     timestamptz,
    closed_at       timestamptz,
    
    -- Source
    source_channel  text,                               -- 'whatsapp','email','web','voice','manual'
    created_by_ai   boolean DEFAULT false,
    
    created_at      timestamptz DEFAULT NOW(),
    updated_at      timestamptz DEFAULT NOW(),
    
    UNIQUE(tenant_id, ticket_number)
);

CREATE TABLE itsm_ticket_comments (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_id       uuid REFERENCES itsm_tickets(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id),
    content         text NOT NULL,
    is_internal     boolean DEFAULT false,              -- vs visible al cliente
    is_ai_generated boolean DEFAULT false,
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE itsm_assets (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    
    name            text NOT NULL,
    asset_type      text,                               -- 'server','laptop','printer','router'
    serial_number   text,
    location        text,
    purchase_date   date,
    warranty_until  date,
    metadata        jsonb,
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE itsm_slas (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            text NOT NULL,
    priority        text,
    response_minutes integer,
    resolution_minutes integer,
    business_hours_only boolean DEFAULT true,
    
    created_at      timestamptz DEFAULT NOW()
);

-- ====================
-- NOVA AGENT (sessions + actions log)
-- ====================

CREATE TABLE nova_sessions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id),
    
    agent_type      text NOT NULL CHECK (agent_type IN ('nova_operator','sofia_customer')),
    channel         text CHECK (channel IN ('voice','text','whatsapp','email')),
    
    started_at      timestamptz DEFAULT NOW(),
    ended_at        timestamptz,
    duration_seconds integer,
    
    messages_count  integer DEFAULT 0,
    actions_count   integer DEFAULT 0,                  -- # tools llamados (NORTH STAR)
    cost_usd        numeric(10,4),
    
    summary         text,                               -- LLM-generated post-session
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE nova_actions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    session_id      uuid REFERENCES nova_sessions(id) ON DELETE CASCADE,
    
    tool_name       text NOT NULL,
    tool_input      jsonb,
    tool_output     jsonb,
    success         boolean,
    error_message   text,
    duration_ms     integer,
    
    created_at      timestamptz DEFAULT NOW()
);

-- ====================
-- KNOWLEDGE BASE (RAG per tenant)
-- ====================

CREATE TABLE knowledge_base (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    
    title           text NOT NULL,
    content         text NOT NULL,
    category        text,
    source_type     text DEFAULT 'manual',
    
    embedding       vector(1536),                       -- OpenAI text-embedding-3-small
    
    is_active       boolean DEFAULT true,
    
    created_at      timestamptz DEFAULT NOW(),
    updated_at      timestamptz DEFAULT NOW()
);

CREATE INDEX idx_kb_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ====================
-- INDEXES (performance)
-- ====================

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX idx_interactions_customer ON interactions(customer_id, created_at DESC);
CREATE INDEX idx_tickets_tenant_status ON itsm_tickets(tenant_id, status);
CREATE INDEX idx_tickets_assigned ON itsm_tickets(assigned_to, status);
CREATE INDEX idx_nova_sessions_tenant ON nova_sessions(tenant_id, created_at DESC);
CREATE INDEX idx_nova_actions_session ON nova_actions(session_id);

-- ====================
-- ROW-LEVEL SECURITY
-- ====================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE itsm_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE itsm_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE itsm_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE nova_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nova_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Policy template (apply to each table)
CREATE POLICY tenant_isolation ON customers
  USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');
-- Repeat for all tables above
```

**Output verificable:** Schema en Supabase + tenant de prueba `tdx-test` insertado

---

## 📅 SEMANA 2 — NOVA Operator Agent + ITSM Tools

### 🎯 Outcome semana 2
NOVA Operator agent funcional con 12 tools ITSM. Backend responde a `/api/nova/chat` con tool calling.

### Track A: NOVA Operator base (Freddy)

**Día 6-8: Agent core**

Crear `app/agents/nova_operator.py`:

```python
"""
NOVA Operator — el agente que opera el negocio del dueño.
Usa Anthropic Claude para tool reasoning (mejor que GPT para function calling).
"""
from anthropic import AsyncAnthropic
from app.agents.tools import itsm_tools, crm_tools, admin_tools

NOVA_SYSTEM_PROMPT = """
Sos NOVA, asistente operativo del dueño de un negocio en LATAM.
Tu trabajo es operar el negocio: crear/responder/asignar tickets, 
gestionar clientes, configurar el sistema, generar reportes.

PERSONALIDAD:
- Hablás español formal LATAM, claro y directo
- Respuestas cortas (NO discursos)
- Si una acción es destructiva (eliminar, cerrar masivamente), pedí confirmación
- Si tenés dudas sobre lo que el dueño quiere, preguntá UNA cosa, no tres

REGLAS:
1. SIEMPRE usá las herramientas para hacer acciones reales (no inventes data)
2. Si el dueño pide algo fuera del scope de tools disponibles, decilo honestamente
3. Después de ejecutar una acción, confirmá brevemente: "Listo, ticket #123 asignado a Mariana"
4. Si fallás una acción, explicá por qué y proponé alternativa
5. Nunca compartas info de OTROS tenants (security)

CONTEXTO DEL NEGOCIO:
- Vertical activa: {vertical}
- Nombre del negocio: {business_name}
- Plan: {plan}
- Idioma preferido: {language}
"""

ALL_TOOLS = itsm_tools.TOOLS + crm_tools.TOOLS + admin_tools.TOOLS

async def nova_chat(
    tenant_id: str,
    user_id: str,
    messages: list[dict],
    session_id: str
) -> dict:
    """Main NOVA chat endpoint with tool calling loop."""
    client = AsyncAnthropic()
    tenant = await get_tenant(tenant_id)
    
    system = NOVA_SYSTEM_PROMPT.format(
        vertical=tenant.active_vertical,
        business_name=tenant.business_name,
        plan=tenant.plan,
        language=tenant.language
    )
    
    # Tool calling loop (max 10 iterations to prevent runaway)
    for _ in range(10):
        response = await client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2048,
            system=system,
            tools=ALL_TOOLS,
            messages=messages
        )
        
        # If model finished without tool use, return
        if response.stop_reason == "end_turn":
            return {
                "message": response.content[0].text,
                "actions_taken": [],
                "session_id": session_id
            }
        
        # Execute tool calls
        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = await execute_tool(
                        tool_name=block.name,
                        tool_input=block.input,
                        tenant_id=tenant_id,
                        user_id=user_id,
                        session_id=session_id
                    )
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result)
                    })
            
            messages.append({"role": "user", "content": tool_results})
    
    return {"error": "max_iterations_reached"}
```

**Día 9-10: ITSM Tools (8 tools)**

Crear `app/agents/tools/itsm_tools.py`:

```python
"""ITSM tools — las acciones que NOVA puede hacer en ITSM."""

TOOLS = [
    {
        "name": "create_ticket",
        "description": "Crear un nuevo ticket de soporte IT. Usar cuando el dueño pide registrar un problema, incidente o solicitud nueva.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Título corto del ticket"},
                "description": {"type": "string", "description": "Descripción detallada del problema"},
                "customer_phone_or_name": {"type": "string", "description": "Teléfono o nombre del cliente afectado"},
                "type": {"type": "string", "enum": ["incident","request","problem","change"]},
                "priority": {"type": "string", "enum": ["low","medium","high","critical"]},
                "category": {"type": "string", "description": "Categoría libre (ej: 'red', 'servidor', 'email')"}
            },
            "required": ["title", "description", "type", "priority"]
        }
    },
    {
        "name": "search_tickets",
        "description": "Buscar tickets por filtros. Usar cuando el dueño pregunta '¿qué tickets tengo?', '¿cuántos abiertos?', etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Filtrar por status (opcional)"},
                "assigned_to_user": {"type": "string", "description": "Nombre del agente (opcional)"},
                "priority": {"type": "string"},
                "customer_name": {"type": "string"},
                "limit": {"type": "integer", "default": 20}
            }
        }
    },
    {
        "name": "update_ticket",
        "description": "Actualizar un ticket existente. Usar para cambiar status, prioridad, asignación, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticket_id_or_number": {"type": "string"},
                "status": {"type": "string"},
                "priority": {"type": "string"},
                "comment": {"type": "string", "description": "Comentario para registrar el cambio"}
            },
            "required": ["ticket_id_or_number"]
        }
    },
    {
        "name": "assign_ticket",
        "description": "Asignar un ticket a un agente del equipo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticket_id_or_number": {"type": "string"},
                "assignee_name_or_email": {"type": "string"}
            },
            "required": ["ticket_id_or_number", "assignee_name_or_email"]
        }
    },
    {
        "name": "close_ticket",
        "description": "Cerrar un ticket marcándolo como resuelto. CONFIRMAR con el usuario antes de cerrar masivamente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticket_id_or_number": {"type": "string"},
                "resolution_summary": {"type": "string"},
                "notify_customer": {"type": "boolean", "default": true}
            },
            "required": ["ticket_id_or_number", "resolution_summary"]
        }
    },
    {
        "name": "escalate_ticket",
        "description": "Escalar ticket a prioridad mayor + notificar a admin/manager.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticket_id_or_number": {"type": "string"},
                "reason": {"type": "string"},
                "new_priority": {"type": "string", "enum": ["high","critical"]}
            },
            "required": ["ticket_id_or_number", "reason"]
        }
    },
    {
        "name": "send_notification_to_customer",
        "description": "Enviar notificación al cliente de un ticket via WhatsApp/email.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticket_id_or_number": {"type": "string"},
                "message": {"type": "string"},
                "channel": {"type": "string", "enum": ["whatsapp","email","both"]}
            },
            "required": ["ticket_id_or_number", "message"]
        }
    },
    {
        "name": "generate_ticket_report",
        "description": "Generar reporte de tickets para un período. SLA compliance, FCR, MTTR, distribución por agente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["today","week","month","quarter"]},
                "metrics": {"type": "array", "items": {"type": "string"}, "description": "Métricas específicas (opcional)"}
            },
            "required": ["period"]
        }
    }
]

async def create_ticket(tenant_id, user_id, **params):
    """Implementation of create_ticket tool."""
    # 1. Resolve customer
    customer = await find_or_create_customer(
        tenant_id=tenant_id,
        identifier=params.get('customer_phone_or_name')
    )
    
    # 2. Generate ticket number
    ticket_number = await next_ticket_number(tenant_id)
    
    # 3. Calculate SLA based on priority
    sla = await get_sla_for_priority(tenant_id, params['priority'])
    
    # 4. Insert ticket
    ticket = await db.itsm_tickets.insert({
        "tenant_id": tenant_id,
        "ticket_number": ticket_number,
        "customer_id": customer.id if customer else None,
        "title": params['title'],
        "description": params['description'],
        "type": params['type'],
        "priority": params['priority'],
        "category": params.get('category'),
        "status": "new",
        "source_channel": "voice",  # NOVA-created
        "created_by_ai": True,
        "sla_target_minutes": sla.resolution_minutes if sla else None,
        "resolution_due_at": calculate_due_date(sla) if sla else None
    })
    
    # 5. Log NOVA action
    await log_nova_action(
        tenant_id=tenant_id,
        tool_name="create_ticket",
        tool_input=params,
        tool_output={"ticket_id": ticket.id, "ticket_number": ticket_number},
        success=True
    )
    
    return {
        "success": True,
        "ticket_number": ticket_number,
        "message": f"Ticket {ticket_number} creado, prioridad {params['priority']}, vence {ticket.resolution_due_at}"
    }

# Implementar las otras 7 tools de manera similar...
```

**Output verificable:**
```bash
curl -X POST https://api-staging.novadesk.app/api/nova/chat \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "messages": [{"role":"user","content":"Creame un ticket urgente: el servidor de Banco Caribe está caído"}]
  }'

# Response esperado:
# {
#   "message": "Listo, creé el ticket TKT-001234 con prioridad crítica para Banco Caribe. SLA de resolución: 2 horas.",
#   "actions_taken": [{"tool":"create_ticket","success":true}]
# }
```

---

## 📅 SEMANA 3 — Frontend NOVA Widget + Voice + Concierge MVP

### 🎯 Outcome semana 3
NOVA Widget funcional en web con dual UI (voz + texto). 3 empresas tech onboardeadas concierge.

### Track A: NOVA Widget (Emma)

**Día 11-13: Build NovaWidget component**

Crear `components/nova/NovaWidget.tsx` — widget flotante estilo ChatGPT:

```tsx
"use client";
import { useState, useRef, useEffect } from 'react';
import VoiceOrb from './VoiceOrb';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

export default function NovaWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState([]);
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'speaking' | 'processing'>('idle');

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button 
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-gradient-to-br from-cedar-warm to-blue-soft shadow-2xl flex items-center justify-center z-50"
        >
          <span className="text-2xl">🎙️</span>
        </button>
      )}

      {/* Widget panel */}
      {open && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-bg-deep border border-white/10 rounded-2xl shadow-2xl flex flex-col z-50">
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <VoiceOrb state={voiceState} size="sm" />
              <div>
                <div className="font-serif italic">NOVA</div>
                <div className="text-xs text-text-muted">Tu asistente de negocio</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)}>✕</button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 p-2 border-b border-white/10">
            <button 
              onClick={() => setMode('text')}
              className={mode === 'text' ? 'bg-white/10' : ''}
            >
              💬 Texto
            </button>
            <button 
              onClick={() => setMode('voice')}
              className={mode === 'voice' ? 'bg-white/10' : ''}
            >
              🎙️ Voz
            </button>
          </div>

          {/* Content */}
          {mode === 'text' ? (
            <>
              <ChatMessages messages={messages} className="flex-1 overflow-y-auto p-4" />
              <ChatInput 
                onSend={async (text) => {
                  // POST to /api/nova/chat
                  // Stream response back
                }}
                onSwitchToVoice={() => setMode('voice')}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <VoiceOrb state={voiceState} size="lg" />
              <div className="mt-4 text-text-muted">
                {voiceState === 'idle' && 'Tocá para hablar'}
                {voiceState === 'listening' && 'Te escucho...'}
                {voiceState === 'speaking' && 'NOVA habla...'}
                {voiceState === 'processing' && 'Procesando...'}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
```

**Día 14-15: Voice integration (WebRTC + OpenAI Realtime)**

Reusar el código del repo NOVAdesk anterior para `lib/openai-realtime/client.ts`.

Conectar tools del backend al voice agent:
- Voice agent recibe audio
- OpenAI Realtime detecta intent
- Llama tool callback a `/api/nova/tool-callback`
- Backend ejecuta tool
- Retorna resultado a Realtime
- NOVA habla la confirmación

### Track B: Onboarding flow voz (Freddy)

**Día 14-15: Onboarding agent**

Crear flujo conversacional inicial:

```
NOVA: "Hola, soy NOVA. Antes de empezar, contame tres cosas:"
NOVA: "1. ¿Qué hace tu negocio?"
[user responde: "Empresa de soporte IT"]
NOVA: [tool: configure_vertical(itsm)] "Listo, te activé el pack ITSM."
NOVA: "2. ¿Cómo se llama tu empresa?"
[user: "TechSupport SAS"]
NOVA: [tool: configure_business(name='TechSupport SAS')]
NOVA: "3. ¿Querés conectar el WhatsApp del negocio ahora? Te muestro un QR."
[user: "Sí"]
NOVA: [tool: initiate_whatsapp_connection()] [genera QR]
[user escanea]
NOVA: "WhatsApp conectado. Cuando llegue el primer mensaje, lo gestiono y te aviso. ¿Querés que cree un ticket de prueba?"
```

### Track C: Concierge MVP (Freddy + Emma)

**Día 16-21: Onboard 3 empresas tech**

- [ ] Outreach a 10 empresas tech LATAM (clientes existentes TDX + nuevos)
- [ ] Cerrar 3 con concierge gratis primer mes
- [ ] Setup manual + entrenamiento del dueño (1h llamada cada uno)
- [ ] Métricas baseline:
  - AAT (acciones NOVA/tenant/mes)
  - % tickets via NOVA
  - NPS post-week-1
  - Pain points encontrados → backlog Sprint 2

**Output verificable Sprint 1:**
- ✅ NOVA Widget funcional en web
- ✅ ITSM completo + 8 tools NOVA operativas
- ✅ 3 clientes tech reales operando
- ✅ Métricas dashboard NOVAdesk

---

## 📊 Métricas a trackear desde Sprint 1

| Métrica | Owner | Frecuencia | Target Sprint 1 end |
|---|---|---|---|
| AAT (Acciones NOVA/tenant/mes) | Freddy | Diaria | >50/tenant |
| % tickets creados via NOVA | Emma | Semanal | >30% |
| Tool success rate | Freddy | Diaria | >90% |
| Avg tool latency | Freddy | Continua | <2s p95 |
| NPS clientes concierge | Emma | Post-week-1 | >40 |
| Bug tickets / week | Ambos | Diaria | <5 críticos |

---

## 🚨 Definition of Done — Sprint 1

Para considerar Sprint 1 cerrado:

- [ ] NOVA Operator responde por web a chat texto + voz
- [ ] 8 tools ITSM funcionando (create, search, update, assign, close, escalate, notify, report)
- [ ] CRM Spine v1 operativo (customers, interactions, notes, tasks)
- [ ] Multi-tenant con RLS funcionando
- [ ] 3 empresas tech onboardeadas y usando ≥3x/semana
- [ ] Métricas dashboard básico en admin panel
- [ ] Documentación interna del stack (para devs futuros)
- [ ] Bug backlog priorizado para Sprint 2

---

## ➡️ Sprint 2 preview (semanas 4-5)

- WhatsApp Cloud API integration (Sofía customer)
- Email integration (Resend)
- Voice agent web embebido (Sofía web)
- Admin panel completo (Stripe + MercadoPago)
- Live WebRTC calls (cliente↔empleado)
- Customer support Tixflow as-a-service

## ➡️ Sprint 3 preview (semanas 6-8)

- UX polish + onboarding por voz pulido
- 5 empresas tech adicionales (target 8 total)
- Documentation site + landing
- Demo video 90s
- Outreach a 50 empresas

---

**FIN SPRINT 1 DETALLADO**

> Próximo paso: una vez aprobado este sprint, empezamos Día 1 con setup de stack en paralelo.
