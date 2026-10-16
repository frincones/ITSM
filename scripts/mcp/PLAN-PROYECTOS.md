# Plan de implementación — Módulo de Gestión de Proyectos

Validación del PRD `PRD_ITSM_Gestion_Proyectos_v1.docx` (15-oct-2026) contra el
código, la base de datos y el front reales, con análisis de regresión.

**Estado: propuesta. No se ha tocado una línea de código.**

---

## 1. Resultado de la validación

35 casos de uso del PRD, medidos uno por uno contra el código:

| Sección | Existe | Parcial | Falta |
|---|---|---|---|
| 7.1 Backlog general | 0 | 6 | 3 |
| 7.2 Sprint Planning / Ciclos | 0 | 4 | 4 |
| 7.3 Planner / Capacidad | 0 | 2 | 5 |
| 7.4 Refinamiento | 0 | 2 | 2 |
| 7.5 Portal del cliente | 2 | 4 | 1 |
| **Total** | **2** | **18** | **15** |

El PRD es sólido. Lo que cambia respecto a su propuesta es **cómo** construirlo:
buena parte de su modelo de datos ya existe bajo otros nombres, con datos reales
de Podenza y Prosuministros encima.

---

## 2. Lo que el PRD propone crear y YA EXISTE

| Propuesta del PRD | Realidad |
|---|---|
| tabla `projects` | **Ya existe** (00015). 3 filas reales, UI en `/home/projects`, 4 tools MCP. `CREATE TABLE projects` **falla la migración**. |
| tabla `tasks` | **Ya existe** como `project_tasks`: `estimated_hours`, `actual_hours`, `parent_task_id`, `sort_order`, `assigned_to`. 6 filas reales. |
| clasificación APLICA / GARANTÍA / BACKLOG | **Ya existe** como `ticket_type` + `ticket_type_consumes_quota()`. `warranty` = garantía y **ya está excluida de cuota**: 323 tickets. |
| estado "Backlog" | **Ya existe**: 14 tickets tipo `backlog`, 40 en estado `backlog`. |
| cliente = organización | **Ya existe**. Camilo (Podenza) y Daniel (Prosuministros) ya son `organization_users`. |
| priorización del cliente | **Ya existe end-to-end**: `custom_fields.client_rank`, dominio + action + MCP + 3 UIs. "Solo el cliente edita, TDX ve read-only". |
| ventana de ciclo | **Ya existe**: `support_cycle_for()`, corte día 22→21, no mes calendario. |

**Construir las 8 tablas del PRD crearía un segundo backlog y un segundo sistema
de facturación**, contradiciendo los que ya operan sobre 714 tickets. Dos fuentes
de verdad sobre el mismo alcance es el problema que el PRD quiere resolver.

---

## 3. El problema que el PRD describe, medido

**374 tickets consumen cuota en el instante en que el cliente los crea.**

`app/api/ai/chat/route.ts:178` inserta con `status: 'new'`, y la pertenencia al
ciclo se deriva de `created_at` (`00055:253`). No hay triage: lo que el cliente
pide entra al ciclo y se factura sin decisión humana.

Esto no es una hipótesis del PRD. Está ocurriendo hoy, con datos reales.

---

## 4. Cuatro bloqueadores estructurales

1. **No existe pertenencia a ciclo.** El ciclo se calcula de `created_at`, así que
   un item **no se puede mover** a otro ciclo sin falsear su fecha de creación.
   Bloquea 7.2 (#2,#3,#6) y 7.4 (#1,#2,#4) completas.
2. **No existe unidad de esfuerzo.** Solo `estimated_hours`. Sin talla, sin tabla
   de conversión.
3. **No existe capacidad por persona.** Trampa a evitar: `support_plan_band` se
   llama "capacity band" pero es tolerancia de plan comercial, no horas de gente.
4. **`tickets` y `projects` están desconectados.** Sin FK en ninguna dirección.

---

## 5. Conflicto de nombres: "crédito"

| Término | Significado hoy | Dónde |
|---|---|---|
| `credit_cop`, `credit_tickets` | **Descuento en COP por incumplir SLA** | `support_cycle_compliance()`, reportes ya entregados al cliente |
| `monthly_ticket_quota` | **Conteo de tickets**, no esfuerzo | `organization_support_contracts` |
| "crédito" del PRD | **Esfuerzo facturable por talla** | no existe |

Son tres cosas distintas. Si conviven sin distinguirse, **los reportes mienten**.

**Propuesta:** el esfuerzo del PRD se llama `effort_points` (o `puntos`), nunca
"crédito". El crédito de SLA conserva su nombre, que ya salió en facturas.
Esta decisión es tuya y hay que tomarla **antes** de escribir código.

---

## 6. Análisis de regresión

### 6.1 Superficie medida

| Activo | Alcance |
|---|---|
| `.from('tickets')` | **151 llamadas en 50 archivos** (medido) |
| `select('*')` sobre tickets | 5 (absorben columnas nuevas en silencio) |
| Triggers sobre `tickets` | **6 vivos**, el orden importa |
| Consumidores del cálculo de ciclo | 5: cron de umbrales, cierre, dominio de reportes, servicio de reporte, tools MCP |
| Mapas TS por tipo/estado | 7 archivos — un enum nuevo ausente da comportamiento silenciosamente incorrecto |
| Reportes que agregan tickets | 4 rutas + 14 consultas del dashboard + `metrics.service` + `ai-insights.service` |
| Sitios que tocan `projects` | 3 |

### 6.2 Riesgos identificados, con su mitigación

**R1 — Un `ticket_type` nuevo rompe la facturación en silencio.**
Un tipo ausente de `ticket_type_consumes_quota()` nunca se cobra, y reclasificar
un `support` hacia él **restituye cuota**. Cambiar la regla altera de inmediato
todo ciclo abierto, porque se cuenta por tipo *actual*.
→ *Mitigación: no añadir tipos. La clasificación del PRD ya existe.*

**R2 — Una columna nueva no llega a la UI de detalle.**
`app/home/tickets/[id]/page.tsx:303-346` proyecta campo por campo pese al
`select('*')`. Es el fallo más probable: "agregué la columna y no aparece".
→ *Mitigación: tocar también esa proyección y la `interface Ticket`.*

**R3 — `projects` tiene el agujero de RLS que a `tickets` ya le cerraron.**
`projects` filtra solo por `tenant_id`, sin `has_org_access()`. La migración 00043
cerró exactamente ese hueco en tickets porque *"un usuario de la organización A
podía leer todos los tickets de la B en el mismo tenant"*.
Hoy el riesgo es bajo: los 3 proyectos son internos de TDX, sin `organization_id`.
**Se vuelve real en el instante en que la Fase 4 los exponga al cliente.**
→ *Mitigación: corregir el RLS en la MISMA migración que haga proyectos
visibles al cliente. No después.*

**R4 — La red de seguridad del MCP está incompleta.**
`catalog.snapshot.json` cubre **31 de 116 tools**. La comprobación de "campo
requerido nuevo" solo protege a esos 31.
→ *Mitigación: refrescar el snapshot ANTES de empezar (Fase 0).*

**R5 — Tipos desactualizados tras una migración.**
Una tabla no expuesta por PostgREST queda ausente de `database.types.ts`, y
`.from('x')` resuelve a `never`.
→ *Mitigación: `NOTIFY pgrst, 'reload schema'` en cada migración + regenerar
tipos + correr `schema-audit.mjs`.*

### 6.3 Baseline antes de tocar nada

```
typecheck total:        427 errores (preexistentes)
lib/domain + lib/mcp:     0
árbol git:              limpio
tools MCP vivos:        116
```

Cualquier cifra por encima de 427, o distinta de 0 en las rutas críticas, es una
regresión introducida por este trabajo.

---

## 7. Plan por fases

Principio rector: **extender lo que existe, no duplicarlo.** Cada fase termina
verde en typecheck, lint, build, schema-audit y contract-test antes de la
siguiente.

### Fase 0 — Red de seguridad (antes de cualquier cambio)

| Acción | Por qué |
|---|---|
| Refrescar `catalog.snapshot.json` a 116 tools | Hoy protege 31; sin esto R4 queda abierto |
| Registrar baseline de typecheck | Sin baseline no hay forma de probar "no rompí nada" |
| Añadir aserciones de cuota al harness | Que un cambio que altere la facturación falle una prueba |

**Sin migraciones. Sin cambios de comportamiento.**

### Fase 1 — Vincular lo que ya existe

Migración: columnas nuevas, sin tablas nuevas, sin enums nuevos.

- `tickets.project_id` → FK a `projects` (nullable)
- `tickets.effort_size` → enum `S/M/L/XL` (nullable)
- `tickets.effort_points` → entero congelado al estimar (nunca "credit")
- `projects.contract_id` → FK a `organization_support_contracts`
- **Corregir RLS de `projects`** a la altura de `tickets` (R3)

Entrega: el backlog existente (16 items reales) queda vinculado a proyecto y
estimado. UI: columna de talla en la lista de tickets filtrada por tipo backlog.

*Regresión:* 5 `select('*')` absorben columnas nuevas sin romperse. Hay que tocar
la proyección de detalle (R2). Cero impacto en cuota: no se tocan tipos ni
`ticket_type_consumes_quota()`.

### Fase 2 — Ciclos con pertenencia explícita

Aquí se resuelve el bloqueador #1.

- Tabla `delivery_cycles` (nombre distinto de `cycles` para no competir con
  `support_cycle_for()`): `project_id`, fechas, `committed_points`, estado
- `tickets.delivery_cycle_id` → FK nullable
- Tabla `delivery_cycle_history` — copia verbatim el patrón de
  `ticket_type_history`: solo triggers, `FORCE RLS`, sin políticas de escritura,
  congelando la regla aplicada en su momento

Entrega: 7.2 completa + el log de refinamiento de 7.4.

*Regresión:* `support_cycle_usage()` **no se toca**. El ciclo de entrega y el
ciclo de facturación conviven como conceptos separados y explícitos.

### Fase 3 — Capacidad

- Tabla `agent_capacity`: `agent_id`, `cycle_id`, `hours_per_day`, días libres
- Días libres individuales (los de equipo ya existen en `calendar_holidays`)
- Vista de carga por persona, con alerta de sobre-asignación
- **Escribir `sort_order`** en `project_tasks` — hoy se lee pero nunca se escribe

Entrega: 7.3 completa, incluido el triple cruce.

### Fase 4 — Portal e intake

Aquí se resuelve el problema de los 374 tickets.

- Estado `proposed` (`ALTER TYPE` en migración propia — 4 precedentes)
- Excluirlo de cuota y de SLA explícitamente
- Cola de triage: convertir propuesta → item, con talla y ciclo
- El chat del portal pasa a crear en `proposed`, no en `new`
- Exponer en el portal: backlog de la organización y medidor del ciclo

**Prerrequisito de seguridad: el RLS de `projects` (R3) debe estar corregido
antes de que esta fase exponga datos al cliente.**

*Regresión:* el cambio de `new` → `proposed` altera el conteo de cuota de ciclos
abiertos. Hay que decidir si aplica solo a tickets nuevos o también retroactivo,
y **los ciclos ya cerrados no cambian** (están congelados en
`support_cycle_closures`).

---

## 8. Decisiones tomadas (15-oct-2026)

Las cuatro quedaron resueltas por Freddy. Se registran aquí porque el código
las asume y, sin el motivo escrito, el próximo que lea esto las deshace.

| # | Decisión | Consecuencia en el código |
|---|---|---|
| 1 | La columna se llama **`effort_points`**, no "credits" | La UI puede rotular "Créditos" de cara al cliente; la base de datos no reutiliza el sustantivo que ya significa descuento COP por SLA en facturas emitidas |
| 2 | El backlog **son tickets**, no una tabla nueva | Se extiende `tickets`; los 16 items reales y la exclusión de cuota de `warranty` siguen funcionando sin migrar nada |
| 3 | La regla aplica **hacia adelante** | Los 374 tickets que ya consumieron cuota no se tocan. Nacieron antes de que existiera el concepto de proyecto, y los ciclos cerrados están congelados por diseño |
| 4 | El portal **exige login para proponer** | Ver el backlog sigue abierto con el token de organización; proponer y priorizar requieren sesión, para que cada propuesta tenga autor real |

### Decisiones originales, para contexto

1. **Nombre del esfuerzo.** `effort_points` o el que prefieras — pero no
   "crédito", que ya significa descuento en COP en facturas emitidas.
2. **Backlog como tickets o como tabla nueva.** Recomiendo tickets: los 16 items
   ya existen, la exclusión de cuota ya funciona, y los 323 warranty quedarían
   fuera de un módulo paralelo. El costo es que el backlog hereda las 60 columnas
   de `tickets`.
3. **Qué hacer con los 374 tickets que ya consumieron cuota.** ¿Se deja el
   histórico como está y la regla aplica hacia adelante? Lo recomiendo: los
   ciclos cerrados están congelados por diseño.
4. **Identidad en el portal.** Hoy es un token de organización en la URL, sin
   login. Para atribuir "quién propuso" hace falta sesión real. Camilo y Daniel
   ya existen como `organization_users`, así que la pieza está; falta decidir si
   el portal pasa a exigir login.

---

## 9. Código muerto encontrado (no confundir con funcionalidad)

- `lib/actions/portal.ts` — **cero llamadores**; referencia columnas
  (`tickets.source`, `contact_id`) y tablas (`service_catalog_forms`) inexistentes
- `app/home/service-catalog/page.tsx:28` — consulta `service_catalog_items`, tabla
  que ninguna migración crea → cae a datos demo en silencio
- `projects-client.tsx` — el formulario de crear proyecto hace `preventDefault()`
  y cierra el diálogo sin persistir nada
- `project_tasks.sort_order` — se lee con `.order()` pero nunca se escribe: todas
  las filas en 0
- `triggerNotification()` — documentado como que encola nada; usar
  `notifyEmail`/`notifyInApp`

Ninguno bloquea el plan, pero conviene no construir encima de ellos.
