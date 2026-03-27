# PLAN DE IMPLEMENTACIÓN — Multi-Cliente (Opción A: Master Tenant + Organizations)

> **Empresa:** TDX (Consultora ITSM)
> **Modelo:** TDX es el tenant maestro. Cada cliente es una "Organization" dentro del tenant.
> **Fecha:** 2026-03-27
> **Status:** PLAN — No implementar hasta aprobación

---

## 1. MODELO DE NEGOCIO

```
TDX (Master Tenant)
│
├── Organizations (Clientes de TDX)
│   ├── ACME Corp ──── Portal: acme.tdx-itsm.com
│   ├── Beta Inc  ──── Portal: beta.tdx-itsm.com
│   └── Gamma SA  ──── Portal: gamma.tdx-itsm.com
│
├── Agents (Empleados de TDX)
│   ├── Admin TDX     ── ve TODOS los clientes + config
│   ├── Supervisor TDX ── ve clientes asignados + reportes
│   ├── Agente 1 TDX   ── ve ACME + Beta (asignados)
│   └── Agente 2 TDX   ── ve solo Gamma (asignado)
│
├── Client Users (Usuarios de cada cliente)
│   ├── user@acme.com  ── solo ve tickets de ACME
│   ├── user@beta.com  ── solo ve tickets de Beta
│   └── user@gamma.com ── solo ve tickets de Gamma
│
└── Data (filtrada por organization_id)
    ├── Tickets     → cada ticket pertenece a UNA organization
    ├── Contacts    → cada contacto pertenece a UNA organization
    ├── Assets      → cada asset pertenece a UNA organization
    ├── KB Articles → pueden ser globales o por organization
    └── SLAs        → pueden ser globales o por organization
```

---

## 2. FLUJOS DE USUARIO

### Flujo A: Agente TDX (vista centralizada)

```
1. Login como agente TDX
2. Dashboard muestra KPIs de TODAS sus organizaciones asignadas
3. Topbar tiene selector: [Todas las organizaciones ▼] [ACME] [Beta] [Gamma]
4. Si selecciona "ACME" → solo ve tickets/data de ACME
5. Si selecciona "Todas" → ve todo consolidado
6. Puede crear ticket asignándolo a una organización
7. Puede cambiar de organización sin re-login
```

### Flujo B: Usuario del cliente (portal segmentado)

```
1. Accede a acme.tdx-itsm.com (portal de ACME)
2. Login con su email @acme.com
3. Solo ve:
   - Sus propios tickets
   - KB articles públicos + los de ACME
   - Service catalog de ACME
   - AI chat (contexto ACME)
4. NO ve: tickets de Beta, agentes internos de TDX, config, etc.
5. Puede crear tickets (se asignan automáticamente a org ACME)
```

### Flujo C: Admin TDX (gestión completa)

```
1. Login como admin
2. Settings > Organizations: CRUD de clientes
3. Settings > Agents: asignar agentes a organizaciones
4. Settings > Roles: configurar qué puede hacer cada rol por org
5. Reports: consolidado o filtrado por organización
6. Puede crear/editar organizaciones con branding custom
```

---

## 3. CAMBIOS EN BASE DE DATOS (Supabase)

### 3.1 Nueva Migration: `00021_organizations.sql`

```sql
-- ═══════════════════════════════════════════════════════════
-- MIGRATION 00021: ORGANIZATIONS (Multi-Cliente)
-- ═══════════════════════════════════════════════════════════

-- Tabla principal de organizaciones (clientes de TDX)
CREATE TABLE organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  slug              text NOT NULL,                    -- para subdomain: slug.tdx-itsm.com
  domain            text,                             -- dominio custom opcional
  logo_url          text,
  brand_colors      jsonb DEFAULT '{"primary":"#4f46e5","secondary":"#7c3aed"}'::jsonb,
  industry          text,                             -- sector del cliente
  contact_name      text,                             -- contacto principal
  contact_email     text,
  contact_phone     text,
  address           text,
  notes             text,
  sla_id            uuid,                             -- SLA default para este cliente
  settings          jsonb DEFAULT '{}'::jsonb,         -- config custom por cliente
  is_active         boolean DEFAULT true,
  max_users         integer DEFAULT 10,                -- límite de usuarios del cliente
  contract_start    date,
  contract_end      date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- RLS + policies + indexes + trigger (estándar)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_organizations_tenant ON organizations (tenant_id);
CREATE INDEX idx_organizations_slug ON organizations (tenant_id, slug);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tabla pivote: qué agente tiene acceso a qué organización
CREATE TABLE agent_organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id          uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  access_level      text NOT NULL DEFAULT 'full'
                    CHECK (access_level IN ('full','tickets_only','readonly','portal_admin')),
  is_default        boolean DEFAULT false,             -- org default del agente
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, organization_id)
);

ALTER TABLE agent_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_organizations FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_agent_orgs_agent ON agent_organizations (agent_id);
CREATE INDEX idx_agent_orgs_org ON agent_organizations (organization_id);

-- Usuarios de los clientes (login al portal)
CREATE TABLE organization_users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id),    -- NULL si invitado pero no registrado
  name              text NOT NULL,
  email             text NOT NULL,
  phone             text,
  role              text DEFAULT 'user'
                    CHECK (role IN ('admin','manager','user','readonly')),
  is_active         boolean DEFAULT true,
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_org_users_org ON organization_users (organization_id);
CREATE INDEX idx_org_users_email ON organization_users (tenant_id, email);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organization_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- AGREGAR organization_id A TABLAS EXISTENTES
-- ═══════════════════════════════════════════════════════════

-- Tickets: cada ticket pertenece a una organización (cliente)
ALTER TABLE tickets ADD COLUMN organization_id uuid REFERENCES organizations(id);
CREATE INDEX idx_tickets_org ON tickets (tenant_id, organization_id);

-- Contacts: cada contacto pertenece a una organización
ALTER TABLE contacts ADD COLUMN organization_id uuid REFERENCES organizations(id);
CREATE INDEX idx_contacts_org ON contacts (tenant_id, organization_id);

-- Assets: cada asset puede pertenecer a una organización
ALTER TABLE assets ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- KB Articles: NULL = global, con org_id = específico del cliente
ALTER TABLE kb_articles ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Inbox Conversations: cada conversación viene de una organización
ALTER TABLE inbox_conversations ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Projects: pueden ser por organización
ALTER TABLE projects ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- SLAs: pueden ser por organización (override del default)
ALTER TABLE slas ADD COLUMN organization_id uuid REFERENCES organizations(id);
```

### 3.2 Access Levels

| Level | Tickets | Assets | KB | Reports | Config |
|-------|---------|--------|----|---------|--------|
| `full` | CRUD + assign + close | CRUD | CRUD | Ver | No |
| `tickets_only` | CRUD | Read | Read | No | No |
| `readonly` | Read | Read | Read | No | No |
| `portal_admin` | CRUD (de su org) | Read | Read | Ver (su org) | Básico (su org) |

---

## 4. CAMBIOS EN BACKEND

### 4.1 Nuevo Service: `lib/services/organization.service.ts`

```typescript
// Funciones:
getOrganizationsForAgent(agentId)        // Orgs asignadas al agente
getOrganizationBySlug(slug)              // Para portal (subdomain)
getCurrentOrganizationFilter(agentId)    // Org seleccionada en UI o todas
checkOrganizationAccess(agentId, orgId)  // Verificar acceso del agente a la org
getOrganizationUsers(orgId)              // Usuarios del cliente
```

### 4.2 Nuevo Schema: `lib/schemas/organization.schema.ts`

```typescript
createOrganizationSchema    // name, slug, industry, contact, branding
updateOrganizationSchema    // partial
assignAgentSchema           // agent_id, organization_id, access_level
createOrgUserSchema         // name, email, role, organization_id
```

### 4.3 Nuevas Server Actions: `lib/actions/organizations.ts`

```typescript
createOrganization(input)                    // Crear cliente
updateOrganization(orgId, input)             // Editar cliente
deactivateOrganization(orgId)                // Desactivar
assignAgentToOrganization(agentId, orgId, level)  // Asignar agente
removeAgentFromOrganization(agentId, orgId)       // Desasignar
inviteOrganizationUser(orgId, email, role)         // Invitar usuario
updateOrganizationUser(userId, input)              // Editar usuario
```

### 4.4 Modificar Server Actions Existentes

| Action | Cambio |
|--------|--------|
| `createTicket` | Agregar `organization_id` obligatorio al crear |
| `filterTickets` | Filtrar por `organization_id` si el agente tiene filtro activo |
| `createContact` | Agregar `organization_id` |
| `getPortalTickets` | Filtrar por `organization_id` del org_user |
| `createPortalTicket` | Auto-asignar `organization_id` del org_user |

### 4.5 Modificar Middleware

```typescript
// middleware.ts — Agregar resolución de organización por subdomain
// acme.tdx-itsm.com → organization slug = "acme"
// Setear en cookie/header para uso downstream
```

### 4.6 Nuevo API Endpoint: Portal Auth

```typescript
// api/portal/auth/route.ts
// Login para usuarios de organizaciones (org_users)
// Valida email + organization_id
// Retorna JWT con org context
```

---

## 5. CAMBIOS EN FRONTEND

### 5.1 Nuevo Componente: Organization Selector (Topbar)

```
┌────────────────────────────────────────────────────────────┐
│ [🏢 Todas las organizaciones ▼]  🔍  🔔  👤 Admin TDX    │
│  ├── Todas las organizaciones                              │
│  ├── ── ACME Corp                                          │
│  ├── ── Beta Inc                                           │
│  └── ── Gamma SA                                           │
└────────────────────────────────────────────────────────────┘
```

- Dropdown en topbar que filtra TODA la app por organización
- Se guarda en URL param `?org=acme` o en estado global
- Cuando se selecciona una org, todos los queries agregan `organization_id`
- "Todas" muestra data de TODAS las orgs del agente

### 5.2 Nueva Página: Settings > Organizations

```
/home/settings/organizations

┌──────────────────────────────────────────────────────┐
│ Organizations                          [+ Add Client] │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 🏢 ACME Corp          Industry: Technology         │ │
│ │    acme.tdx-itsm.com  Contact: juan@acme.com      │ │
│ │    ● Active            SLA: Premium                │ │
│ │    5 users | 23 tickets | Contract: Jan-Dec 2026   │ │
│ │    [Edit] [Users] [Portal] [Deactivate]            │ │
│ ├────────────────────────────────────────────────────┤ │
│ │ 🏢 Beta Inc            Industry: Finance           │ │
│ │    beta.tdx-itsm.com   Contact: maria@beta.com    │ │
│ │    ● Active             SLA: Standard              │ │
│ │    3 users | 12 tickets | Contract: Mar-Dec 2026   │ │
│ │    [Edit] [Users] [Portal] [Deactivate]            │ │
│ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 5.3 Nueva Página: Organization Detail

```
/home/settings/organizations/[id]

Tabs: General | Users | Agents | Portal | SLA | Branding

Tab General:
  - Name, slug, domain, industry
  - Contact name, email, phone
  - Contract dates, notes

Tab Users:
  - Lista de usuarios del cliente
  - [Invite User] button
  - Tabla: name, email, role (admin/manager/user/readonly), status, last login
  - Edit role, activate/deactivate

Tab Agents:
  - Qué agentes TDX tienen acceso a este cliente
  - Tabla: agent name, access level (full/tickets_only/readonly)
  - [Assign Agent] button
  - Remove agent access

Tab Portal:
  - URL del portal: https://acme.tdx-itsm.com
  - Preview del portal con branding del cliente
  - Toggle: Portal enabled/disabled

Tab SLA:
  - SLA asignado al cliente
  - Override de tiempos si necesario

Tab Branding:
  - Logo upload
  - Colores primario/secundario
  - Preview
```

### 5.4 Modificar: Settings > Agents

Agregar columna "Organizations" que muestre a qué clientes tiene acceso cada agente:

```
┌────────────────────────────────────────────────────────────┐
│ Agent Name     │ Role       │ Organizations      │ Status  │
│────────────────┼────────────┼─────────────────────┼─────────│
│ Admin TDX      │ admin      │ All                 │ Active  │
│ Agente 1       │ agent      │ ACME, Beta          │ Active  │
│ Agente 2       │ agent      │ Gamma               │ Active  │
└────────────────────────────────────────────────────────────┘
```

### 5.5 Modificar: Create Ticket Form

Agregar dropdown "Organization" (obligatorio):

```
┌─────────────────────────────────────┐
│ Create Ticket                        │
│                                      │
│ Organization *  [ACME Corp     ▼]   │  ← NUEVO: selector de cliente
│ Title *         [_______________]   │
│ Description *   [_______________]   │
│ Type           [Incident       ▼]   │
│ ...                                  │
└─────────────────────────────────────┘
```

Si el agente solo tiene 1 organización asignada, se auto-selecciona.
Si viene del portal, se auto-asigna la org del usuario.

### 5.6 Modificar: Ticket List

Agregar columna "Organization":

```
│ Ticket #     │ Title              │ Organization │ Status  │ Priority │
│──────────────┼────────────────────┼──────────────┼─────────┼──────────│
│ TKT-00001    │ Server down        │ ACME Corp    │ Open    │ Critical │
│ TKT-00002    │ VPN issue          │ Beta Inc     │ Closed  │ High     │
│ TKT-00003    │ Email not working  │ ACME Corp    │ New     │ Critical │
```

### 5.7 Modificar: Dashboard

Agregar filtro por organización y mostrar métricas segmentadas:

```
[Todas ▼] → KPIs de todas las orgs
[ACME]   → KPIs solo de ACME
[Beta]   → KPIs solo de Beta
```

### 5.8 Modificar: Portal Layout

El portal usa el slug de la URL para determinar la organización:

```
acme.tdx-itsm.com → org slug = "acme"
→ Layout con logo de ACME
→ Colores de ACME
→ Solo tickets de ACME
→ Solo KB de ACME + global
```

### 5.9 Modificar: Reports

Agregar filtro por organización a TODOS los reportes:

```
[Date Range ▼] [Organization ▼] [Agent ▼] [Export]
```

---

## 6. CAMBIOS EN RBAC

### 6.1 Seed de Permisos por Perfil

```sql
-- Admin TDX: acceso total a todas las organizaciones
INSERT INTO profile_permissions VALUES
  ('admin_profile', 'organizations', ['create','read','update','delete'], 'all'),
  ('admin_profile', 'tickets', ['create','read','update','delete','assign','close'], 'all'),
  ('admin_profile', 'settings', ['read','update'], 'all');

-- Supervisor TDX: ve orgs asignadas, gestiona tickets
INSERT INTO profile_permissions VALUES
  ('supervisor_profile', 'organizations', ['read'], 'group'),
  ('supervisor_profile', 'tickets', ['create','read','update','assign','close'], 'group');

-- Agente TDX: solo tickets de sus orgs asignadas
INSERT INTO profile_permissions VALUES
  ('agent_profile', 'tickets', ['create','read','update'], 'group'),
  ('agent_profile', 'kb_articles', ['read'], 'all');

-- Portal Admin (usuario cliente): su propia org
INSERT INTO profile_permissions VALUES
  ('portal_admin', 'tickets', ['create','read'], 'own'),
  ('portal_admin', 'org_users', ['read','update'], 'own');

-- Portal User: solo sus propios tickets
INSERT INTO profile_permissions VALUES
  ('portal_user', 'tickets', ['create','read'], 'own'),
  ('portal_user', 'kb_articles', ['read'], 'all');
```

### 6.2 Lógica de Filtrado

```typescript
// En CADA Server Action que toca tickets/contacts/assets:

async function getOrganizationFilter(client, agentId, selectedOrgId?) {
  // 1. Si es admin → no filtrar (ve todo)
  // 2. Si tiene selectedOrgId → verificar que tiene acceso
  // 3. Si no → filtrar por sus orgs asignadas

  const agentOrgs = await getOrganizationsForAgent(agentId);

  if (selectedOrgId) {
    if (!agentOrgs.includes(selectedOrgId)) throw 'No access';
    return [selectedOrgId];
  }

  return agentOrgs.map(o => o.id); // todas sus orgs
}

// Luego en la query:
query.in('organization_id', orgFilter);
```

---

## 7. ORDEN DE IMPLEMENTACIÓN

### Fase 1: Base de Datos (1 día)

- [ ] 7.1.1 Crear migration `00021_organizations.sql`
- [ ] 7.1.2 Crear tablas: organizations, agent_organizations, organization_users
- [ ] 7.1.3 Agregar organization_id a: tickets, contacts, assets, kb_articles, inbox_conversations, projects, slas
- [ ] 7.1.4 Crear índices en organization_id
- [ ] 7.1.5 Push migration a Supabase
- [ ] 7.1.6 Seed: 3 organizaciones de ejemplo (ACME, Beta, Gamma)
- [ ] 7.1.7 Seed: agent_organizations para admin
- [ ] 7.1.8 Seed: organization_users de ejemplo
- [ ] 7.1.9 Actualizar tickets existentes con organization_id

### Fase 2: Backend Services (1 día)

- [ ] 7.2.1 Crear `lib/schemas/organization.schema.ts`
- [ ] 7.2.2 Crear `lib/services/organization.service.ts`
- [ ] 7.2.3 Crear `lib/actions/organizations.ts`
- [ ] 7.2.4 Modificar `lib/actions/tickets.ts` → agregar organization_id
- [ ] 7.2.5 Modificar `lib/actions/admin.ts` → agent-org assignment
- [ ] 7.2.6 Modificar `lib/actions/portal.ts` → filtrar por org del user
- [ ] 7.2.7 Crear `lib/services/org-filter.service.ts` → helper de filtrado
- [ ] 7.2.8 Seed profile_permissions en DB

### Fase 3: Frontend — Organization Selector + Settings (1 día)

- [ ] 7.3.1 Crear componente `OrgSelector` en topbar
- [ ] 7.3.2 Crear contexto/estado global para organización seleccionada
- [ ] 7.3.3 Crear página `settings/organizations/page.tsx` (lista)
- [ ] 7.3.4 Crear página `settings/organizations/[id]/page.tsx` (detalle con tabs)
- [ ] 7.3.5 Crear formularios: crear org, editar org, invite user, assign agent
- [ ] 7.3.6 Modificar Settings > Agents para mostrar columna Organizations

### Fase 4: Frontend — Filtrado por Organización (1 día)

- [ ] 7.4.1 Modificar Dashboard → filtrar KPIs por org seleccionada
- [ ] 7.4.2 Modificar Ticket List → columna Organization + filtro
- [ ] 7.4.3 Modificar Ticket Create → dropdown Organization obligatorio
- [ ] 7.4.4 Modificar Ticket Detail → mostrar Organization en info panel
- [ ] 7.4.5 Modificar Reports → filtro por Organization
- [ ] 7.4.6 Modificar Problems/Changes → filtro por Organization
- [ ] 7.4.7 Modificar Inbox → filtro por Organization
- [ ] 7.4.8 Modificar Assets → filtro por Organization

### Fase 5: Portal Multi-Cliente (1 día)

- [ ] 7.5.1 Modificar portal layout → resolver org por subdomain/slug
- [ ] 7.5.2 Modificar portal branding → usar logo/colores de la org
- [ ] 7.5.3 Crear portal login → valida org_user por email + org
- [ ] 7.5.4 Modificar portal tickets → filtrar por org del user
- [ ] 7.5.5 Modificar portal KB → filtrar por org + global
- [ ] 7.5.6 Modificar portal chat → contexto de la org

### Fase 6: Testing (1 día)

- [ ] 7.6.1 Crear 3 organizaciones reales en Supabase
- [ ] 7.6.2 Asignar agente a 2 de 3 organizaciones
- [ ] 7.6.3 Verificar que agente solo ve tickets de sus orgs
- [ ] 7.6.4 Verificar que agente NO ve tickets de org no asignada
- [ ] 7.6.5 Verificar portal: usuario de ACME solo ve tickets de ACME
- [ ] 7.6.6 Verificar selector de org en topbar filtra correctamente
- [ ] 7.6.7 Verificar reportes filtrados por organización
- [ ] 7.6.8 Verificar que admin ve TODAS las organizaciones

---

## 8. DIAGRAMA DE RELACIONES ACTUALIZADO

```
tenants ─────────────────────────────────────────────────┐
  │                                                       │
  ├── organizations ──┬── organization_users              │
  │                   │                                   │
  ├── agents ─────────┤                                   │
  │                   │                                   │
  ├── agent_organizations (pivote agent ↔ org)           │
  │                                                       │
  ├── tickets ─────── (+ organization_id FK)              │
  ├── contacts ────── (+ organization_id FK)              │
  ├── assets ──────── (+ organization_id FK)              │
  ├── kb_articles ─── (+ organization_id nullable FK)     │
  ├── inbox_conv ──── (+ organization_id FK)              │
  ├── projects ────── (+ organization_id FK)              │
  └── slas ─────────── (+ organization_id nullable FK)    │
                                                          │
  ALL tables still have tenant_id for RLS isolation       │
  organization_id is APPLICATION-LEVEL filtering          │
──────────────────────────────────────────────────────────┘
```

---

## 9. IMPACTO EN MÓDULOS EXISTENTES

| Módulo | Impacto | Cambio Principal |
|--------|---------|-----------------|
| **Dashboard** | MEDIO | Agregar org filter a KPIs |
| **Tickets** | ALTO | org_id en create, column en list, filter en queries |
| **Ticket Detail** | BAJO | Mostrar org name en info panel |
| **Problems** | MEDIO | Agregar org filter |
| **Changes** | MEDIO | Agregar org filter |
| **KB** | BAJO | Filtrar por org + global |
| **Inbox** | MEDIO | Agregar org filter a conversations |
| **Reports** | MEDIO | Agregar org dropdown filter |
| **Settings** | ALTO | Nueva sección Organizations completa |
| **Portal** | ALTO | Login por org, branding, filtrado |
| **Assets** | BAJO | Agregar org_id |
| **Projects** | BAJO | Agregar org_id |
| **AI Agents** | BAJO | Pasar org context al AI |
| **Notifications** | BAJO | Sin cambio directo |
| **Workflows** | BAJO | Sin cambio directo |
| **Automations** | BAJO | Sin cambio directo |

---

## 10. ESTIMACIÓN

| Fase | Días | Archivos |
|------|------|----------|
| DB Migration + Seed | 1 | 1 SQL + seed |
| Backend Services | 1 | 4 nuevos + 5 modificados |
| Frontend Org Settings | 1 | 4 nuevas pages |
| Frontend Filtrado | 1 | 8 pages modificadas |
| Portal Multi-Cliente | 1 | 6 pages modificadas |
| Testing | 1 | 8 test scenarios |
| **TOTAL** | **6 días** | **~30 archivos** |

---

*Plan pendiente de aprobación. No implementar hasta confirmación.*
