# PLAN DE IMPLEMENTACIÓN — RBAC Unificado + Gestión de Usuarios por Cliente

> **Fecha:** 2026-03-27
> **Status:** PLAN — No implementar hasta aprobación
> **Principio:** ZERO REGRESIÓN — No romper nada existente

---

## 1. OBJETIVO

Un solo lugar en Settings para:
- Ver TODOS los usuarios (agentes TDX + usuarios de clientes)
- Asignar organización (cliente) a cada usuario
- Configurar permisos por módulo × acción con matriz visual RBAC
- Los agentes TDX siempre ven todo (super admin)
- Cada cliente tiene su experiencia controlada por TDX

---

## 2. ANÁLISIS DE REGRESIÓN

### Archivos que SE MODIFICAN (riesgo controlado):

| Archivo | Cambio | Riesgo | Mitigación |
|---------|--------|--------|------------|
| `middleware.ts` | Agregar detección de org_user para redirect | **MEDIO** | Solo agrega un IF adicional, no cambia lógica existente |
| `home/layout.tsx` | Pasar `allowedModules` a SidebarNav | **BAJO** | Solo agrega un prop, renderizado actual no cambia |
| `sidebar-nav.tsx` | Filtrar nav items por `allowedModules` | **BAJO** | Si no se pasa prop, muestra todos (backwards compatible) |
| `settings-client.tsx` | Agregar "Users & Permissions" link al nav | **BAJO** | Solo agrega 1 item al menú, no cambia nada existente |
| `organizations` migration | Agregar `enabled_modules` column | **BAJO** | ALTER TABLE ADD COLUMN con DEFAULT, no afecta data existente |
| `organization_users` migration | Agregar `profile_id` column | **BAJO** | ALTER TABLE ADD COLUMN nullable, no afecta records existentes |

### Archivos que NO SE TOCAN (zero regresión):

| Archivo | Por qué NO se toca |
|---------|-------------------|
| `lib/actions/tickets.ts` | `requireAgent()` sigue funcionando. checkPermission se agrega DESPUÉS como wrapper, no se modifica la función |
| `lib/actions/problems.ts` | Mismo — no se toca |
| `lib/actions/changes.ts` | Mismo — no se toca |
| `lib/actions/kb.ts` | Mismo — no se toca |
| `lib/actions/inbox.ts` | Mismo — no se toca |
| `lib/actions/workflows.ts` | Mismo — no se toca |
| `lib/actions/reports.ts` | Mismo — no se toca |
| `lib/services/sla.service.ts` | No tiene nada de auth/permisos |
| `lib/services/rules.service.ts` | No tiene nada de auth/permisos |
| `lib/services/workflow.service.ts` | No tiene nada de auth/permisos |
| `lib/services/notification.service.ts` | No tiene nada de auth/permisos |
| `lib/services/metrics.service.ts` | No tiene nada de auth/permisos |
| `lib/services/webhook.service.ts` | No tiene nada de auth/permisos |
| `lib/ai/*` | No tiene nada de auth/permisos |
| Todas las `page.tsx` de módulos | No se tocan — el filtrado es en layout |
| Todos los `*-client.tsx` | No se tocan — solo reciben props |
| API routes (`api/v1/*`, `api/ai/*`, `api/cron/*`) | No se tocan |
| Portal pages (`portal/*`) | No se tocan |
| Zod schemas | No se tocan (salvo agregar 1 schema nuevo) |

### Estrategia de ZERO regresión:

```
REGLA #1: Solo AGREGAR código, nunca MODIFICAR lógica existente
REGLA #2: Nuevos features son OPT-IN (si no hay permisos configurados → se permite todo)
REGLA #3: Backwards compatible → allowedModules = null → todos permitidos
REGLA #4: checkPermission() ya existe pero no se usa → empezamos a usarlo gradualmente
REGLA #5: Cada paso se puede revertir independientemente
```

---

## 3. PLAN DE IMPLEMENTACIÓN (5 pasos)

### PASO 1: Migration DB (0 riesgo)

```sql
-- Migration: 00022_rbac_modules.sql

-- 1. Agregar enabled_modules a organizations (con DEFAULT = todos)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enabled_modules text[]
  DEFAULT ARRAY['dashboard','tickets','problems','changes','kb','inbox',
                'reports','assets','projects','service_catalog','automations',
                'workflows','settings','notifications'];

-- 2. Agregar profile_id a organization_users (nullable, no rompe nada)
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS
  profile_id uuid REFERENCES profiles(id);

-- 3. Seed profile_permissions (tabla VACÍA → la llenamos)
-- Solo INSERT, no UPDATE ni DELETE
INSERT INTO profile_permissions (id, profile_id, resource, actions, scope)
SELECT gen_random_uuid(), p.id, r.resource, r.actions, r.scope
FROM profiles p
CROSS JOIN (VALUES
  -- Admin: todo
  ('dashboard', ARRAY['read'], 'all'),
  ('tickets', ARRAY['create','read','update','delete','assign','close'], 'all'),
  ('problems', ARRAY['create','read','update','delete'], 'all'),
  ('changes', ARRAY['create','read','update','delete','approve'], 'all'),
  ('kb', ARRAY['create','read','update','delete','publish'], 'all'),
  ('inbox', ARRAY['read','reply','assign','resolve'], 'all'),
  ('reports', ARRAY['read','export'], 'all'),
  ('assets', ARRAY['create','read','update','delete'], 'all'),
  ('projects', ARRAY['create','read','update','delete'], 'all'),
  ('settings', ARRAY['read','update'], 'all'),
  ('notifications', ARRAY['read','update'], 'all'),
  ('automations', ARRAY['create','read','update','delete'], 'all'),
  ('workflows', ARRAY['create','read','update','delete'], 'all'),
  ('service_catalog', ARRAY['read'], 'all'),
  ('organizations', ARRAY['create','read','update','delete'], 'all')
) AS r(resource, actions, scope)
WHERE p.name = 'Admin'
ON CONFLICT DO NOTHING;

-- Agent L1: limitado
INSERT INTO profile_permissions (id, profile_id, resource, actions, scope)
SELECT gen_random_uuid(), p.id, r.resource, r.actions, r.scope
FROM profiles p
CROSS JOIN (VALUES
  ('dashboard', ARRAY['read'], 'all'),
  ('tickets', ARRAY['create','read','update'], 'own'),
  ('problems', ARRAY['read'], 'all'),
  ('changes', ARRAY['read'], 'all'),
  ('kb', ARRAY['read'], 'all'),
  ('inbox', ARRAY['read','reply'], 'own'),
  ('notifications', ARRAY['read'], 'all')
) AS r(resource, actions, scope)
WHERE p.name = 'Agent L1'
ON CONFLICT DO NOTHING;

-- Agent L2: intermedio
INSERT INTO profile_permissions (id, profile_id, resource, actions, scope)
SELECT gen_random_uuid(), p.id, r.resource, r.actions, r.scope
FROM profiles p
CROSS JOIN (VALUES
  ('dashboard', ARRAY['read'], 'all'),
  ('tickets', ARRAY['create','read','update','close'], 'group'),
  ('problems', ARRAY['create','read','update'], 'group'),
  ('changes', ARRAY['create','read','update'], 'own'),
  ('kb', ARRAY['create','read','update'], 'all'),
  ('inbox', ARRAY['read','reply','assign'], 'group'),
  ('reports', ARRAY['read'], 'all'),
  ('assets', ARRAY['read'], 'all'),
  ('notifications', ARRAY['read'], 'all')
) AS r(resource, actions, scope)
WHERE p.name = 'Agent L2'
ON CONFLICT DO NOTHING;
```

**Riesgo:** NINGUNO. Solo agrega columnas con DEFAULT y INSERT en tabla vacía.

---

### PASO 2: Nuevo Service — `lib/services/user-permissions.service.ts` (0 riesgo)

Archivo 100% NUEVO, no modifica nada existente.

```typescript
// Funciones:

getUserType(client, userId)
// → Retorna: { type: 'tdx_agent' | 'org_user' | 'unknown',
//              agentId?, orgUserId?, organizationId?, role? }

getUserAllowedModules(client, userId)
// → Si es tdx_agent con role='admin': retorna TODOS los módulos
// → Si es tdx_agent con otro role: retorna módulos de su profile_permissions
// → Si es org_user: retorna INTERSECCIÓN de:
//     - enabled_modules de su organization
//     - módulos de su profile_permissions (si tiene profile_id)
//     - si NO tiene profile_id: retorna enabled_modules de su org

getUserPermissionsMatrix(client, userId)
// → Retorna la matriz completa: { module: string, actions: string[] }[]
// → Para la UI de RBAC

getAllUsersUnified(client, tenantId)
// → Retorna lista unificada de agents + org_users
// → Cada uno con: id, name, email, type, organization, role, modules[]
```

**Riesgo:** NINGUNO. Archivo nuevo, nadie lo importa hasta que lo usemos.

---

### PASO 3: Modificar Layout + Sidebar (riesgo BAJO)

**`home/layout.tsx`** — Agregar resolución de módulos:

```typescript
// ANTES (no cambiar):
export default async function HomeLayout({ children }) {
  await requireUserInServerComponent();
  return (
    <div>
      <SidebarNav />
      <Topbar />
      {children}
    </div>
  );
}

// DESPUÉS (agregar prop):
export default async function HomeLayout({ children }) {
  await requireUserInServerComponent();
  const client = getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();

  // NUEVO: resolver módulos permitidos (si falla, muestra todos)
  let allowedModules: string[] | null = null;
  if (user) {
    try {
      const { getUserAllowedModules } = await import('~/lib/services/user-permissions.service');
      allowedModules = await getUserAllowedModules(client, user.id);
    } catch { /* Si falla, null = todos permitidos */ }
  }

  return (
    <div>
      <SidebarNav allowedModules={allowedModules} />
      <Topbar />
      {children}
    </div>
  );
}
```

**`sidebar-nav.tsx`** — Filtrar por módulos:

```typescript
// ANTES:
export function SidebarNav() {
  const navItems = [...]; // todos los items
  return navItems.map(...);
}

// DESPUÉS:
export function SidebarNav({ allowedModules }: { allowedModules?: string[] | null }) {
  const navItems = [...]; // mismos items

  // NUEVO: filtrar (si null → mostrar todos = backwards compatible)
  const visibleItems = allowedModules
    ? navItems.filter(item => allowedModules.includes(item.module))
    : navItems;

  return visibleItems.map(...);
}
```

**Riesgo BAJO:** Si `allowedModules` es null (default), se muestran todos los items = comportamiento idéntico al actual.

---

### PASO 4: Nueva Página — Settings > Users & Permissions (0 riesgo)

Archivos 100% NUEVOS:

```
apps/web/app/home/settings/users-permissions/
  ├── page.tsx                        (Server Component)
  └── _components/
      ├── users-list-client.tsx       (tabla unificada agents + org_users)
      └── permission-matrix.tsx       (matriz RBAC visual por usuario)
```

**Contenido de la tabla unificada:**

| Column | Source |
|--------|--------|
| Name | agents.name / org_users.name |
| Email | agents.email / org_users.email |
| Type | "🔑 TDX Agent" / "🏢 Client User" |
| Organization | agent_organizations.org_name / org_users.org_name |
| Role | agents.role / org_users.role |
| Profile | profiles.name (via profile_id) |
| Modules | count de módulos habilitados |
| Status | is_active badge |
| Actions | [Edit Permissions] button |

**Contenido de la matriz RBAC (al hacer click en un usuario):**

```
┌──────────────────────────────────────────────────────────────┐
│ Edit Permissions: Juan Martinez (ACME Corporation)           │
│                                                              │
│ Profile: [Admin ▼]  ← Cambia todos los permisos de golpe    │
│                                                              │
│ Organization: [ACME Corp ▼]  ← Solo para org_users           │
│                                                              │
│ Custom Permissions:                                          │
│ ┌────────────────┬──────┬────────┬──────┬────────┬────────┐ │
│ │ Module         │ View │ Create │ Edit │ Delete │ Special│ │
│ ├────────────────┼──────┼────────┼──────┼────────┼────────┤ │
│ │ Dashboard      │  ☑   │   —    │  —   │   —    │   —    │ │
│ │ Tickets        │  ☑   │   ☑    │  ☑   │   ☐    │ Assign │ │
│ │ Problems       │  ☑   │   ☐    │  ☐   │   ☐    │   —    │ │
│ │ Changes        │  ☐   │   ☐    │  ☐   │   ☐    │   —    │ │
│ │ KB             │  ☑   │   ☐    │  ☐   │   ☐    │   —    │ │
│ │ Inbox          │  ☑   │   ☑    │  ☑   │   ☐    │ Resolve│ │
│ │ Reports        │  ☑   │   —    │  —   │   —    │ Export │ │
│ │ Assets         │  ☐   │   ☐    │  ☐   │   ☐    │   —    │ │
│ │ Projects       │  ☐   │   ☐    │  ☐   │   ☐    │   —    │ │
│ │ Automations    │  ☐   │   ☐    │  ☐   │   ☐    │   —    │ │
│ │ Settings       │  ☑*  │   —    │  ☑*  │   —    │ *own   │ │
│ │ Organizations  │  ☐   │   ☐    │  ☐   │   ☐    │   —    │ │
│ └────────────────┴──────┴────────┴──────┴────────┴────────┘ │
│                                                              │
│ Scope: (own) Solo sus propios records                        │
│        (group) Records de su grupo                           │
│        (all) Todos los records de la organización            │
│                                                              │
│ [Cancel]                                    [Save Permissions]│
└──────────────────────────────────────────────────────────────┘
```

**Riesgo:** NINGUNO. Páginas nuevas, no modifican nada existente.

---

### PASO 5: Middleware — Redirect org_users (riesgo BAJO)

```typescript
// En middleware.ts, AGREGAR (no modificar) esta lógica:

// DESPUÉS de la validación de auth existente, AGREGAR:
if (pathname.startsWith('/home')) {
  // Verificar si es org_user (no tiene agents record)
  // Si es org_user → dejar pasar a /home PERO la sidebar ya estará filtrada
  // NO redirigir a /portal — el usuario de cliente usa la MISMA interfaz
  // pero con módulos limitados
}
```

**Cambio real en middleware:** MÍNIMO. Solo agregar un check que NO bloquea nada. La limitación real es en la sidebar (Paso 3).

---

## 4. ORDEN DE EJECUCIÓN

```
Paso 1: Migration DB ──────── 0 riesgo, solo ADD COLUMN + INSERT
           ↓
Paso 2: Nuevo service ─────── 0 riesgo, archivo nuevo
           ↓
Paso 3: Layout + Sidebar ──── riesgo BAJO, backwards compatible
           ↓
Paso 4: Nueva página RBAC ─── 0 riesgo, páginas nuevas
           ↓
Paso 5: Middleware (mínimo) ── riesgo BAJO, solo agrega IF
```

## 5. REGRESIÓN: QUÉ NO SE TOCA

```
❌ NO se tocan Server Actions (tickets, problems, changes, kb, inbox, etc.)
❌ NO se tocan Zod Schemas existentes
❌ NO se tocan Service engines (SLA, Rules, Workflow, Notification, Metrics)
❌ NO se tocan AI Agents ni RAG pipeline
❌ NO se tocan API Routes (REST, AI, Cron, Webhooks)
❌ NO se tocan Client Components existentes
❌ NO se tocan Portal pages
❌ NO se toca la función get_current_tenant_id()
❌ NO se tocan RLS policies
❌ NO se tocan índices ni triggers existentes
```

## 6. ESTIMACIÓN

| Paso | Archivos | Tiempo |
|------|----------|--------|
| 1. Migration | 1 SQL | 15 min |
| 2. Service | 1 TS | 30 min |
| 3. Layout + Sidebar | 2 modificados | 30 min |
| 4. Página RBAC | 3 nuevos | 1 hora |
| 5. Middleware | 1 modificado | 15 min |
| **Total** | **8 archivos** | **~2.5 horas** |

---

*Plan pendiente de aprobación. ZERO regresión garantizada.*
