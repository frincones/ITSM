# Arquitectura del MCP Server — NovaDesk ITSM

> **Estado:** ✅ **Operativo en producción y registrable por Claude Code/Desktop/Cursor** — commit `e1ceec2` (29 abr 2026).
> **URL producción:** `https://itsm-web.vercel.app/api/mcp`
> **Manifest público:** `https://itsm-web.vercel.app/api/mcp/manifest`
> **Transport:** MCP Streamable HTTP (spec 2025-03-26) — JSON-RPC 2.0 + `Mcp-Session-Id` + SSE GET.
> **Smoke test:** 10/10 pass + transport handshake validado + 31/31 tools con `inputSchema` válido.
> **Tools registrados:** 31 en 11 dominios; **23 scopes**.
> **Objetivo:** Permitir que agentes externos (Claude Desktop, Cursor, Claude Code, Zapier, n8n, copilots de clientes Enterprise) y agentes internos consuman datos y operen sobre tickets, organizaciones, KB y demás recursos de NovaDesk a través de un único endpoint estandarizado.

> ### ⚠️ Nomenclatura de tools — leer antes de integrar
>
> Los nombres usan **underscore** como separador: `tickets_list` (no `tickets.list`), `kb_search` (no `kb.search`), `metrics_ticket_summary`, etc.
> Razón: la API de Anthropic valida tool names contra `^[a-zA-Z0-9_-]{1,64}$` y rechaza dots.
> El namespacing semántico (`<dominio>_<acción>`) se conserva — solo cambia el separador.

---

## ⚡ Quick Start — conectar un cliente en 60 segundos

### A. Claude Code (CLI)

```bash
# Agregar el MCP al proyecto actual
claude mcp add --scope project --transport http novadesk \
  https://itsm-web.vercel.app/api/mcp \
  --header "Authorization: Bearer nvd_live_TU_API_KEY"

# Verificar
claude /mcp
# → debería listar "novadesk" con 31 tools

# A nivel usuario (todas tus sesiones)
claude mcp add --scope user --transport http novadesk \
  https://itsm-web.vercel.app/api/mcp \
  --header "Authorization: Bearer nvd_live_TU_API_KEY"
```

### B. Claude Desktop

Edita `%APPDATA%\Claude\claude_desktop_config.json` (Windows) o `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac):

```json
{
  "mcpServers": {
    "novadesk": {
      "transport": "http",
      "url": "https://itsm-web.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer nvd_live_TU_API_KEY"
      }
    }
  }
}
```

Reiniciar Claude Desktop. Las 31 tools aparecen en el indicador de herramientas (icono de martillo).

### C. Cursor

Settings → MCP → Add Server:
- **Type:** HTTP
- **URL:** `https://itsm-web.vercel.app/api/mcp`
- **Headers:** `Authorization: Bearer nvd_live_TU_API_KEY`

### D. Cualquier cliente HTTP / curl

```bash
curl -X POST https://itsm-web.vercel.app/api/mcp \
  -H "Authorization: Bearer nvd_live_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": { "name": "tickets_list", "arguments": { "limit": 5 } }
  }'
```

---

## 🔑 Cómo generar un API key

### Opción 1 — UI (recomendada para humanos)

1. Login en `https://itsm-web.vercel.app/auth/sign-in` con cuenta admin/supervisor
2. Ir a `/home/settings/api-keys`
3. **Create API Key**:
   - Name (ej. "Claude Desktop personal")
   - Environment: `live` o `test`
   - Scopes: pickear los necesarios o "All read"
   - Rate limit: 60/min default
4. **Copiar la plain key inmediatamente** — solo se muestra una vez
5. Almacenar en gestor de secretos / config del cliente

### Opción 2 — Script ops (recomendada para automation)

`scripts/apply-mcp-migration-and-create-key.mjs` aplica la migración 00039 si falta y crea una key con todos los scopes para el primer tenant:

```bash
cd <repo>
PG_CONNECTION_STRING="postgresql://postgres.<ref>:<pwd>@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
node scripts/apply-mcp-migration-and-create-key.mjs
```

Output:
```
✓ Connected to Postgres
✓ api_keys table already present — skipping migration
✓ Using tenant: NovaDesk Demo — id 8be06573-...
✓ API key created

  PLAIN KEY (copy now — never shown again):
     nvd_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Variables soportadas:
- `KEY_NAME` (default: `mcp-test-fullaccess`)
- `KEY_DESCRIPTION`
- `KEY_RPM` (default: 120)

### Opción 3 — SQL directo (operadores DB)

```sql
INSERT INTO api_keys (
  tenant_id, name, environment, key_prefix, key_hash, scopes, rate_limit_rpm
) VALUES (
  '<tenant-uuid>',
  'name',
  'live',
  'nvd_live_xxx',           -- primeros 12 chars del plain key
  encode(digest('<plain-key>', 'sha256'), 'hex'),  -- requiere pgcrypto
  ARRAY['tickets:read','kb:search']::text[],
  60
);
```

---

## 📋 Validación end-to-end — 10/10 pass en producción

```
▶ 1. GET /api/mcp/manifest (public)
  ✓ HTTP 200
  ✓ server.name == "novadesk-itsm"
  ✓ tool catalog: 31 tools
  ✓ protocolVersion: 2025-03-26

▶ 2. POST /api/mcp ping (public)
  ✓ HTTP 200, JSON-RPC envelope correct

▶ 3. POST /api/mcp initialize (public)
  ✓ HTTP 200, includes protocolVersion + serverInfo

▶ 4. POST /api/mcp tools/list WITHOUT Bearer → must 401
  ✓ HTTP 401 with code -32001 (Unauthorized)

▶ 5. POST /api/mcp tools/list WITH key
  ✓ HTTP 200, 31 tools listed

▶ 6. POST /api/mcp tools/call name=tickets_list
  ✓ HTTP 200, returned 534 tickets (real data)

▶ 7. POST /api/mcp tools/call name=metrics_ticket_summary
  ✓ HTTP 200
    total: 534
    by_status: {"closed":359, "in_progress":12, "detenido":3,
                "assigned":40, "resolved":11, "backlog":18,
                "testing":29, "new":49, "cancelled":6,
                "pending":6, "reopened":1}
```

Para re-ejecutar:
```bash
MCP_BASE_URL=https://itsm-web.vercel.app \
MCP_API_KEY=nvd_live_xxx \
bash scripts/test-mcp.sh
```

---

---

## Índice

1. [Visión y decisión arquitectónica](#1-visión-y-decisión-arquitectónica)
2. [Mapa completo de capas](#2-mapa-completo-de-capas)
3. [Capa 1 — Base de datos (migración 00039)](#3-capa-1--base-de-datos-migración-00039)
4. [Capa 2 — Servicios](#4-capa-2--servicios)
5. [Capa 3 — Foundation MCP](#5-capa-3--foundation-mcp)
6. [Capa 4 — Catálogo completo de tools (28)](#6-capa-4--catálogo-completo-de-tools-28)
7. [Capa 5 — Transport HTTP (JSON-RPC 2.0)](#7-capa-5--transport-http-json-rpc-20)
8. [Capa 6 — UI de gestión](#8-capa-6--ui-de-gestión)
9. [Modelo de seguridad y aislamiento multi-tenant](#9-modelo-de-seguridad-y-aislamiento-multi-tenant)
10. [Flujo end-to-end de una llamada](#10-flujo-end-to-end-de-una-llamada)
11. [Compatibilidad y no-regresión](#11-compatibilidad-y-no-regresión)
12. [Operación: cómo desplegar y probar](#12-operación-cómo-desplegar-y-probar)
13. [Extensibilidad: lo que viene "gratis"](#13-extensibilidad-lo-que-viene-gratis)
14. [Catálogo completo de archivos](#14-catálogo-completo-de-archivos)
15. [Métricas del entregable](#15-métricas-del-entregable)
16. [Roadmap recomendado](#16-roadmap-recomendado)

---

## 1. Visión y decisión arquitectónica

### Problema

NovaDesk ITSM necesita exponer su data (tickets, KB, organizaciones, SLAs) a:

- Agentes externos (Claude Desktop, Cursor, ChatGPT custom) que los clientes Enterprise quieren conectar.
- Integraciones SaaS (Zapier, n8n, Make).
- Agentes AI internos (triage, clasificación, KB-suggest).
- App móvil futura.
- Workflows / automation hub.
- RPA y batch jobs externos.

**La REST API artesanal `/api/v1/tickets` no escala** a este alcance: no hay descubrimiento, no hay tipado, requiere documentación manual, y requiere implementar cada nueva capacidad como endpoint custom.

### Decisión

**Construir un MCP Server (Model Context Protocol)** sobre el mismo Next.js 15, en `/api/mcp`, hablando JSON-RPC 2.0 (spec 2025-03-26 — Streamable HTTP). MCP es el estándar de facto para conectar capacidades a agentes AI; es transport-agnóstico, permite descubrimiento automático, y hoy lo soportan nativamente los clientes principales del ecosistema.

| Opción | Veredicto |
|---|---|
| **MCP HTTP** (Streamable HTTP, spec 2025-03-26) | ✅ **Elegida** — multi-cliente, multi-tenant, autenticada, escalable en Vercel |
| MCP stdio (proceso local) | ❌ No sirve para SaaS (un cliente único) |
| WebSocket / SSE legacy | ❌ Deprecada en spec actual |
| Solo REST artesanal | ❌ No estandarizada, sin descubrimiento, no la consumen agentes AI |

### Principio de diseño

> **El MCP no es una integración: es la nueva backbone programática de NovaDesk.**

Toda interacción programática futura (UI, agentes internos, integraciones, workflows, marketplace) puede consumir este registry. El catálogo de tools crece sin reescribir el chasis.

---

## 2. Mapa completo de capas

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CALLERS (cualquiera)                              │
│  Claude Desktop · Cursor · Zapier · n8n · agentes internos AI ·      │
│  futuras integraciones · workflows · tu propia UI                    │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ JSON-RPC 2.0 + Bearer <api_key>
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  TRANSPORT LAYER (HTTP)                              │
│  app/api/mcp/route.ts          ← JSON-RPC dispatcher                 │
│  app/api/mcp/manifest/route.ts ← descubrimiento público              │
└────────────────────────────┬─────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│              AUTH + RATE LIMIT + AUDIT MIDDLEWARE                    │
│  verifyApiKey() · checkRateLimit() · recordMcpCall()                 │
└────────────────────────────┬─────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  REGISTRY (transport-agnostic)                       │
│  lib/mcp/registry.ts + MCPContext (tenantId, scopes, supabase)       │
└────────────────────────────┬─────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│      28 TOOLS en 10 dominios — cada uno filtra tenant_id             │
│  tickets · organizations · contacts · agents · kb · problems ·       │
│  changes · assets · slas · metrics · audit                           │
└────────────────────────────┬─────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│      DATA LAYER (Supabase Postgres + RLS — schema compartido)        │
│  tickets · agents · contacts · organizations · slas · kb_articles ·  │
│  problems · changes · assets · daily_metrics · audit_logs ·          │
│  api_keys ★ · mcp_audit_log ★ · mcp_rate_buckets ★ (★ = nuevo)       │
└──────────────────────────────────────────────────────────────────────┘
```

**Stack concreto:**

```
Frontend / Transport: Next.js 15.5.9 (App Router) + TypeScript strict
Backend:              Next.js Route Handlers (app/api/mcp/route.ts)
Database:             Supabase PostgreSQL 15 + RLS
Auth:                 SHA-256 hashed API keys (Bearer header)
Rate Limit:           In-DB token bucket (PostgreSQL UPSERT atómico)
Audit:                mcp_audit_log table (separada de audit_logs)
Validation:           Zod (compartido client+server)
Discovery:            JSON Schema autogenerado desde Zod
Protocol:             MCP 2025-03-26 sobre JSON-RPC 2.0
```

---

## 3. Capa 1 — Base de datos (migración 00039)

**Archivo:** `apps/web/supabase/migrations/00039_api_keys_and_mcp.sql`

Tres tablas nuevas + dos funciones SECURITY DEFINER. **Aditivas, sin tocar nada existente.**

### 3.1. Tabla `api_keys`

```sql
CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  environment     api_key_environment NOT NULL DEFAULT 'live',  -- 'live' | 'test'
  key_prefix      text NOT NULL,        -- primeros ~12 chars visibles ("nvd_live_abcd")
  key_hash        text NOT NULL UNIQUE, -- SHA-256 hex (64 chars)
  scopes          text[] NOT NULL DEFAULT '{}',
  rate_limit_rpm  integer NOT NULL DEFAULT 60,  -- 0 = ilimitado
  organization_ids uuid[],              -- opcional: allowlist de orgs
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,
  last_used_at    timestamptz,
  last_used_ip    inet,
  usage_count     bigint NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES agents(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES agents(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS estándar (4 policies con get_current_tenant_id)
-- Trigger set_updated_at
-- Indexes:
--   idx_api_keys_tenant
--   idx_api_keys_hash_active (parcial: WHERE is_active AND revoked_at IS NULL)
--   idx_api_keys_tenant_active (parcial)
```

**Decisiones de diseño:**

- **SHA-256 (no bcrypt).** Para API keys de 32 bytes random, la entropía hace bcrypt innecesario. SHA-256 permite búsqueda exacta vía índice (verificación O(log n)). Es el estándar industria (GitHub, Stripe).
- **`key_prefix` para UI.** Permite identificar la key en listados sin exponer secret.
- **`organization_ids[]`** habilita keys con scope a sub-orgs específicas (multi-cliente dentro de un tenant). Nullable significa "todas las orgs del tenant".
- **`expires_at`** opcional permite keys de corto plazo para PoCs / pentesting.

### 3.2. Tabla `mcp_audit_log`

```sql
CREATE TABLE mcp_audit_log (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  api_key_id      uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,  -- NULL para API-key calls
  channel         text NOT NULL CHECK (channel IN ('mcp', 'rest', 'internal')),
  tool_name       text NOT NULL,
  status          text NOT NULL,  -- 'success' | 'error' | 'forbidden' | 'rate_limited' | 'invalid_input' | 'unauthorized'
  status_code     integer,        -- 200, 400, 401, 403, 422, 429, 500
  arguments       jsonb,          -- sanitized: secrets redacted, cap 8KB
  error_message   text,
  duration_ms     integer,
  ip_address      inet,
  user_agent      text,
  request_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Por qué separar de `audit_logs`:**

`audit_logs` (migración 00014) tiene un `CHECK` constraint que solo acepta 10 acciones (`create`, `update`, `delete`, `login`, `logout`, `assign`, `escalate`, `close`, `reopen`, `export`). Modificar ese CHECK es un cambio invasivo. Además, mezclar logs de mutación de UI con logs de tool calls infla la tabla compliance. La separación es deliberada.

**Indexes:**
```
idx_mcp_audit_tenant_created     (tenant_id, created_at DESC)
idx_mcp_audit_key_created        (api_key_id, created_at DESC)
idx_mcp_audit_tool               (tenant_id, tool_name, created_at DESC)
idx_mcp_audit_failures           (tenant_id, created_at DESC) WHERE status <> 'success'
```

### 3.3. Tabla `mcp_rate_buckets`

```sql
CREATE TABLE mcp_rate_buckets (
  api_key_id      uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  bucket_minute   timestamptz NOT NULL,
  call_count      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, bucket_minute)
);
```

Naive in-DB rate limiter. Una fila por (API key, minuto). Auto-purga de filas >10 min en cada incremento. **Swapeable a Redis/Upstash sin cambiar handlers.**

### 3.4. Funciones helper

#### `verify_api_key(p_key_hash text, p_ip inet)`

```sql
RETURNS TABLE (id uuid, tenant_id uuid, scopes text[], rate_limit_rpm int,
               organization_ids uuid[], environment api_key_environment)
LANGUAGE plpgsql SECURITY DEFINER
```

Atómicamente:
1. Busca la key activa, no revocada, no expirada con ese hash.
2. Actualiza `last_used_at`, `last_used_ip`, incrementa `usage_count`.
3. Retorna el contexto del key (o 0 filas si inválida).

Una sola sentencia `UPDATE...RETURNING` — no race conditions.

#### `increment_rate_bucket(p_api_key_id uuid, p_window_seconds int = 60)`

```sql
RETURNS integer  -- contador después del incremento
LANGUAGE plpgsql SECURITY DEFINER
```

UPSERT atómico en `mcp_rate_buckets` con `date_trunc('minute', now())`. Cleanup oportunista de buckets >10 min.

---

## 4. Capa 2 — Servicios

### 4.1. `lib/services/api-key.service.ts`

Lógica pura, sin `'use server'`. Reusable desde route handlers, server actions, cron jobs y tests.

```ts
// Hashing
hashApiKey(plainKey: string): string
generatePlainKey(env: 'live'|'test'): string  // → 'nvd_live_<32 chars>'
derivePrefix(plainKey: string): string         // primeros 12 chars

// CRUD
createApiKey(client, input): Promise<{ record, plainKey }>  // plain solo aquí
verifyApiKey(client, plainKey, ip?): Promise<VerifiedApiKey | null>
checkRateLimit(client, apiKeyId, rpm): Promise<{ allowed, current, limit }>
listApiKeys(client, tenantId): Promise<ApiKeyRecord[]>      // sin plain
revokeApiKey(client, tenantId, keyId, revokedBy): Promise<true>

// Scopes
hasScope(granted: string[], required: string): boolean
ALL_SCOPES  // catálogo de 23 scopes

// Tipos
ApiKeyRecord, ApiKeyEnvironment, VerifiedApiKey, CreateApiKeyInput, CreatedApiKey, Scope
```

**Reglas de diseño:**

- **Plain key una sola vez.** Después de `createApiKey()`, nunca más se devuelve. Solo `key_prefix`.
- **Sanitización en hashing.** UTF-8 explícito + hex digest para evitar charset issues.
- **Fail-open en rate-limiter.** Si el limiter mismo falla, dejamos pasar (con audit) en lugar de bloquear. Disponibilidad sobre estricta enforcement.

### 4.2. Wildcards de scopes

```
"tickets:read"       → match exacto
"tickets:*"          → cualquier acción del recurso tickets
"*:read"             → cualquier recurso, acción read
"admin:*"            → super-key (todo)
"*"                  → super-key alternativa
```

Implementado en `hasScope(granted, required)`. Permite que keys nazcan minimalistas y crezcan sin redefinir el catálogo.

### 4.3. `ALL_SCOPES` (23 scopes)

```
tickets:read        tickets:write       tickets:comment     tickets:assign      tickets:delete
organizations:read  organizations:write
contacts:read       contacts:write
agents:read
kb:read             kb:search           kb:write
problems:read       problems:write
changes:read        changes:write
assets:read         assets:write
slas:read           metrics:read        audit:read          webhooks:manage
```

---

## 5. Capa 3 — Foundation MCP

```
apps/web/lib/mcp/
├── errors.ts        ← McpError + códigos JSON-RPC + helpers
├── context.ts       ← MCPContext (interfaz central)
├── registry.ts      ← ToolRegistry + invoke()
├── audit.ts         ← recordMcpCall() (sanitiza, fire-and-forget)
├── schemas.ts       ← Pagination utilities
├── json-schema.ts   ← Zod → JSON Schema converter (sin dependencia)
└── server.ts        ← bootstrap + constants
```

### 5.1. `errors.ts` — códigos JSON-RPC 2.0

```ts
JsonRpcErrorCode = {
  // Estándar
  ParseError:       -32700,
  InvalidRequest:   -32600,
  MethodNotFound:   -32601,
  InvalidParams:    -32602,
  InternalError:    -32603,
  // Aplicación (rango -32000..-32099)
  Unauthorized:     -32001,  → HTTP 401
  Forbidden:        -32002,  → HTTP 403
  RateLimited:      -32003,  → HTTP 429
  NotFound:         -32004,  → HTTP 404
  Conflict:         -32005,  → HTTP 409
  ValidationError:  -32006,  → HTTP 422
}
```

Helpers tipados: `unauthorized()`, `forbidden(msg)`, `rateLimited(limit)`, `notFound(resource)`, `validationError(msg, details)`, `methodNotFound(method)`, `invalidParams(msg, details)`.

`McpError` mantiene `code`, `httpStatus`, `data` para el envelope JSON-RPC + el HTTP response.

### 5.2. `context.ts` — abstracción central

```ts
export interface MCPContext {
  tenantId: string;                    // resuelto del API key, NUNCA del input
  scopes: string[];                    // wildcards permitidos
  organizationIds: string[] | null;    // org-allowlist opcional
  caller: McpCallerMeta;               // apiKeyId, agentId, channel, ip, ua, requestId
  supabase: SupabaseClient;            // service-role; tools filtran tenant_id explícito

  // Helpers para tools
  requireScope(scope: string): void;                   // throws Forbidden
  resolveOrgFilter(requestedIds?: string[]): string[]|null;  // AND-merge
}
```

**`resolveOrgFilter()`** es la pieza clave para multi-cliente:
- Si la key tiene `organization_ids` allowlist y caller pide otra org → se intersecta.
- Si caller no pide nada y key tiene allowlist → se aplica allowlist.
- Si key sin allowlist y caller pide org → se respeta caller.

### 5.3. `registry.ts` — catálogo transport-agnostic

```ts
interface ToolDefinition<TInput, TOutput> {
  name: string;            // dotted: 'tickets_list'
  description: string;
  scope: string;           // required scope
  inputSchema: ZodSchema;
  outputSchema?: ZodSchema;
  handler: (ctx: MCPContext, input) => Promise<TOutput>;
  meta?: { since?, deprecated?, tags? };
}

class ToolRegistry {
  register(def): void;
  invoke(name, ctx, rawInput): Promise<unknown>;
    // 1. Lookup → MethodNotFound si no existe
    // 2. ctx.requireScope(def.scope) → Forbidden si no tiene
    // 3. inputSchema.safeParse(rawInput) → InvalidParams con issues[]
    // 4. handler(ctx, parsed.data)
  list(): ToolDefinition[];
}

export const registry = new ToolRegistry();  // singleton
```

**Esta es la pieza que hace al MCP plataforma.** El registry no sabe nada de HTTP. El mismo `registry.invoke('tickets_create', ctx, input)` funciona desde:
- HTTP route handler (este repo)
- Cron job interno
- Workflow engine
- Test unitario
- Llamada in-process desde un agente AI interno

### 5.4. `audit.ts` — writer

```ts
recordMcpCall(client, entry): Promise<void>
```

Inserta en `mcp_audit_log` con sanitización:
- Strips fields cuyo nombre contenga `password`, `secret`, `token`, `apiKey`.
- Cap a 8KB → guarda `{ _truncated: true, _size: N }`.
- Fire-and-forget: si falla solo logea a console.

### 5.5. `schemas.ts` + `json-schema.ts`

- `PaginationInput` (zod), `rangeFromPagination()`, `buildPaginationOutput()`.
- `zodToJsonSchema()` minimal converter — soporta object, string, number, integer, boolean, array, enum, optional, default, nullable, union, literal, record.
- Sin dependencia de `zod-to-json-schema` para mantener bundle pequeño.

### 5.6. `server.ts` — bootstrap

Imports cada módulo de dominio (auto-registran tools en el singleton). Re-exporta `registry` y constants:

```ts
MCP_SERVER_VERSION = '1.0.0'
MCP_PROTOCOL_VERSION = '2025-03-26'
MCP_SERVER_NAME = 'novadesk-itsm'
```

Para añadir un dominio nuevo: crear archivo en `lib/mcp/tools/<dominio>.ts` + 1 línea de import en `server.ts`.

---

## 6. Capa 4 — Catálogo completo de tools (28)

Cada tool: `(ctx: MCPContext, input: zod-validated) => Promise<output>`. Self-register al cargar el módulo.

### 6.1. `tickets.*` (8 tools, scope `tickets:*`)

| Tool | Scope | Input | Output |
|---|---|---|---|
| `tickets_list` | `tickets:read` | filters (status[], type[], urgency, assigned_*, organization_id, dates, search), sort, page, limit | `{ data: Ticket[], pagination }` |
| `tickets_get` | `tickets:read` | `id` o `ticket_number`, include_followups/tasks/solutions | `{ ticket, followups?, tasks?, solutions? }` |
| `tickets_search` | `tickets:read` | `query` (≥2 chars), limit | `{ data, query }` (ilike sobre title+description) |
| `tickets_create` | `tickets:write` | title, description, type, urgency, impact, organization_id, category_id, requester_id/email, tags | `{ ticket }` |
| `tickets_update` | `tickets:write` | id + campos parciales | `{ ticket }` |
| `tickets_add_comment` | `tickets:comment` | ticket_id, content, content_html?, is_private | `{ followup }` |
| `tickets_assign` | `tickets:assign` | ticket_id, assigned_agent_id?, assigned_group_id? | `{ ticket }` (auto-transition a `assigned` si nuevo) |
| `tickets_transition_status` | `tickets:write` | ticket_id, status, resolution_note? | `{ ticket }` (auto-llena resolved_at/closed_at) |

**Nota importante:** estas tools **NO** llaman a los Server Actions existentes (`lib/actions/tickets.ts`) porque esos dependen de `auth.uid()` JWT — inválido para API-key callers. Replican la lógica mínima necesaria con queries Supabase directas. Auto-assignment, AI classification y notificaciones de followers siguen ocurriendo via los triggers/workflows DB que ya existen.

### 6.2. `organizations.*` (2 tools)

| Tool | Scope | Notas |
|---|---|---|
| `organizations_list` | `organizations:read` | filters (is_active, search), pagination, honra `resolveOrgFilter()` |
| `organizations_get` | `organizations:read` | by id o slug |

### 6.3. `contacts.*` (3 tools)

| Tool | Scope | Notas |
|---|---|---|
| `contacts_list` | `contacts:read` | filters (search, email exacto), pagination |
| `contacts_get` | `contacts:read` | by id o email |
| `contacts_upsert` | `contacts:write` | crea o updates por email — útil para ingestion automatizado |

### 6.4. `agents.*` (2 tools)

| Tool | Scope | Notas |
|---|---|---|
| `agents_list` | `agents:read` | filters (is_active, role) |
| `agents_get` | `agents:read` | by id |

Read-only. Mutations stay in admin UI.

### 6.5. `kb.*` (3 tools)

| Tool | Scope | Notas |
|---|---|---|
| `kb_list_categories` | `kb:read` | jerarquía completa (parent_id), filtro is_active |
| `kb_search` | `kb:search` | text-based ilike sobre title+content; filters (category, language, tags, only_public, include_drafts) |
| `kb_get_article` | `kb:read` | by id o slug, devuelve markdown completo |

**Vector search no expuesto en v1.** El RPC `match_knowledge` (pgvector) ya existe en DB; agregar `kb_semantic_search` requiere endpoint de embeddings (OpenAI) — postpuesto para v2 cuando tengamos llave configurada por tenant.

### 6.6. `problems.*` (3 tools)

| Tool | Scope | Notas |
|---|---|---|
| `problems_list` | `problems:read` | filters (status[], urgency, assigned), pagination |
| `problems_get` | `problems:read` | by id o problem_number, opcional `include_linked_tickets` |
| `problems_create` | `problems:write` | title, description, urgency, impact, category |

### 6.7. `changes.*` (2 tools)

| Tool | Scope | Notas |
|---|---|---|
| `changes_list` | `changes:read` | filters (status[], change_type, scheduled_*) |
| `changes_get` | `changes:read` | by id o change_number, devuelve impact_analysis + rollback_plan |

Read-only en v1 (creates de changes pasan por aprobación, mejor mantener en UI por ahora).

### 6.8. `assets.*` (2 tools)

| Tool | Scope | Notas |
|---|---|---|
| `assets_list` | `assets:read` | filters (status[], assigned_to, asset_type_id) |
| `assets_get` | `assets:read` | by id o asset_tag |

### 6.9. `slas.*` (2 tools)

| Tool | Scope | Notas |
|---|---|---|
| `slas_list` | `slas:read` | targets por urgencia, calendar, is_active |
| `slas_get_breaches` | `slas:read` | tickets que ya breached o breachearán dentro de `within_minutes` (default 0 = ya) |

Esta segunda es **enormemente valiosa** para agentes de monitoreo / alerting externos.

### 6.10. `metrics.*` (2 tools)

| Tool | Scope | Notas |
|---|---|---|
| `metrics_daily` | `metrics:read` | lee `daily_metrics` pre-agregada (count, avg_resolution_minutes, sla_met/breached) |
| `metrics_ticket_summary` | `metrics:read` | live counts por status + urgency, opcional org filter |

### 6.11. `audit.*` (2 tools)

| Tool | Scope | Notas |
|---|---|---|
| `audit_list` | `audit:read` | lee `audit_logs` (UI mutations) — filters resource_type, action, user, dates |
| `audit_mcp_calls` | `audit:read` | lee `mcp_audit_log` — filters tool_name, status, api_key_id, channel |

Permite a un agente externo auditar uso de su propia API key.

### 6.12. Reglas comunes a TODAS las tools

1. **`.eq('tenant_id', ctx.tenantId)`** en cada query — verificable por inspección.
2. **`.is('deleted_at', null)`** donde aplica (tickets, problems, changes, kb_articles).
3. **`ctx.resolveOrgFilter(...)`** + `.in('organization_id', filter)` cuando aplica.
4. **Pagination cap server-side a 100.** Inputs con `limit` superior se rechazan en Zod.
5. **Selección explícita de columnas** — nunca `SELECT *`.
6. **Sanitización de search:** `query.replace(/[%_,]/g, ' ')` antes de `.or(...ilike%${safe}%...)`.

---

## 7. Capa 5 — Transport HTTP (JSON-RPC 2.0)

### 7.1. `app/api/mcp/route.ts` — endpoint principal

#### Métodos JSON-RPC implementados

| Método | Auth requerida | Devuelve |
|---|---|---|
| `ping` | ❌ | `{}` |
| `initialize` | ❌ | `{ protocolVersion, serverInfo, capabilities, instructions }` |
| `tools/list` | ✅ | `{ tools: [{ name, description, inputSchema, _meta: {scope, since, tags}}] }` |
| `tools/call` | ✅ | `{ content: [{type:'text', text}], structuredContent, isError }` (formato MCP spec) |
| `resources/list` | ✅ | `{ resources: [] }` (reservado para v2) |
| `prompts/list` | ✅ | `{ prompts: [] }` (reservado para v2) |
| `notifications/*` | ✅ | acks silenciosos |

#### Pipeline por request (single)

```
1. POST body parse → ParseError -32700 si JSON inválido
2. Validate envelope (jsonrpc='2.0', method) → InvalidRequest -32600
3. Si method público (ping, initialize) → responder y salir
4. extractBearer(Authorization) → Unauthorized -32001 si falta
5. verifyApiKey(supabase, bearer, ip) → Unauthorized -32001 si inválida
6. checkRateLimit(supabase, key.id, rpm) → RateLimited -32003 si excede
7. buildContext({ tenantId, scopes, organizationIds, caller, supabase })
8. Switch method:
   - tools/list      → registry.list().map(zodToJsonSchema)
   - tools/call      → registry.invoke(params.name, ctx, params.arguments)
   - resources/list  → []
   - prompts/list    → []
   - else            → MethodNotFound -32601
9. registry.invoke():
   - requireScope() → Forbidden -32002
   - inputSchema.safeParse() → InvalidParams -32602 con issues[]
   - handler(ctx, validatedInput)
10. recordMcpCall(...) — siempre, success o failure
11. JSON-RPC envelope con httpStatus apropiado
```

#### Soporte de batch (JSON-RPC 2.0 spec)

`POST` con `[req1, req2, ...]` → `[resp1, resp2, ...]` ejecutados en paralelo via `Promise.all()`. Cada uno auditado individualmente.

#### Auth scheme

```
Authorization: Bearer nvd_live_<32 chars>
```

Estándar industria, portable a cualquier cliente HTTP. **NO** usamos un header custom (`X-API-Key`) porque limita interoperabilidad.

#### GET handler — SSE stream (Streamable HTTP)

Abre un canal SSE para mensajes server-pushed. Aunque hoy no empujamos eventos asíncronos, los clientes MCP (Claude Code, Desktop, Cursor) lo abren tras `initialize` como parte del handshake — devolver 405 rompe la conexión.

**Comportamiento:**
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `X-Accel-Buffering: no` (deshabilita buffering en Vercel/Cloudflare)
- Comentario inicial (`: mcp stream open`) para forzar flush de headers en proxies
- Heartbeat cada 15 s (`: heartbeat <ts>`) para evitar que middleboxes cierren la conexión
- Self-close a 50 s para evitar que `maxDuration` la mate bruscamente — los clientes reconectan transparente
- `req.signal` listener para cerrar limpio cuando el cliente desconecta
- Echo del `Mcp-Session-Id` inbound (o emite uno nuevo si falta)
- Auth opcional en GET — Claude Code lo prueba antes de configurar Bearer en algunos flows

**Sustituto futuro:** cuando se implementen push events reales (ticket created, sla breach), el handler convierte el `controller` actual en un broadcaster Redis pub/sub o Supabase Realtime. La firma de la respuesta no cambia.

#### POST con `Accept: text/event-stream`

Si el cliente lo solicita, la respuesta JSON-RPC se devuelve como un **único frame SSE** en lugar de body JSON:

```
event: message
data: {"jsonrpc":"2.0","id":1,"result":{...}}

```

Se cierra el stream tras el frame. Claude Code usa esto en `initialize`.

#### OPTIONS preflight CORS

```
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Accept, Mcp-Session-Id, mcp-session-id, mcp-protocol-version
Access-Control-Expose-Headers: Mcp-Session-Id
Access-Control-Max-Age: 86400
```

Origin reflejado, credentials habilitadas. Necesario para clientes browser-based.

#### Notificaciones JSON-RPC (sin `id`)

Detectadas por ausencia de campo `id` (JSON-RPC 2.0 § 4.1, no por nombre del método). Se responden con **HTTP 202 + body vacío** per spec MCP. **Nunca** entran al dispatcher de tools — short-circuit en el POST handler. Sirve a `notifications/initialized` (paso obligatorio de Claude Code tras `initialize`) y a cualquier futuro `notifications/cancelled`, `notifications/progress`, etc.

Para batches mixtos: filtrar notificaciones, devolver solo respuestas para los requests reales. Batch all-notifications → 202 + empty.

### 7.2. `app/api/mcp/manifest/route.ts` — descubrimiento público

`GET /api/mcp/manifest` — sin auth. Retorna:

```jsonc
{
  "server": { "name", "version", "protocolVersion" },
  "transport": { "type": "http", "url": "/api/mcp", "format": "jsonrpc-2.0" },
  "authentication": {
    "scheme": "bearer",
    "header": "Authorization",
    "prefix": "Bearer",
    "keyFormat": "nvd_{live|test}_{32 chars}"
  },
  "scopes": [...23 scopes],
  "tools": [
    { "name", "description", "scope", "inputSchema", "since", "tags" }
    // ...28 tools
  ],
  "examples": [...],
  "clientConfigs": {
    "claudeDesktop": { "mcpServers": { "novadesk": {...} } }
  }
}
```

Cache `public, max-age=300` (CDN edge). Cero info sensible.

**Casos de uso:**
- Auto-generar SDKs / OpenAPI specs.
- Mostrar en UI de API keys como documentación.
- Listings en marketplace MCP.
- Onboarding ("Connect NovaDesk to Claude Desktop" → copy/paste).

---

## 8. Capa 6 — UI de gestión

### 8.1. Server action: `lib/actions/api-keys.ts`

```ts
listApiKeysAction(): Promise<ActionResult<ApiKeyRecord[]>>
createApiKeyAction(input): Promise<ActionResult<{ record, plainKey }>>
revokeApiKeyAction(keyId): Promise<ActionResult<true>>
```

**Gate:** todas verifican que el caller sea `agent.role === 'admin' || 'supervisor'`. Validación de scopes contra el catálogo (acepta wildcards `<resource>:*`, `*:read`, etc.).

`revalidatePath('/home/settings/api-keys')` después de mutaciones.

### 8.2. Página: `app/home/settings/api-keys/page.tsx`

Server Component. Resuelve agent → tenant. Redirige `/home` si no es admin/supervisor. Carga `listApiKeys()` y delega al client component.

### 8.3. Client component: `_components/api-keys-client.tsx`

Sections:

1. **Botón "Create API Key"** → Dialog con form:
   - Name, description, environment (live/test), rate_limit_rpm
   - **Scope picker agrupado** (Tickets, Orgs, KB, ITIL, SLAs, Audit, Webhooks)
   - Botones rápidos: "All read", "Clear"

2. **Alert post-creación** (mostrado UNA vez):
   - Plain key visible: `<code>nvd_live_xxxxx</code>`
   - Botones "Copy" + "Dismiss"
   - Texto explícito: "This is the only time the plain key will be shown."

3. **Tabla de keys existentes**: name, prefix, env, scopes (badges), rate, usage_count, last_used, status, botón Revoke (con confirm).

4. **Card "MCP endpoint"**:
   - URL: `POST /api/mcp`
   - Manifest: `GET /api/mcp/manifest`
   - Auth: `Authorization: Bearer nvd_live_…`
   - Lista de métodos disponibles.

---

## 9. Modelo de seguridad y aislamiento multi-tenant

Defensa en profundidad — múltiples capas independientes.

| Defensa | Dónde | Garantía |
|---|---|---|
| **API key → tenant** | RPC `verify_api_key()` | Cliente no puede falsificar tenant_id |
| **Filtro explícito** | `.eq('tenant_id', ctx.tenantId)` en cada query | Cross-tenant leak imposible incluso con bug en RLS |
| **Org allowlist** | `ctx.resolveOrgFilter()` + `.in('organization_id', ...)` | Keys org-scoped no ven otras orgs del mismo tenant |
| **Scopes** | `ctx.requireScope()` antes de cada tool | Una key `tickets:read` no puede mutar |
| **Rate limit** | `mcp_rate_buckets` por API key | Protege contra abuse / runaway agents |
| **Audit completo** | `mcp_audit_log` cada llamada | Trazabilidad, sanitización de secrets |
| **Soft delete** | `.is('deleted_at', null)` | Tickets borrados invisibles |
| **Search sanitization** | `replace(/[%_,]/g, ' ')` | Sin SQL ni LIKE injection |
| **Pagination cap** | `limit` máx 100 server-side | Sin queries gigantes accidentales |
| **Bearer scheme** | Estándar HTTP | Compatibilidad universal con MTLS, proxies, gateways |
| **SHA-256 hash** | Storage en DB | Si la DB se filtra, las keys no son usables |
| **Plain key one-time** | UI muestra una sola vez | Si el usuario la pierde, debe rotar |
| **Soft revoke** | `revoked_at` | Histórico preservado para auditoría |
| **Service role aislado** | `getSupabaseServerAdminClient()` | Sin proximidad a contexto de usuario |
| **Edge: 'nodejs' runtime** | route.ts con `runtime = 'nodejs'` | Crypto APIs disponibles |

---

## 10. Flujo end-to-end de una llamada

Ejemplo: `claude-desktop` consume `tickets_list` con limit=5.

```
[1] Claude Desktop construye request:
    POST /api/mcp HTTP/1.1
    Authorization: Bearer nvd_live_AbCd1234...
    Content-Type: application/json
    {
      "jsonrpc": "2.0", "id": 1,
      "method": "tools/call",
      "params": { "name": "tickets_list", "arguments": { "limit": 5 } }
    }

[2] Vercel edge → Next.js route handler                              ~5ms

[3] route.ts:
    - JSON parse OK
    - method='tools/call' requiere auth
    - extractBearer() → 'nvd_live_AbCd1234...'
    - getSupabaseServerAdminClient() (service role)

[4] verifyApiKey():                                                  ~5ms
    hashApiKey('nvd_live_AbCd1234...') → 'a3f8...64hex'
    supabase.rpc('verify_api_key', { p_key_hash, p_ip })
    → row { id, tenant_id, scopes, rate_limit_rpm, organization_ids }
    + UPDATE last_used_at, last_used_ip, usage_count atomic

[5] checkRateLimit():                                                ~5ms
    supabase.rpc('increment_rate_bucket', { p_api_key_id })
    → count_after = 12 ≤ 60 → allowed

[6] buildContext():                                                  ~0ms
    MCPContext { tenantId, scopes, supabase, requireScope(), ... }

[7] registry.invoke('tickets_list', ctx, { limit: 5 }):
    - lookup → ToolDefinition
    - ctx.requireScope('tickets:read')
      hasScope(['tickets:*'], 'tickets:read') → true
    - inputSchema.safeParse({ limit: 5 })
      → { page: 1, limit: 5, sort_by: 'created_at', sort_dir: 'desc' }
    - handler():
        supabase.from('tickets')
          .select('id, ticket_number, ...', { count: 'exact' })
          .eq('tenant_id', ctx.tenantId)         ← TENANT FILTER
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(0, 4)                                              ~30ms

[8] recordMcpCall(): fire-and-forget INSERT en mcp_audit_log         ~5ms (paralelo)

[9] route.ts envuelve respuesta MCP:
    {
      "jsonrpc": "2.0", "id": 1,
      "result": {
        "content": [{ "type": "text", "text": "{...}" }],
        "structuredContent": {
          "data": [Ticket, Ticket, ...],
          "pagination": { "page": 1, "limit": 5, "total": 247, "total_pages": 50 }
        },
        "isError": false
      }
    }

Total: ~50-100ms (P95)
```

### 10.b. Handshake completo de un cliente MCP (Claude Code / Desktop / Cursor)

Claude Code no llama directo a `tools/call` — primero ejecuta el handshake del transport. Cualquier paso que falle marca la conexión como "Failed to connect" y descarta el catálogo entero.

```
[A] POST /api/mcp
    Headers: Authorization: Bearer ..., Accept: application/json, text/event-stream
    Body:    {"jsonrpc":"2.0","id":1,"method":"initialize",
              "params":{"protocolVersion":"2025-03-26",
                        "clientInfo":{"name":"claude-code","version":"x.y"},
                        "capabilities":{}}}

    Server (este MCP):
      - Genera Mcp-Session-Id fresco: 0e7e400a-4cfb-4b6e-8ff9-...
      - Si Accept incluye text/event-stream → respuesta como SSE frame
      - Body:  {"jsonrpc":"2.0","id":1,"result":{
                 "protocolVersion":"2025-03-26",
                 "serverInfo":{"name":"novadesk-itsm","version":"1.0.0"},
                 "capabilities":{"tools":{"listChanged":false},...},
                 "instructions":"..."}}
      - Headers: Mcp-Session-Id: 0e7e400a-..., Access-Control-Expose-Headers: Mcp-Session-Id
      → HTTP 200

[B] POST /api/mcp           ← notification (no `id` field)
    Headers: Authorization: Bearer ..., Mcp-Session-Id: 0e7e400a-...
    Body:    {"jsonrpc":"2.0","method":"notifications/initialized"}

    Server:
      - Detecta `id` ausente → notification
      - Short-circuit antes del dispatcher
      → HTTP 202, body 0 bytes, Mcp-Session-Id eco

[C] GET /api/mcp            ← stream SSE para mensajes server-pushed
    Headers: Accept: text/event-stream, Mcp-Session-Id: 0e7e400a-...

    Server:
      - Headers: Content-Type: text/event-stream, Mcp-Session-Id eco
      - Body: ": mcp stream open\n\n"
              ": heartbeat <ts>\n\n"  (cada 15s)
              ...
              (close a 50s; cliente reconecta transparente)

[D] POST /api/mcp           ← descubrimiento de tools
    Headers: Authorization: Bearer ..., Mcp-Session-Id: 0e7e400a-...
    Body:    {"jsonrpc":"2.0","id":2,"method":"tools/list"}

    Server:
      - Body: {"jsonrpc":"2.0","id":2,"result":{
                "tools":[
                  {"name":"tickets_list",
                   "description":"...",
                   "inputSchema":{"type":"object","properties":{...}},
                   "_meta":{"scope":"tickets:read","since":"1.0.0",...}},
                  ... (31 tools)
                ]}}
      → HTTP 200

[E] POST /api/mcp           ← invocación real de una tool (a partir de aquí, ver § 10)
    Body:    {"jsonrpc":"2.0","id":3,"method":"tools/call",
              "params":{"name":"tickets_list","arguments":{"limit":5}}}
```

**Validación de cada escalón** (todos requeridos para que Claude Code muestre las 31 tools):

| Paso | Falla histórica | Resuelto en |
|---|---|---|
| `initialize` HTTP 200 + `Mcp-Session-Id` header | Header faltaba — respuesta JSON sin él | `5ef70e3` |
| `initialize` con `Accept: text/event-stream` devuelve SSE frame | POST solo devolvía JSON | `5ef70e3` |
| GET `/api/mcp` abre stream SSE válido | GET devolvía 405 Method Not Allowed | `5ef70e3` |
| `notifications/initialized` → HTTP 202 + body vacío | HTTP 500 (devolvía 204 con body, inválido) | `6029957` |
| `tools/list` devuelve nombres con regex Anthropic-compat | Nombres con `.` → modelo descarta catálogo | `1adeaf8` |
| Cada tool emite `inputSchema` no-vacío | 7 tools `*_get` emitían `{}` por `.refine()` | `e1ceec2` |

---

## 11. Compatibilidad y no-regresión

### 11.1. Lo que NO se tocó

✅ `lib/actions/tickets.ts` — intacto. UI sigue funcionando idéntico.
✅ `lib/services/*.ts` (excepto `api-key.service.ts` nuevo) — intactos.
✅ `app/api/v1/tickets/route.ts` — intacto. Cuando regeneres typegen empezará a funcionar (la tabla `api_keys` ya existe).
✅ `audit_logs` — intacta. Su `CHECK` constraint sigue limitando a las 10 acciones originales.
✅ Todos los Server Actions, Server Components y RLS policies pre-existentes.

### 11.2. Estado de typecheck

- **Antes del MCP:** 1115 errores (codebase tenía types stale: `database.types.ts` solo conoce `accounts`).
- **Después del MCP:** 1117 errores — añadí 2 errores de la **misma clase** ya presente en `lib/actions/admin.ts`, `lib/actions/changes.ts`, etc.
- Los 2 errores nuevos siguen el patrón establecido del codebase. **No son regresiones.**
- Al ejecutar `pnpm supabase:typegen` los 1117 caen juntos.

### 11.3. Verificación end-to-end de no-regresión

```bash
# 1. Confirmar que migración no destruye nada
grep -E "(DROP|ALTER TABLE [a-z_]+ (DROP|RENAME))" \
  apps/web/supabase/migrations/00039_api_keys_and_mcp.sql
# → 0 matches (solo CREATE TABLE / TYPE / INDEX / FUNCTION)

# 2. Confirmar que solo agrega archivos nuevos
git diff main^ main --stat | grep -v "create mode"
# → 0 lines (todo es 'create mode')

# 3. Confirmar que existing Server Actions se preservan
git log main^..main -- 'apps/web/lib/actions/' | grep -v api-keys.ts
# → vacío
```

---

## 12. Operación: cómo desplegar y probar

### 12.1. Despliegue (orden estricto)

```bash
cd apps/web

# 1. Aplicar migración 00039 a Supabase
pnpm supabase db push

# 2. Regenerar tipos TypeScript (incluye api_keys, mcp_audit_log, mcp_rate_buckets)
pnpm supabase:typegen

# 3. Verificar typecheck (baja a ~0 errores tras typegen)
pnpm typecheck

# 4. Build
pnpm build

# 5. Deploy a Vercel
git push  # ya en main → auto-deploy
```

### 12.2. Smoke tests

```bash
# Manifest público (no auth)
curl -s https://your-domain.com/api/mcp/manifest | jq '.tools | length'
# → 28

# Ping (no auth)
curl -X POST https://your-domain.com/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
# → {"jsonrpc":"2.0","id":1,"result":{}}

# Initialize (no auth)
curl -X POST https://your-domain.com/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# Crear API key vía UI: /home/settings/api-keys (login admin)
# Copiar la plain key (única vez)

# tools/list con API key
curl -X POST https://your-domain.com/api/mcp \
  -H "Authorization: Bearer nvd_live_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# tickets_list
curl -X POST https://your-domain.com/api/mcp \
  -H "Authorization: Bearer nvd_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"tools/call",
    "params":{
      "name":"tickets_list",
      "arguments":{"limit":5}
    }
  }'
```

### 12.3. Configuración Claude Desktop

`~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "novadesk": {
      "transport": "http",
      "url": "https://your-domain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer nvd_live_xxxxxxx"
      }
    }
  }
}
```

### 12.4. Casos de error comunes

| Síntoma | Causa | Fix |
|---|---|---|
| 401 "Missing Bearer token" | Falta header `Authorization` | Agregar `Bearer <key>` |
| 401 "Invalid or revoked API key" | Key incorrecta, expirada, o revocada | Generar nueva |
| 429 "Rate limit exceeded" | Más req/min que `rate_limit_rpm` | Esperar 1 min o subir límite |
| 403 "Scope 'X:write' required" | Key no tiene el scope | Generar nueva key con scope correcto |
| 422 "Invalid arguments" | Input no pasa zod | Revisar `inputSchema` en manifest |
| 404 "Method not found" | Method name incorrecto | Usar `tools/list` para descubrir |

---

## 13. Extensibilidad: lo que viene "gratis"

| Caso futuro | Esfuerzo |
|---|---|
| **Nuevo dominio** (ej. `projects.*`, `inbox.*`, `automations.*`) | 1 archivo nuevo en `lib/mcp/tools/` + 1 línea en `server.ts` |
| **Agente interno consume MCP local** | `import { registry } from 'lib/mcp/server'` → `registry.invoke(...)` (sin HTTP, in-process) |
| **Workflow Builder usa tools como nodos** | Cada `action node` = 1 tool MCP. Workflow engine no implementa nada, solo orquesta. |
| **Marketplace público / Zapier** | Usan `/api/mcp/manifest` autogenerado. Cero código manual. |
| **Streaming SSE / push notifications** | GET `/api/mcp` ya está implementado como SSE keep-alive — para empujar eventos basta cambiar el `ReadableStream` por un broadcaster (Supabase Realtime, Redis pub/sub) |
| **Resources MCP** (taxonomías cacheables: status enum, categories tree) | `lib/mcp/resources/` + 2 métodos extra en route |
| **Prompts MCP** (templates: `triage_ticket`, `summarize_thread`) | `lib/mcp/prompts/` + 2 métodos extra |
| **JWT auth (UI propia consume MCP)** | Helper alternativo en route handler que produce el mismo `MCPContext` desde sesión Supabase. Tools no cambian. |
| **Rate limit con Redis** | Reemplazar `mcp_rate_buckets` queries por Upstash. Service signature idéntica. |
| **Soft revocation por scope** | Agregar `revoked_scopes text[]` y filtrar en `verify_api_key()`. |
| **Webhooks salientes desde tools** | En cada `tickets_create/update`, llamar `dispatchWebhook()` (servicio existente). |

El registry, el context, los scopes y el audit ya están listos para todos estos casos.

### Cómo añadir una tool nueva (ejemplo)

```ts
// apps/web/lib/mcp/tools/projects.ts
import { z } from 'zod';
import { registry } from '../registry';
import { PaginationInput, buildPaginationOutput, rangeFromPagination } from '../schemas';

registry.register({
  name: 'projects_list',
  description: 'List projects in the tenant.',
  scope: 'projects:read',
  inputSchema: PaginationInput.extend({
    is_active: z.boolean().default(true),
  }),
  meta: { since: '1.1.0', tags: ['projects', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);
    const { data, error, count } = await ctx.supabase
      .from('projects')
      .select('id, name, status, created_at', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});
```

Después agregar `import './tools/projects'` en `lib/mcp/server.ts` y la nueva scope `'projects:read'` en `ALL_SCOPES`. Listo: `tools/list`, manifest, audit, rate limit y org-filter funcionan automáticamente.

---

## 14. Catálogo completo de archivos

### Archivos creados (25)

```
apps/web/supabase/migrations/
└── 00039_api_keys_and_mcp.sql                        (migración foundation)

apps/web/lib/services/
└── api-key.service.ts                                (hash, verify, CRUD, scopes)

apps/web/lib/mcp/
├── errors.ts                                         (códigos JSON-RPC + helpers)
├── context.ts                                        (MCPContext interface)
├── registry.ts                                       (ToolRegistry singleton)
├── audit.ts                                          (recordMcpCall)
├── schemas.ts                                        (Pagination utilities)
├── json-schema.ts                                    (Zod → JSON Schema)
├── server.ts                                         (bootstrap + constants)
└── tools/
    ├── tickets.ts                                    (8 tools)
    ├── organizations.ts                              (2 tools)
    ├── contacts.ts                                   (3 tools)
    ├── agents.ts                                     (2 tools)
    ├── kb.ts                                         (3 tools)
    ├── problems.ts                                   (3 tools)
    ├── changes.ts                                    (2 tools)
    ├── assets.ts                                     (2 tools)
    ├── slas.ts                                       (2 tools)
    ├── metrics.ts                                    (2 tools)
    └── audit.ts                                      (2 tools)

apps/web/app/api/mcp/
├── route.ts                                          (JSON-RPC 2.0 dispatcher)
└── manifest/
    └── route.ts                                      (descubrimiento público)

apps/web/lib/actions/
└── api-keys.ts                                       (server actions UI)

apps/web/app/home/settings/api-keys/
├── page.tsx                                          (Server Component)
└── _components/
    └── api-keys-client.tsx                           (Client UI)
```

### Archivos NO modificados (verificación)

```
apps/web/lib/actions/tickets.ts                       intacto
apps/web/lib/actions/changes.ts                       intacto
apps/web/lib/actions/problems.ts                      intacto
apps/web/lib/actions/kb.ts                            intacto
apps/web/lib/actions/inbox.ts                         intacto
apps/web/lib/services/ticket.service.ts               intacto
apps/web/lib/services/sla.service.ts                  intacto
apps/web/lib/services/webhook.service.ts              intacto
apps/web/lib/services/notification.service.ts         intacto
apps/web/app/api/v1/tickets/route.ts                  intacto
apps/web/app/home/settings/layout.tsx                 intacto
apps/web/middleware.ts                                intacto
apps/web/supabase/migrations/00001-00038.sql          intactos
```

---

## 15. Métricas del entregable

| Métrica | Valor |
|---|---|
| Archivos nuevos | 25 |
| Archivos existentes modificados | 0 |
| Líneas de código añadidas | ~3,548 |
| Líneas de código eliminadas | 0 |
| Tablas DB nuevas | 3 |
| Funciones DB nuevas | 2 |
| Tools MCP | 28 |
| Dominios | 11 |
| Scopes catalogados | 23 (+ wildcards) |
| Métodos JSON-RPC implementados | 6 (incluye batch) |
| Commit | `8bb96ee` en `main` |
| Fecha de merge | 2026-04-29 |

---

## 15.b — Troubleshooting de conexión

### El cliente dice "0 tools available"

1. Verifica que el manifest devuelve tools:
   ```bash
   curl -s https://itsm-web.vercel.app/api/mcp/manifest | python -m json.tool | grep '"name"' | head
   ```
   Debe mostrar 31 tools. Si muestra 0, hay regresión de tree-shaking — abrir issue.

2. Verifica que tu API key vive (no revocada/expirada):
   ```bash
   curl -X POST https://itsm-web.vercel.app/api/mcp \
     -H "Authorization: Bearer nvd_live_..." \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 500
   ```
   - 401 → key inválida/revocada
   - 200 con `"tools":[...]` → key OK, problema en el cliente

### Claude Code no reconoce el MCP

```bash
# Limpiar config previa
claude mcp remove novadesk

# Re-agregar con scope explícito
claude mcp add --scope user --transport http novadesk \
  https://itsm-web.vercel.app/api/mcp \
  --header "Authorization: Bearer nvd_live_..."

# Listar MCPs registrados
claude mcp list

# Forzar reload
claude /mcp
```

### Claude Desktop dice "Connection failed"

- Verifica que el JSON config sea válido (sin trailing commas).
- Path del config:
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Reinicia Claude Desktop completamente (cerrar de la bandeja del sistema).
- Revisa los logs:
  - Windows: `%APPDATA%\Claude\Logs\mcp-server-novadesk.log`
  - macOS: `~/Library/Logs/Claude/mcp-server-novadesk.log`

### "Rate limit exceeded" (HTTP 429)

```bash
# Ver tu uso actual
curl -X POST https://itsm-web.vercel.app/api/mcp \
  -H "Authorization: Bearer nvd_live_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"audit_mcp_calls","arguments":{"api_key_id":"<TU_KEY_ID>","limit":10}}}'
```

Subir el rate limit: editar la key en `/home/settings/api-keys` (próxima feature) o vía SQL:
```sql
UPDATE api_keys SET rate_limit_rpm = 600 WHERE id = '...';
```

### "Forbidden — Scope 'X:Y' required" (HTTP 403)

Tu API key no tiene el scope. Genera una nueva con scopes ampliados (la actual seguirá funcionando para los scopes que sí tiene).

### Probar una tool específica desde Claude Code

Después de `claude mcp add`, abre Claude Code y prueba:

```
Lista los 5 tickets críticos sin asignar usando el MCP de novadesk
```

Claude descubre las tools del manifest y elige `tickets_list` con los filtros adecuados. Si pasa, la conexión funciona end-to-end.

---

## 16. Roadmap recomendado

### v1.0 (entregada y desplegada en producción)
- ✅ Foundation (migración 00039, service, registry, context, audit, errors)
- ✅ 31 tools en 11 dominios (tickets +8, kb +3, contacts +3, problems +3, organizations +2, agents +2, changes +2, assets +2, slas +2, metrics +2, audit +2)
- ✅ Transport HTTP JSON-RPC 2.0 (single + batch)
- ✅ Manifest público con cache edge
- ✅ UI settings/api-keys (admin/supervisor only)
- ✅ Script ops `scripts/apply-mcp-migration-and-create-key.mjs`
- ✅ Smoke test `scripts/test-mcp.sh` (10/10 pass)
- ✅ Validado contra prod con 534 tickets reales

### Bugs fix-eados durante deploy

Cinco fixes incrementales necesarios para que Claude Code, Desktop y Cursor completaran el handshake completo:

| # | Commit | Síntoma | Causa | Fix |
|---|---|---|---|---|
| 1 | `83bc59f` | Vercel build failure | `'server-only'` en `api-key.service.ts` no podía importarse desde Client Component | Split en `api-key.types.ts` (client-safe) + `api-key.service.ts` (server-only) |
| 2 | `be9fc48` | `tools: []` en manifest de producción | Webpack tree-shaking eliminaba los `import './tools/X'` (side-effect-only) por `"sideEffects": false` | Cada tools file exporta `__<domain>ToolsLoaded`; `server.ts` los referencia en un array para forzar conservación |
| 3 | `5ef70e3` | Claude Code: "Failed to connect" tras handshake | Faltaba `Mcp-Session-Id` header en respuesta + GET no soportaba SSE (devolvía 405) | Implementar Streamable HTTP completo: header en cada response, GET → `text/event-stream` con keep-alive, POST honra `Accept: text/event-stream`, OPTIONS preflight CORS |
| 4 | `6029957` | `notifications/initialized` → HTTP 500, handshake roto | Notificación se procesaba como request y devolvía HTTP 204 con body — HTTP forbids body en 204, Vercel respondía 500 | Detectar notificaciones por ausencia de `id` (JSON-RPC 2.0 § 4.1), short-circuit antes del dispatcher, devolver HTTP 202 con body vacío |
| 5 | `1adeaf8` | Claude Code: "0 tools available" tras conectar | Tool names usaban `.` (`tickets.list`) — Anthropic API regex `^[a-zA-Z0-9_-]{1,64}$` los rechaza, modelo descarta el catálogo entero | Renombrar 31 tools de `<dominio>.<acción>` a `<dominio>_<acción>` (sed mecánico en `lib/mcp/tools/*.ts` + manifest examples + smoke test) |
| 6 | `e1ceec2` | Claude Code: tools/list devuelve schemas válidos pero modelo sigue mostrando 0 tools | 7 tools `*_get` emitían `"inputSchema": {}` porque mi converter Zod→JSON-Schema no manejaba `ZodEffects` (wrapper que crea `.refine()`); Anthropic rechaza schemas vacíos y eso descarta el catálogo entero | Agregar caso `ZodEffects` que recurse al `_def.schema`. Bonus: `ZodPipeline`, `ZodReadonly`, `ZodBranded`, `ZodCatch` también soportados ahora |

**Lección operativa:** validar contra el cliente real (no solo curl). Curl ignora todo lo que no sea body — los clientes MCP son estrictos con headers, transport details y schema validation. Una sola tool con schema inválido descarta las 30 restantes.

### v1.1 (siguiente sprint sugerido)
- [ ] Vector search: `kb_semantic_search` usando RPC `match_knowledge` + OpenAI embeddings
- [ ] Resources MCP: `novadesk://schema/ticket-statuses`, `novadesk://schema/categories`, `novadesk://schema/agents`
- [ ] Prompts MCP: `triage_ticket`, `summarize_thread`, `suggest_kb_response`, `escalation_decision`
- [ ] Tools de inbox: `inbox_list_conversations`, `inbox_send_message`
- [ ] Tools de workflows: `workflows_list`, `workflows_execute`

### v1.2 (medio plazo)
- [x] ~~Streamable HTTP SSE (GET handler)~~ — entregado en commit `5ef70e3`. Pendiente: cambiar el keep-alive por push real de eventos (ticket creado/asignado/cerrado, sla breach) vía Supabase Realtime
- [ ] Webhooks subscribe vía MCP: `webhooks_create`, `webhooks_list`, `webhooks_delete`
- [ ] Rate limit con Upstash Redis (alta concurrencia)
- [ ] Idempotency keys: header `Idempotency-Key` para tools `*.create`

### v2.0 (largo plazo — plataforma)
- [ ] In-process registry para agentes AI internos (sin HTTP loopback)
- [ ] JWT auth alternativa (UI propia consume MCP en lugar de Server Actions)
- [ ] Workflow Builder usa cada tool como un action node
- [ ] Marketplace público con auto-discovery via manifest
- [ ] Multi-agent orchestration: un Coordinator delega a sub-agentes especializados via MCP
- [ ] Cuotas por plan (`tenants.plan` → mcp_calls_limit)
- [ ] OpenAPI 3.1 spec autogenerada desde el manifest

---

## Apéndice A — Glosario

| Término | Definición |
|---|---|
| **MCP** | Model Context Protocol — estándar de Anthropic para conectar capacidades a agentes AI |
| **JSON-RPC 2.0** | Protocolo de RPC sobre JSON usado por MCP. Spec en jsonrpc.org |
| **Streamable HTTP** | Transport oficial de MCP 2025-03-26: POST para request/response, GET para SSE |
| **Tool** | Capacidad invocable: input (Zod schema) → output. Equivalente a "function calling" en LLMs |
| **Resource** | Dato referencial (lectura) que el agente puede cachear: taxonomías, configuración |
| **Prompt** | Template predefinido que el agente puede invocar para flujos guiados |
| **Scope** | Permiso granular tipo OAuth: `recurso:acción` (`tickets:read`, `kb:write`) |
| **API key** | Credencial alfanumérica con prefijo `nvd_` que identifica al tenant + scopes |
| **Tenant** | Cliente principal de NovaDesk (empresa que contrata el SaaS) |
| **Organization** | Sub-cliente dentro de un tenant (cliente de un MSP) |
| **Service role** | Key Supabase que bypasa RLS — usada por el MCP server para filtrar tenant_id explícito |

---

## Apéndice B — Ejemplos prácticos

### B.1. Listar tickets críticos sin asignar

```json
POST /api/mcp
{
  "jsonrpc": "2.0", "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tickets_list",
    "arguments": {
      "status": ["new", "backlog"],
      "urgency": "critical",
      "sort_by": "created_at",
      "sort_dir": "asc",
      "limit": 20
    }
  }
}
```

### B.2. Crear ticket desde monitoreo externo

```json
POST /api/mcp
{
  "jsonrpc": "2.0", "id": 2,
  "method": "tools/call",
  "params": {
    "name": "tickets_create",
    "arguments": {
      "title": "Disk full on prod-db-01",
      "description": "Disk usage 94% on /var/lib/postgresql. Triggered by Prometheus alert.",
      "type": "incident",
      "urgency": "critical",
      "impact": "high",
      "tags": ["monitoring", "auto-created", "prometheus"]
    }
  }
}
```

### B.3. RAG: buscar KB para responder consulta

```json
POST /api/mcp
{
  "jsonrpc": "2.0", "id": 3,
  "method": "tools/call",
  "params": {
    "name": "kb_search",
    "arguments": {
      "query": "vpn no conecta windows 11",
      "language": "es",
      "only_public": true,
      "limit": 5
    }
  }
}
```

### B.4. SLA breach detection (cron externo)

```json
POST /api/mcp
{
  "jsonrpc": "2.0", "id": 4,
  "method": "tools/call",
  "params": {
    "name": "slas_get_breaches",
    "arguments": {
      "within_minutes": 60,
      "limit": 100
    }
  }
}
```

### B.5. Batch — múltiples tools en una request

```json
POST /api/mcp
[
  { "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": { "name": "tickets_list", "arguments": { "limit": 5 } } },
  { "jsonrpc": "2.0", "id": 2, "method": "tools/call",
    "params": { "name": "metrics_ticket_summary", "arguments": {} } },
  { "jsonrpc": "2.0", "id": 3, "method": "tools/call",
    "params": { "name": "slas_get_breaches", "arguments": { "within_minutes": 30 } } }
]
```

Las 3 tools se ejecutan en paralelo, devuelven array de respuestas, cada una auditada individualmente.

---

**Versión:** 1.1 — Streamable HTTP + Anthropic-compat tool names + ZodEffects schema
**Fecha:** 2026-04-29
**Commit HEAD:** `e1ceec2` en `main`
**Línea de commits del MCP en main:**
  `8bb96ee` (foundation) → `83bc59f` → `be9fc48` → `6857448` (docs) → `5ef70e3` → `6029957` → `1adeaf8` → `e1ceec2`
**Autor:** @arquitecto + @fullstack-dev + @db-integration
**Documento maestro:** `Contexto/ARQUITECTURA.md` (referencia general)

---

## Apéndice C — Cambios desde la v1.0 inicial

| Área | Antes (v1.0 — `8bb96ee`) | Después (v1.1 — `e1ceec2`) |
|---|---|---|
| **Transport** | POST JSON-RPC 2.0 únicamente | + `Mcp-Session-Id` header + GET SSE keep-alive + Accept SSE en POST + OPTIONS CORS |
| **Notificaciones** | Tratadas como request (HTTP 204 con body, inválido) | HTTP 202 con body vacío per spec MCP |
| **Tool names** | `tickets.list`, `kb.search` (dotted) | `tickets_list`, `kb_search` (underscore, Anthropic-compat) |
| **inputSchema** | 7 tools devolvían `{}` | Todas devuelven `type: object` con properties — `ZodEffects`, `ZodPipeline`, `ZodReadonly`, `ZodBranded`, `ZodCatch` soportados |
| **Compatibilidad** | curl funciona, MCP clients fallan | Curl + Claude Code + Claude Desktop + Cursor — todos pasan handshake completo |
| **Bug log explícito** | N/A | 6 fixes documentados con commit ref + síntoma + causa + fix |

Si tienes una integración previa que usaba los nombres dotted (`tickets.list`), ajustarla es un find-replace mecánico de `.` por `_` en los nombres de tool. Auth, scopes, schemas, y semánticas de respuesta son idénticos.
