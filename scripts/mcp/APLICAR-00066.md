# Aplicar 00066 — ✅ COMPLETADO 15-oct-2026

> Aplicada vía SQL Editor. Verificado en producción: 3 tablas con RLS
> forzado, 3 funciones respondiendo, CHECK de `mcp_audit_log` aceptando
> `oauth` sin romper `mcp`, y registro dinámico de clientes funcionando
> de punta a punta contra la base real.
>
> Los tipos ya se regeneraron y `oauth.types.ts` / `oauth-schema-audit.mjs`
> se borraron; `schema-audit.mjs` ahora cubre los módulos OAuth.
>
> Se deja como registro de lo que se hizo y del rollback, por si hiciera falta.

---

## (original) procedimiento verificado

Estado comprobado contra producción el 15-oct-2026:

- **00064 ya está aplicada** (`api_keys.actor_agent_id` existe, con backfill)
- **00065 ya está aplicada** (`gc_mcp_rate_buckets()` responde)
- **00066 es la única pendiente** — ninguna de sus 3 tablas ni sus 3 funciones
  existe, y todas sus dependencias (`tenants`, `agents`, `mcp_audit_log`,
  `api_keys`) sí

**No apliques 00064 ni 00065.** Ya corrieron. Volver a ejecutarlas no es
necesario y 00064 toca el camino de autenticación.

---

## Por qué esto no afecta nada

00066 es aditiva casi por completo:

| Qué hace | Riesgo |
|---|---|
| Crea `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens` | ninguno: no existen |
| Crea `verify_oauth_token`, `redeem_authorization_code`, `gc_oauth_expired` | ninguno: no existen |
| Agenda el cron `oauth-gc` a las 03:30 UTC | ninguno: nombre nuevo |
| **Amplía** el CHECK de `mcp_audit_log.channel` | el único cambio sobre algo en uso |

Ese CHECK pasa de `('mcp','rest','internal')` a `('mcp','rest','internal','oauth')`.
Las 622 filas existentes son todas `channel='mcp'`, así que todas siguen
cumpliendo. Un CHECK que solo se amplía no puede rechazar datos que ya pasaban.

Nada de código existente lee estas tablas: el camino de API key —el único en
uso hoy— nunca las toca. Verificado contra el build de producción.

---

## Paso 1 — respaldo

Antes de tocar nada. En el dashboard de Supabase:

**Database → Backups → Create backup**

Si el plan no ofrece backup manual, basta con anotar que el rollback de abajo
revierte 00066 por completo: solo borra objetos que ella misma crea.

---

## Paso 2 — aplicar

No hay Docker en esta máquina, así que la vía de validación local
(`supabase db reset`) no está disponible. Dos opciones:

### Opción A — SQL Editor del dashboard (recomendada sin Docker)

1. Abre **SQL Editor** en el dashboard de Supabase
2. Pega el contenido completo de
   `apps/web/supabase/migrations/00066_oauth_authorization_server.sql`
3. **Run**

Es una sola transacción implícita: si algo falla, Postgres revierte todo.

### Opción B — CLI

```bash
pnpm --filter web supabase:deploy
```

⚠️ Esto corre `supabase db push`, que aplica **todas** las migraciones que la
CLI considere pendientes. Como 00064 y 00065 ya están aplicadas pero puede que
no estén registradas en `supabase_migrations.schema_migrations`, la CLI podría
intentar re-ejecutarlas. Verifica antes:

```bash
pnpm --filter web exec supabase migration list
```

Si 00064/00065 NO aparecen como aplicadas ahí, usa la **Opción A** — es más
predecible que pelear con el registro de la CLI.

---

## Paso 3 — verificar (SQL Editor)

```sql
-- 1) las tres tablas existen con RLS forzado
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname LIKE 'oauth_%' AND relkind = 'r';
-- esperado: 3 filas, ambos booleanos en true

-- 2) las tres funciones existen
SELECT proname FROM pg_proc
 WHERE proname IN ('verify_oauth_token','redeem_authorization_code','gc_oauth_expired');
-- esperado: 3 filas

-- 3) un token inexistente devuelve 0 filas, NO un error
SELECT * FROM verify_oauth_token('nohash', 'https://itsm.tdxcore.com/api/mcp');
-- esperado: 0 filas

-- 4) el cron quedó agendado
SELECT jobname, schedule FROM cron.job WHERE jobname = 'oauth-gc';
-- esperado: 1 fila, '30 3 * * *'

-- 5) la auditoría acepta el canal nuevo
INSERT INTO mcp_audit_log (tenant_id, channel, tool_name, status, status_code, duration_ms)
VALUES ((SELECT id FROM tenants LIMIT 1), 'oauth', 'test', 'success', 200, 0);
DELETE FROM mcp_audit_log WHERE tool_name = 'test' AND channel = 'oauth';
-- esperado: 1 insertada, 1 borrada

-- 6) NO SE ROMPIÓ lo existente: el canal viejo sigue válido
INSERT INTO mcp_audit_log (tenant_id, channel, tool_name, status, status_code, duration_ms)
VALUES ((SELECT id FROM tenants LIMIT 1), 'mcp', 'test', 'success', 200, 0);
DELETE FROM mcp_audit_log WHERE tool_name = 'test' AND channel = 'mcp';
-- esperado: 1 insertada, 1 borrada
```

---

## Paso 4 — verificar que la app no se rompió

Lo más importante: **las API keys deben seguir funcionando igual**.

```bash
# Con una key real, desde la raíz del repo
MCP_BASE_URL=https://itsm.tdxcore.com MCP_API_KEY=<tu_key> \
  node scripts/mcp/contract-test.mjs
```

Esperado: las aserciones de auth pasan y el catálogo sigue en 116 tools.

Y que OAuth ya responda de verdad (antes daba "table not found"):

```bash
curl -s -X POST https://itsm.tdxcore.com/api/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"prueba","redirect_uris":["http://127.0.0.1:9000/cb"]}'
```

Esperado: HTTP **201** con un `client_id` que empieza en `nvc_`.
Si sigue dando 500 "table not found", la migración no se aplicó.

Bórralo después:

```sql
DELETE FROM oauth_clients WHERE client_name = 'prueba';
```

---

## Paso 5 — cerrar el circuito de tipos

**Esto no es opcional.** Mientras no se haga, hay dos definiciones del esquema
que se separan en silencio — el problema exacto que causó los siete bugs
anteriores.

```bash
# 1. regenerar desde el esquema vivo (ahora sí incluye las tablas oauth)
set -a; . apps/web/.env; set +a
node scripts/mcp/gen-types.mjs > packages/supabase/src/database.types.ts

# 2. borrar los tipos escritos a mano y su audit
rm apps/web/lib/oauth/oauth.types.ts
rm scripts/mcp/oauth-schema-audit.mjs
```

Luego hay que quitar las llamadas a `asOAuthClient(...)` en estos 6 archivos,
dejando el cliente tipado directo:

- `apps/web/lib/oauth/oauth.service.ts`
- `apps/web/lib/oauth/authorize.service.ts`
- `apps/web/lib/oauth/verify.ts`
- `apps/web/app/api/oauth/token/route.ts`
- `apps/web/app/api/oauth/register/route.ts`
- `apps/web/app/api/oauth/revoke/route.ts`
- `apps/web/app/oauth/authorize/page.tsx`
- `apps/web/app/oauth/authorize/_lib/consent-action.ts`

Y verificar:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"
# esperado: 427 (la línea base) — y 0 en lib/domain, lib/mcp y los módulos oauth

node scripts/mcp/schema-audit.mjs
# ahora cubre las tablas oauth de verdad, contra el esquema vivo
```

---

## Rollback

Si algo sale mal. Solo borra lo que 00066 crea:

```sql
SELECT cron.unschedule('oauth-gc');
DROP FUNCTION IF EXISTS gc_oauth_expired();
DROP FUNCTION IF EXISTS redeem_authorization_code(text);
DROP FUNCTION IF EXISTS verify_oauth_token(text, text);
DROP TABLE IF EXISTS oauth_tokens;
DROP TABLE IF EXISTS oauth_authorization_codes;
DROP TABLE IF EXISTS oauth_clients;

-- devolver el CHECK a su forma original
ALTER TABLE mcp_audit_log DROP CONSTRAINT mcp_audit_log_channel_check;
ALTER TABLE mcp_audit_log ADD CONSTRAINT mcp_audit_log_channel_check
  CHECK (channel IN ('mcp', 'rest', 'internal'));
```

⚠️ El último paso falla si ya hay filas con `channel='oauth'`. Bórralas primero:

```sql
DELETE FROM mcp_audit_log WHERE channel = 'oauth';
```

Después del rollback, las API keys siguen funcionando: nunca dependieron de
nada de esto.
