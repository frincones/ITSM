OAuth 2.1 Authorization Server — conectar el MCP desde Claude.ai

Claude.ai y otros clientes remotos no pueden usar API keys: exigen un flujo
OAuth. Este PR lo implementa como **método adicional, no reemplazo** — Claude
Code y Cursor siguen funcionando con API keys sin ningún cambio de
comportamiento. El resolvedor elige la ruta por prefijo del token
(`nvd_` → API key, `nvat_` → token OAuth).

## Qué incluye

| Pieza | Spec | Ruta |
|---|---|---|
| Metadata del recurso protegido | RFC 9728 | `/.well-known/oauth-protected-resource` |
| Metadata del authorization server | RFC 8414 | `/.well-known/oauth-authorization-server` |
| Pantalla de consentimiento | — | `/oauth/authorize` |
| Token (code + refresh) | OAuth 2.1 | `/api/oauth/token` |
| Registro dinámico de clientes | RFC 7591 | `/api/oauth/register` |
| Revocación | RFC 7009 | `/api/oauth/revoke` |
| PKCE S256 obligatorio | RFC 7636 | `lib/oauth/oauth.service.ts` |
| Resource Indicators | RFC 8707 | verificado en SQL |

## La app es su propio Authorization Server

El plan original era delegar en Supabase Auth. **No se puede:** anuncia
`/auth/v1/oauth/authorize` y `/auth/v1/oauth/token` en su metadata OIDC, pero
ambos devuelven 404 en esta instancia (verificado 15-oct-2026). Autentica
personas; no emite tokens OAuth para terceros.

Los roles quedan separados: Supabase Auth es el proveedor de identidad (la
pantalla de consentimiento exige sesión ITSM y lee el agente firmado) y la app
emite los tokens.

## Decisiones de seguridad que vale la pena revisar

- **Tokens opacos, hasheados con SHA-256, no JWT.** La revocación es inmediata
  en vez de "esperar el TTL", y un token filtrado en un log es inútil sin su
  fila.
- **La verificación de audiencia (RFC 8707) vive en SQL**, dentro de
  `verify_oauth_token`. En un call site podría olvidarse, y olvidarla significa
  aceptar un token emitido para otro servidor MCP.
- **Un código reusado revoca toda la familia de tokens** (OAuth 2.1 §7.5), no
  solo rechaza el segundo intento: un código presentado dos veces es evidencia
  de que se filtró, y el atacante puede ya tener un token del primer canje.
- **`/authorize` solo reporta errores por el `redirect_uri` después de
  validarlo** contra la lista registrada. Redirigir antes es cómo se construye
  un open redirector, y un atacante lo usaría para recibir el código.
  Verificado: un `redirect_uri` malicioso sin sesión termina en nuestro
  sign-in, nunca en el destino del atacante.
- **Un agente `readonly` solo puede otorgar scopes de lectura**, así que el MCP
  no sirve para exceder lo que ese agente puede hacer en la UI.
- La pantalla de consentimiento muestra los scopes en lenguaje claro, marca los
  destructivos y permite desmarcarlos uno por uno.

## Límite conocido, declarado a propósito

Los tokens OAuth **no pasan por el rate limiter**:
`mcp_rate_buckets.api_key_id` es FK a `api_keys`, así que no hay forma honesta
de medirlos sin una tabla de buckets propia. Quedan acotados por el TTL de una
hora del access token y por la revocación inmediata. Medirlos requiere su
propio bucket — anotado para la fase siguiente en vez de disimularlo con un id
falso.

## Base de datos

**La migración 00066 ya está aplicada en producción** (15-oct-2026, vía SQL
Editor). Verificado: 3 tablas con RLS forzado y no legibles con anon key
(42501), 3 funciones respondiendo, el CHECK de `mcp_audit_log` aceptando
`oauth` sin dejar de aceptar `mcp` y rechazando lo inválido, el cron `oauth-gc`
agendado a `30 3 * * *`, y las tablas preexistentes intactas.

Lo único que modifica algo en uso es ese CHECK, que solo se **amplía** de 3 a 4
valores; las 622 filas existentes eran todas `channel='mcp'` y siguen
cumpliendo.

## Arreglo colateral en `gen-types.mjs`

El generador marcaba `grant_types`, `response_types` y `metadata` como
obligatorias en `Insert` pese a tener `DEFAULT` en SQL. Causa: **PostgREST no
publica el `default` de columnas array ni jsonb** — comprobado en el OpenAPI de
este proyecto, donde `is_dynamic` (boolean) y `created_at` (timestamptz) sí lo
traen y `text[]`/`jsonb` no.

Ahora trata array y jsonb NOT NULL como opcionales en `Insert`. Es la misma
razón por la que existía `TRIGGER_FILLED`, pero como regla en vez de lista a
mano. **Afecta a cualquier tabla con esas columnas, no solo a las de OAuth.**

El trade-off queda escrito en el código: una columna array sin default real se
tipará opcional y fallará en runtime, no al compilar. En este esquema todas
tienen default.

## Otro límite conocido

TypeScript no detecta columnas extra dentro de los overloads de `.insert()`:
lo comprobé con un payload completo más una columna inventada y compila igual.
Vale para las 99 tablas, no es algo que este PR introduzca — es precisamente la
razón por la que `schema-audit.mjs` existe. Por eso se extendió a los módulos
OAuth (182 → 230 referencias, 20 módulos) en vez de borrarlo, y verifiqué que
sigue detectando una columna inventada en las tablas nuevas.

## Verificación

- `tsc` en **427** errores — línea base intacta, **0** en `lib/domain`,
  `lib/mcp` y los módulos OAuth
- `eslint` limpio
- Build de producción verde, con las **6 rutas OAuth** emitidas y los **116
  tools** sobreviviendo el tree-shaking
- `schema-audit.mjs` limpio en 230 referencias; probado que falla al inyectar
  una columna inventada
- Harness de contrato **42/44** contra un build de producción local — las 24
  aserciones de auth pasan, incluidas 11 nuevas para el authorization server.
  La única falla necesita una API key para siquiera alcanzar su aserción, y es
  ajena a este cambio
- Flujo OAuth probado de punta a punta contra la base ya migrada: el registro
  dinámico devolvió un `client_id` real; las filas de prueba se borraron

## Después de mergear

Hace falta **desplegar** para que `/.well-known/oauth-authorization-server`
deje de dar 404 en `itsm.tdxcore.com`. La base ya está lista; el código no.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
