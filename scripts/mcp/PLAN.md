# Plan de implementación — MCP Platform

Estado y hoja de ruta para completar la cobertura MCP del ITSM.
Fecha del análisis: 14-oct-2026. Producción: `8928576`.

---

## 1. Dónde estamos

**38 tools desplegados**, 27 de lectura y 11 de escritura.

| Módulo | Tools | Lectura | Escritura |
|---|---|---|---|
| tickets | 8 | ✅ | ✅ |
| inbox | 7 | ✅ | ✅ |
| problems | 3 | ✅ | parcial |
| kb | 3 | ✅ | ❌ |
| contacts | 3 | ✅ | parcial |
| organizations | 2 | ✅ | ❌ |
| changes | 2 | ✅ | ❌ |
| assets | 2 | ✅ | ❌ |
| slas | 2 | ✅ | ❌ |
| metrics | 2 | ✅ | — |
| agents | 2 | ✅ | ❌ |
| audit | 2 | ✅ | — |

Sin ningún tool: **workflows, projects, forms, notifications, nps, reports,
admin, portal, users**.

Infraestructura ya resuelta y en producción:

- Negociación de protocolo (2025-11-25 / 2025-06-18 / 2025-03-26)
- Atribución de actor (migración 00064)
- Rate limiting fuera del camino caliente (migración 00065)
- Capa de dominio con identidad inyectada
- `after()` para efectos diferidos en serverless
- Harness de contrato: 56/58, cero fallos

---

## 2. Análisis de regresión — las tres capas

### 2.1 Front — riesgo prácticamente nulo

El hallazgo que define todo el plan: **la mayoría de las Server Actions no
tienen consumidores.**

Medido con búsqueda de imports sobre `apps/web/app` y `apps/web/lib`:

| Módulo de acciones | Archivos que lo importan |
|---|---|
| `tickets.ts` | **8** |
| `search.ts` | 3 |
| `mentions.ts`, `ticket-preview.ts` | 2 cada uno |
| `api-keys.ts`, `cycle-closure.ts`, `user-permissions.ts` | 1 cada uno |
| `workflows.ts`, `kb.ts`, `organizations.ts`, `changes.ts`, `problems.ts`, `admin.ts`, `reports.ts`, `portal.ts`, `invite-user.ts`, `inbox.ts` | **0** |

Las páginas de esos módulos (`/home/workflows`, `/home/kb`, …) son
componentes de presentación: leen desde el Server Component y no escriben.
El inbox es la excepción, y escribe directo a Supabase desde el cliente.

**Consecuencia para el plan:** extraer la lógica de esos módulos al dominio
no puede romper ninguna pantalla, porque ninguna pantalla la llama. El único
módulo con riesgo real de regresión en el front es **tickets**, y ya está
hecho y validado en producción.

### 2.2 Back — riesgo acotado y conocido

Tres patrones de fallo ya identificados, todos con mitigación:

**a) Columnas inventadas.** `tickets_add_comment` usaba `author_agent_id` y
`source`; `createTicketFromConversation` usaba `source`. Ninguna existe.
El typecheck no protege porque `database.types.ts` está desactualizado
(solo contiene `accounts`), así que `.insert({ loQueSea: 1 })` compila.

> Mitigación: verificar cada columna contra el esquema real antes de
> escribir el tool, y cubrirla con el harness.

**b) Valores fuera de un enum.** `channel: 'web'` habría roto la creación de
tickets desde la UI. Los enums vigentes son:

```
ticket_type      incident | request | warranty | support | backlog
ticket_channel   portal | email | whatsapp | phone | api | ai_agent | web_widget
severity_level   low | medium | high | critical
change_type      standard | normal | emergency
kb_article_status draft | published | archived
rule_type        on_create | on_update | on_schedule | on_sla_breach | on_escalation
agent_role       admin | supervisor | agent | readonly
sla_type         response | resolution | update
```

> Mitigación: tipar cada campo de enum como unión de TypeScript, nunca
> `string`, para que un valor inválido sea error de compilación.

**c) Efectos diferidos muertos en serverless.** Resuelto con
`runAfterResponse()`; cualquier módulo nuevo debe usarlo en vez de `void`.

### 2.3 Supabase — sin migraciones nuevas previstas

Verificado tabla por tabla contra producción: **las 8 familias de tablas de
los módulos pendientes ya existen** (workflows, kb, organizaciones, changes,
proyectos, formularios, nps, notificaciones). Ninguna fase requiere crear
tablas.

Columnas `NOT NULL` con FK a `auth.users` en tablas pendientes: las mismas
que ya resuelve la migración 00064 vía `actor_user_id`.

> Riesgo residual: si algún módulo necesitara una columna nueva, se
> acumularía como migración documentada y se aplicaría al final, igual que
> 00064 y 00065.

### 2.4 Lo que SÍ tiene riesgo

| Riesgo | Dónde | Mitigación |
|---|---|---|
| Regresión en la UI | solo `tickets.ts` (8 consumidores) | ya hecho y validado |
| Scopes mal diseñados | tools que actúan hacia afuera | scope propio, como `inbox:reply` |
| Fuga de credenciales | `inbox_channels.config`, `api_keys`, webhooks | nunca exponer esas columnas |
| Escalada de privilegios | admin, permisos RBAC | **excluidos del MCP** (tu decisión) |
| Acción masiva irreversible | cierres en lote, borrados | tope por llamada, como `BULK_CLOSE_LIMIT` |

---

## 3. Plan de implementación

Cada fase sigue el mismo ciclo, el que ya destapó 6 bugs:

1. Leer la lógica existente (actions + servicios)
2. Verificar columnas y enums contra el esquema real
3. Extraer a `lib/domain/<modulo>.domain.ts` con identidad inyectada
4. Escribir los tools con schemas tipados y scopes
5. Typecheck, lint, build, confirmar en el bundle
6. Commit propio, PR, validar en producción con el harness

### Fase 3A — Workflows y Reglas · 11 tools

El motor de automatización: workflows con pasos, y reglas con condiciones y
acciones. Alto valor porque permite a un agente responder *por qué* una
automatización no disparó.

```
workflows_list            workflows_get           workflows_create
workflows_update          workflows_toggle        workflows_executions
rules_list                rules_get               rules_create
rules_update              rules_execution_logs
```

Scopes: `workflows:read`, `workflows:write`, `rules:read`, `rules:write`.

Riesgo: **medio**. Un workflow mal configurado puede disparar acciones en
cadena sobre tickets reales. `workflows_toggle` es el tool sensible — activar
un workflow roto afecta producción. Tools de ejecución manual quedan fuera de
esta fase.

### Fase 3B — KB escritura · 5 tools

Cierra el ciclo resolver → documentar.

```
kb_create_article    kb_update_article    kb_publish_article
kb_archive_article   kb_article_revisions
```

Scope: `kb:write`. Riesgo: **bajo**. `kb_articles.author_id` requiere actor
(ya resuelto por 00064). Un artículo publicado es visible en el portal del
cliente, así que `kb_publish_article` se documenta como acción hacia afuera.

### Fase 3C — Organizaciones y contratos · 8 tools

```
organizations_create          organizations_update
organizations_deactivate      organizations_assign_agent
organizations_remove_agent    organizations_list_users
organizations_contracts       organizations_quota_usage
```

Scopes: `organizations:write`, `contracts:read`.

Riesgo: **medio-alto**. Desactivar una organización afecta el acceso de sus
usuarios al portal. `inviteOrganizationUser` queda **fuera**: envía correos e
implica creación de identidades.

### Fase 3D — Changes con aprobación · 6 tools

```
changes_create        changes_update         changes_transition
changes_submit        changes_approve        changes_reject
```

Scopes: `changes:write`, `changes:approve`.

Riesgo: **medio**. `changes:approve` separado a propósito: aprobar un cambio
es una decisión de gobierno, no una edición. Un agente no debería aprobar sus
propias solicitudes.

### Fase 3E — Reportes y SLA · 13 tools

```
reports_sla          reports_agents        reports_cycle
reports_tickets      reports_export        metrics_daily_activity
sla_levels_list      sla_at_risk           sla_pause_reasons
sla_cycle_compliance ola_levels_list       sla_termination_risk
support_contract_status
```

Scopes: `reports:read`, `slas:read`.

Riesgo: **bajo** (solo lectura). Alto valor: envuelve los 36 RPC de Postgres
ya probados (`sla_tickets_at_risk`, `support_cycle_compliance`,
`ticket_sla_status`, `support_termination_risk`).

> Nota de datos: 644 de 727 tickets no tienen `sla_due_date` y ninguna
> organización tiene `sla_id`. Los tools de SLA reportarán cumplimiento
> optimista hasta que se configuren los SLA. Hay que documentarlo en la
> descripción de cada tool para que un agente no reporte un 100% falso.

### Fase 3F — Operación y catálogo · 12 tools

```
assets_create        assets_update        assets_assign
problems_update      problems_tasks       problems_link_ticket
contacts_update      contacts_deactivate  categories_list
services_list        groups_list          agents_workload
```

Scopes: `assets:write`, `problems:write`, `contacts:write`, `catalog:read`.

Riesgo: **bajo**.

### Fase 3G — Tickets avanzado · 10 tools

Operaciones que la UI tiene y el MCP no:

```
tickets_add_task         tickets_add_solution      tickets_follow
tickets_unfollow         tickets_set_testing       tickets_relate
tickets_attachments      tickets_set_rank          tickets_record_mitigation
tickets_record_plan
```

Scopes: `tickets:write`, `tickets:tasks`.

Riesgo: **bajo-medio**. `ticket_tasks` y `ticket_solutions` tienen columnas
de autor obligatorias (cubiertas por 00064). `recordMitigation` y
`recordCorrectionPlan` tocan campos contractuales del P0 — se extraen
verbatim, sin reinterpretar la lógica.

### Fase 3H — Portal, NPS, proyectos y formularios · 14 tools

```
portal_activity      portal_forms          forms_submissions
nps_surveys          nps_scores            csat_summary
projects_list        projects_get          projects_create
projects_tasks       notifications_list    notification_templates
search_global        mentions_search
```

Scopes: `portal:read`, `nps:read`, `projects:read`, `projects:write`,
`notifications:read`, `search:read`.

Riesgo: **bajo**. `search_global` envuelve el RPC `search_global` existente.

### Fase 4 — OAuth 2.1 · consumo universal — **implementada**

Para conectar desde Claude.ai sin pegar llaves a mano:

| Pieza | Estado | Dónde |
|---|---|---|
| `/.well-known/oauth-protected-resource` (RFC 9728) | hecho | `app/.well-known/oauth-protected-resource/` |
| `/.well-known/oauth-authorization-server` (RFC 8414) | hecho | `app/.well-known/oauth-authorization-server/` |
| `/oauth/authorize` — pantalla de consentimiento | hecho | `app/oauth/authorize/` |
| `/api/oauth/token` — code + refresh | hecho | `app/api/oauth/token/` |
| `/api/oauth/register` (RFC 7591) | hecho | `app/api/oauth/register/` |
| `/api/oauth/revoke` (RFC 7009) | hecho | `app/api/oauth/revoke/` |
| Resource Indicators (RFC 8707) | hecho | verificado en SQL, `verify_oauth_token` |
| PKCE S256 obligatorio (RFC 7636) | hecho | `lib/oauth/oauth.service.ts` |
| Client ID Metadata Documents | hecho | `resolveClient()`, con guardas SSRF |

**La app es su propio Authorization Server.** El plan original contemplaba
delegar en Supabase Auth; no se puede: anuncia `/auth/v1/oauth/authorize` y
`/auth/v1/oauth/token` en su metadata OIDC, pero ambos devuelven 404 en esta
instancia (verificado 15-oct-2026). Autentica personas, no emite tokens OAuth
para terceros. Los roles quedan separados: Supabase Auth es el proveedor de
identidad (la pantalla de consentimiento exige sesión ITSM) y la app es el
authorization server.

**Lo que NO se hizo, a propósito.** Los tokens OAuth no pasan por el rate
limiter: `mcp_rate_buckets.api_key_id` es FK a `api_keys`, así que no hay forma
de contarlos sin una tabla propia. Hoy quedan acotados por el TTL de una hora y
por la revocación inmediata. Medirlos requiere su propio bucket — anotado para
la fase siguiente, no disimulado con un id falso.

Riesgo: **medio**. Toca el camino de autenticación. Las API keys siguen
funcionando en paralelo sin cambio de comportamiento — el resolvedor elige por
prefijo (`nvd_` → API key, `nvat_` → token OAuth), verificado en local contra
el build de producción.

Requiere la migración **00066** (ver `MIGRATIONS.md`).

### Fase 5 — Resources y Prompts

- `resources/`: artículos de KB y tickets como recursos direccionables
- `prompts/`: flujos guiados de triage, RCA y resumen de ciclo
- `outputSchema` en todos los tools (structured output, estándar desde
  2025-06-18)

Riesgo: **bajo**. Puramente aditivo.

---

## 4. Resumen

| Fase | Tools | Riesgo | Migración |
|---|---|---|---|
| 3A Workflows y Reglas | 11 | medio | no |
| 3B KB escritura | 5 | bajo | no |
| 3C Organizaciones | 8 | medio-alto | no |
| 3D Changes | 6 | medio | no |
| 3E Reportes y SLA | 13 | bajo | no |
| 3F Operación | 12 | bajo | no |
| 3G Tickets avanzado | 10 | bajo-medio | no |
| 3H Portal, NPS, proyectos | 14 | bajo | no |
| 4 OAuth 2.1 | — | medio | **00066** |
| 5 Resources y Prompts | — | bajo | no |

**38 actuales + 79 nuevos = 117 tools.**

Ninguna fase de la 3 requiere migración. Si alguna lo necesitara, se acumula
documentada y se aplica al final, como 00064 y 00065.

---

## 5. Fuera de alcance (decisión tomada)

Excluidos del MCP por riesgo de escalada de privilegios:

- `api_keys.create` / `revoke` — un agente comprometido podría emitirse
  credenciales nuevas
- `savePermissions`, `toggleUserActive` — RBAC
- `inviteUser`, `inviteOrganizationUser` — creación de identidades y envío
  de correos
- `deleteTicket` — disponible solo bajo `tickets:delete`, que ninguna llave
  tiene por defecto

---

## 6. Control de calidad por fase

Antes de cada PR:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json   # sin errores nuevos en lib/
npx eslint lib/domain lib/mcp                # limpio
npx turbo build --filter=web                 # compila
node scripts/mcp/contract-test.mjs --write   # sin fallos
```

Y verificar que los tools nuevos aparecen en el bundle compilado — el
`sideEffects: false` del paquete puede eliminar el registro de tools en
producción sin que el build falle.

Después de cada despliegue: correr el harness contra producción y actualizar
`catalog.snapshot.json` si el catálogo creció.
