# Migraciones — MCP Platform

Registro de las migraciones que este trabajo acumuló. Se mantuvieron sin
ejecutar durante el desarrollo y se aplicaron al final, en una pasada
controlada, revisando una por una.

> **00064, 00065 y 00066: aplicadas y verificadas** (15-oct-2026).
>
> **00067: PENDIENTE.** Es la de la Fase 1 del módulo de proyectos. Se deja
> sin ejecutar a propósito, igual que se hizo con las anteriores: primero se
> escribe y se revisa, después se aplica en una pasada controlada.
>
> No confíes en este archivo sin verificar: lo que manda es la base de datos.
> ```bash
> curl -s "$SB_URL/rest/v1/oauth_clients?select=client_id&limit=1" >   -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
> # 404 = pendiente · 200 = ya aplicada
> ```

El código ya desplegado tolera que no estén aplicadas: `verifyApiKey` lee
`actor_agent_id` / `actor_user_id` con `?? null`, así que contra la función
pre-00064 devuelve `null` y los tools de lectura siguen funcionando. Lo único
que falla hasta aplicar 00064 son las escrituras a tablas con columna de autor
obligatoria, que hoy ya fallan de todas formas.

Lo mismo aplica a 00066: los endpoints OAuth se despliegan y responden, pero
cualquier operación que toque la base devuelve un error limpio
(`Could not find the table 'public.oauth_clients'`) hasta que la migración
corra. La autenticación por API key —el único método en uso hoy— no pasa por
esas tablas y queda intacta.

---

## 00064 — `mcp_actor_attribution` · ✅ APLICADA

**Para qué va.** Hoy ninguna API key puede escribir en una tabla cuya columna
de autor sea `NOT NULL REFERENCES auth.users(id)`. Es el caso de
`ticket_followups.author_id`, y también de `ticket_tasks`,
`ticket_solutions` y `kb_articles`. Un llamador con API key no tiene identidad
en `auth.users`, así que el INSERT muere con `23502` (not-null violation).

Por eso `tickets_add_comment` estuvo roto desde que se escribió: nadie lo
notó porque ningún tool de escritura se había ejecutado en producción.

**Qué hace.**

1. `ALTER TABLE api_keys ADD COLUMN actor_agent_id uuid REFERENCES agents(id) ON DELETE RESTRICT`
   — cada llave declara el agente por el que actúa.
2. Backfill: apunta las llaves existentes al primer agente activo de **su
   propio tenant** (prefiere `role = 'admin'`), para que ninguna quede
   inutilizable. Está acotado por tenant a propósito: una llave nunca puede
   heredar un actor de otro tenant.
3. Reemplaza `verify_api_key()` para devolver además `actor_agent_id` y
   `actor_user_id`, resueltos con un `LEFT JOIN` a `agents` en el mismo
   round-trip (el camino caliente de auth sigue siendo una sola query).

**Por qué `LEFT JOIN` y no `INNER`.** Si el agente se desactiva, la llave
sigue sirviendo para **lecturas** (`actor_user_id` vuelve `null` y las
escrituras fallan con un 403 explicativo) en vez de dejar la integración
muerta por un cambio de personal no relacionado.

**Riesgo.** Medio-alto: reemplaza `verify_api_key`, que corre en **cada**
llamada MCP. Si se rompe, el servidor queda inaccesible. Es la razón por la
que conviene probarla antes de subirla.

**Verificación tras aplicar.**

```sql
-- 1) ninguna llave quedó sin actor
SELECT id, name, actor_agent_id FROM api_keys WHERE actor_agent_id IS NULL;
-- esperado: 0 filas

-- 2) la función devuelve las dos columnas nuevas
SELECT * FROM verify_api_key('<sha256-de-una-llave-de-prueba>', NULL);
-- esperado: actor_agent_id y actor_user_id poblados

-- 3) ningún actor cruzó de tenant
SELECT k.id FROM api_keys k JOIN agents a ON a.id = k.actor_agent_id
 WHERE a.tenant_id <> k.tenant_id;
-- esperado: 0 filas
```

**Rollback.** Documentado al pie del archivo: hay que restaurar el cuerpo de
`verify_api_key` de 00039 textualmente, luego soltar índice y columna.

---

## 00065 — `mcp_rate_bucket_gc` · ✅ APLICADA

**Para qué va.** `increment_rate_bucket()` (00039) corre un `DELETE` sobre
`mcp_rate_buckets` en **cada llamada autenticada**:

```sql
DELETE FROM mcp_rate_buckets WHERE bucket_minute < (now() - interval '10 minutes');
```

Eso convierte cada lectura en una transacción de escritura contra una tabla
que simultáneamente recibe UPSERTs concurrentes: contención de locks y WAL
sin beneficio funcional.

En este despliegue pesa más que en otros. Según 00046, la instancia es de
~1 GB con presupuesto de Disk IO pequeño, y escrituras de fondo desbocadas ya
tumbaron la base (error 522) el **14-jun-2026**.

**Qué hace.**

1. Reescribe `increment_rate_bucket()` sin el DELETE inline. Mantiene firma y
   contrato de retorno idénticos, así que **no hay cambio de código de
   aplicación**.
2. Añade `gc_mcp_rate_buckets(interval)` que borra y devuelve el conteo.
3. Programa `mcp-rate-bucket-gc` en pg_cron cada 6 h (`0 */6 * * *`), ~4
   corridas/día sobre la línea base de ~34/día que fijó 00046. Deliberadamente
   poco frecuente: la tabla no puede crecer de forma significativa a este
   volumen y el IO es la restricción real.
4. Una barrida inicial de lo acumulado.

**Riesgo.** Bajo. Idempotente (desprograma por nombre antes de programar) y
envuelta en un guard `IF EXISTS (pg_extension pg_cron)`.

**Verificación tras aplicar.**

```sql
-- 1) el job quedó programado
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'mcp-rate-bucket-gc';

-- 2) la función ya no contiene el DELETE
SELECT prosrc LIKE '%DELETE FROM mcp_rate_buckets%' AS tiene_delete
  FROM pg_proc WHERE proname = 'increment_rate_bucket';
-- esperado: false

-- 3) el rate limiting sigue contando
SELECT increment_rate_bucket('<api_key_uuid>'::uuid, 60);
-- esperado: entero creciente al repetir dentro del mismo minuto
```

---

## 00066 — `oauth_authorization_server` · ✅ APLICADA

**Para qué va.** Habilita conectar el servidor MCP desde **Claude.ai** y otros
clientes remotos, que no pueden usar API keys: exigen un flujo OAuth. Claude
Code y Cursor siguen funcionando con API keys sin cambio alguno — esto es un
método adicional, no un reemplazo.

Supabase Auth no puede cumplir el rol de authorization server: anuncia
`/auth/v1/oauth/authorize` y `/auth/v1/oauth/token` en su metadata OIDC, pero
ambos devuelven 404 en esta instancia (verificado 15-oct-2026). Autentica
personas; no emite tokens OAuth para clientes de terceros. Así que la app actúa
como authorization server y Supabase Auth queda como proveedor de identidad:
`/oauth/authorize` exige sesión ITSM y lee el agente firmado de ahí.

**Qué crea.**

| Objeto | Tipo | Para qué |
|---|---|---|
| `oauth_clients` | tabla | Clientes registrados (RFC 7591 dinámico, o Client ID Metadata Document) |
| `oauth_authorization_codes` | tabla | Códigos de un solo uso, hasheados, PKCE obligatorio |
| `oauth_tokens` | tabla | Access/refresh opacos y hasheados, ligados a tenant + agente + scopes + resource |
| `verify_oauth_token(text, text)` | función | Camino caliente; valida hash **y** audiencia RFC 8707 en SQL |
| `redeem_authorization_code(text)` | función | Canjea el código de forma atómica; delata reuso |
| `gc_oauth_expired()` | función | Limpia códigos y tokens vencidos; agendada 03:30 UTC |

Además relaja el `CHECK` de `mcp_audit_log.channel` para admitir `'oauth'`: una
llamada autenticada por token no es `mcp` ni `rest` ni `internal`, y la
auditoría no debe descartarla en silencio.

**Decisiones que vale la pena entender.**

*Tokens opacos, no JWT.* Se guardan hasheados con SHA-256, igual que las API
keys. Dos razones: la revocación es inmediata (marcar la fila, no esperar el
TTL), y un token filtrado en un log es inútil sin la fila que lo respalda.

*La audiencia se verifica en SQL, no en TypeScript.* `verify_oauth_token` recibe
el `resource` y filtra por él dentro de la función. Si la comparación viviera en
el route handler, cualquier call site nuevo podría olvidarla — y olvidarla
significa aceptar un token emitido para otro servidor MCP.

*Un código reusado revoca toda la familia.* No solo se rechaza el segundo
intento: OAuth 2.1 §7.5 exige revocar todo lo derivado, porque un código
presentado dos veces es evidencia de que se filtró y el atacante puede ya tener
un token válido del primer canje.

**Riesgo.** Bajo. Son tres tablas nuevas y tres funciones nuevas; nada existente
cambia de forma, salvo el `CHECK` de `mcp_audit_log.channel`, que solo se
amplía. Ninguna tabla en uso se altera y ningún camino actual pasa por aquí
hasta que un cliente complete un flujo OAuth.

**Verificación después de aplicar.**

```sql
-- 1) las tres tablas existen y están con RLS forzado
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname LIKE 'oauth_%';
-- esperado: 3 filas, ambos booleanos en true

-- 2) la auditoría acepta el canal nuevo
INSERT INTO mcp_audit_log (tenant_id, channel, tool_name, status, status_code, duration_ms)
VALUES ((SELECT id FROM tenants LIMIT 1), 'oauth', 'test', 'success', 200, 0);
-- esperado: 1 fila insertada (borrarla después)

-- 3) un token inexistente no devuelve nada (no error)
SELECT * FROM verify_oauth_token('nohash', 'https://itsm.tdxcore.com/api/mcp');
-- esperado: 0 filas

-- 4) el GC quedó agendado
SELECT jobname, schedule FROM cron.job WHERE jobname = 'oauth-gc';
-- esperado: 1 fila, '30 3 * * *'
```

**Rollback.** Documentado al pie del archivo: desagendar el cron, soltar las
tres funciones y las tres tablas, y revertir el `CHECK` de `mcp_audit_log`.

**Después de aplicar — importante.** Los tipos generados no conocen estas
tablas todavía, así que hay un archivo de tipos escrito a mano que las describe
(`apps/web/lib/oauth/oauth.types.ts`) y un audit que lo compara contra esta
migración columna por columna:

```bash
node scripts/mcp/oauth-schema-audit.mjs   # 83 referencias, 49 columnas
```

Una vez aplicada la migración hay que cerrar ese circuito, o las dos
definiciones se separan en silencio:

```bash
node scripts/mcp/gen-types.mjs > packages/supabase/src/database.types.ts
rm apps/web/lib/oauth/oauth.types.ts        # y quitar los asOAuthClient()
rm scripts/mcp/oauth-schema-audit.mjs       # schema-audit.mjs ya las cubre
```

---

## 00067 — `project_delivery_phase1` · ⬅ PENDIENTE

**Para qué va.** Fase 1 del módulo de gestión de proyectos. Une tres cosas que
hoy existen por separado: los 16 tickets de backlog de Podenza y Prosuministros,
la tabla `projects`, y una unidad de esfuerzo que no existía.

**Qué crea.**

| Objeto | Tipo | Para qué |
|---|---|---|
| `effort_size` | enum | Talla T-shirt: S / M / L / XL |
| `effort_conversion` | tabla | Conversión talla → puntos, versionada por vigencia |
| `tickets.project_id` | columna | A qué proyecto pertenece el item (NULL = soporte corriente) |
| `tickets.effort_size` | columna | Talla estimada |
| `tickets.effort_points` | columna | Puntos **congelados** al estimar |
| `projects.contract_id` | columna | Contrato que gobierna cupo y día de corte |

**Por qué `effort_points` y no "créditos".** En esta base "crédito" ya significa
el descuento en pesos por incumplir SLA (`credit_cop`, `credit_tickets`, 00057 y
00058), y esa palabra ya salió en reportes entregados al cliente. El esfuerzo del
PRD es una tercera cosa, distinta de ese descuento y de `monthly_ticket_quota`
(que es un conteo de tickets). Tres conceptos con un nombre producen reportes
que mienten. La interfaz puede rotularlo "Créditos"; la columna no.

**Lo que NO hace, a propósito.**
- No añade tipos ni estados de ticket. La clasificación del PRD ya existe como
  `ticket_type`, y un tipo nuevo entraría por omisión en el lado NO facturable
  —y reclasificar un `support` hacia él restituiría cuota— un cambio de
  facturación silencioso.
- No toca `support_cycle_usage()` ni ninguna función de ciclo.
- No asigna los 3 proyectos internos de TDX a ninguna organización.

**Incluye una corrección de seguridad que no es del módulo.** `projects` tiene
el mismo hueco de RLS que 00043 cerró en `tickets`: sus políticas solo comprueban
`tenant_id`, pese a que `projects.organization_id` existe desde 00021. Hoy el
riesgo es bajo —los 3 proyectos vivos son internos y sin organización— pero deja
de serlo con el primer proyecto de cliente, que es justo lo que habilita esta
migración. Se corrige aquí porque la fase que crea proyectos de cliente no puede
ser la misma que los deje expuestos.

**Riesgo.** Bajo. Las tres columnas de `tickets` son nullable y sin default: nada
existente cambia de valor ni de comportamiento. La tabla y el enum son nuevos.
Lo único que se modifica de algo en uso son las políticas RLS de `projects` y
`project_tasks`, y solo para **restringir**, nunca para ampliar.

**Antes de aplicar — anotar para poder comparar.**

```sql
SELECT * FROM support_cycle_usage(
  (SELECT id FROM organization_support_contracts LIMIT 1));
```

**Verificación después de aplicar.** Las 4 consultas están al pie del archivo de
migración. La que importa es la 3: `support_cycle_usage()` debe devolver
exactamente los mismos números que antes.

**Rollback.** Documentado al pie del archivo. Ojo: restaurar las políticas de
00015 devuelve el hueco de RLS.

---

## Orden de aplicación

```
00064_mcp_actor_attribution.sql       ✅ ya aplicada
00065_mcp_rate_bucket_gc.sql          ✅ ya aplicada
00066_oauth_authorization_server.sql  ✅ ya aplicada
00067_project_delivery_phase1.sql     ⬅ pendiente
```

00064 y 00065 son independientes entre sí; el orden solo refleja prioridad.
00066 sí depende de 00064, porque reutiliza la atribución de actor que esa
migración introduce.

## Cómo aplicarlas

Preferido, con Docker disponible — se validan contra las 63 migraciones en
limpio antes de tocar producción:

```bash
pnpm --filter web supabase:start
pnpm --filter web supabase:reset     # aplica las 66 desde cero
pnpm --filter web supabase:deploy    # link + db push a producción
```

Sin Docker, directo a producción (requiere revisión manual previa de cada
archivo y una ventana de mantenimiento, porque 00064 toca el camino de auth).

## Después de aplicar

```bash
# el harness debe pasar las aserciones de escritura
node scripts/mcp/contract-test.mjs --write
```

Y repuntar las llaves al agente correcto: el backfill elige un admin
cualquiera, que casi nunca es la atribución que se quiere a largo plazo.

```sql
UPDATE api_keys SET actor_agent_id = '<agent-uuid>' WHERE name = '<nombre>';
```
