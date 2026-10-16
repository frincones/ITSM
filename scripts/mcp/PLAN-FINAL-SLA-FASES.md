# Plan final — SLA por fases, versión definitiva

Incorpora el análisis de riesgos y regresión cross-aplicación ejecutado el
16-oct-2026 sobre las 74 migraciones y el árbol de TypeScript completo.

Sustituye a `PROPUESTA-SLA-FASES.md` y `PLAN-SLA-FASES.md` en un punto de
arquitectura. Lo demás de esos documentos sigue vigente.

**Estado: plan. No se ha escrito código.**

---

## 1. La decisión de arquitectura, con los números

Dije en el mapa de procesos que los requerimientos tendrían estados propios
`req_*`. **Medido el costo, eso era un error y lo corrijo aquí.**

### Las dos rutas

| | Estados `req_*` en `ticket_status` | Columna `requirement_phase` |
|---|---|---|
| Declaraciones de enum/unión a editar | 3 | 0 |
| Mapas etiqueta/color/emoji | 10 | 0 |
| Ramas `switch`/`if` sobre estado | 11 | 0 |
| Listas de filtro y dropdowns | 6 | 0 |
| Listas `.in('status',[...])` en consultas | 24 | 0 |
| Claves de `VALID_TRANSITIONS` | 9 + aristas de entrada | 0 |
| Migraciones necesarias | 9–10 (una por valor) | 1 |
| **Puntos a tocar** | **~63** | **~1** |
| Protegidos por el compilador | **1 de 63** | n/a |
| Reversible | **no, nunca** | sí, una línea |

De los 63 puntos, **solo uno** lo detecta `tsc`: el `Record<TicketStatus, …>`
exhaustivo de `packages/ui/src/itsm/status-badge.tsx:29`. Los otros 62 usan
`Record<string, …>` o listas literales y compilan en silencio.

### Tres fallos silenciosos que valen más que la tabla

**1. El ticket desaparece.** `lib/services/workspace-grouping.ts:429` tiene este
comentario literal en el código:

```
// Didn't match any rule — drop quietly (shouldn't happen).
```

Un ticket en `req_desarrollo`, ya asignado y sin urgencia alta, no coincide con
ninguna de las 10 reglas de `buildSmartGroups`. Se descarta. Y `:476-488`
construye los grupos "por estado" desde una lista fija y luego filtra lo que no
esté en ella — así que tampoco aparece ahí. **Se trae de la base y no existe en
ninguna pantalla.**

**2. El ticket se congela.** `lib/domain/tickets.domain.ts:381`:

```ts
const allowed = VALID_TRANSITIONS[existing.status] ?? [];
if (!allowed.includes(newStatus)) return fail('Invalid status transition…');
```

Un estado sin clave en el mapa devuelve lista vacía, así que **toda transición
se rechaza**: desde la UI, desde el MCP (`lib/mcp/tools/tickets.ts:451`) y desde
el asistente. El ticket queda inmóvil para siempre.

**3. Ya tenemos la prueba de que el barrido manual no se hace.** La migración
00073 añadió el valor `'proposed'` y **no actualizó ninguna de las dos
declaraciones de TypeScript**. Ambas siguen listando 12 valores:

- `lib/domain/tickets.domain.ts:60-72`
- `lib/schemas/ticket.schema.ts:26-39`

Ese valor ya está hoy circulando sin manejo por las 62 superficies. Nueve
valores más serían lo mismo, nueve veces. No es una hipótesis: es el
antecedente, de hace un día, en este mismo repositorio.

### Lo que decide el asunto por completo

El enum colapsa **fase** y **estado de pausa** en una sola columna.

Un ítem no podría estar a la vez en fase de desarrollo y pausado esperando al
cliente. Tendría que ser `req_desarrollo` **o** `detenido`. Y
`resolve_pause_reason` (00048:290-320) solo marca `pauses_sla = true` para
`detenido`, `backlog` y `esperando_ventana` — un valor `req_*` **nunca pausaría
el reloj**.

Eso significa que el reloj de TDX correría durante `req_documentacion` y
`req_accesos`, que son por definición esperas del cliente. Rompería el SLA,
alimentaría `support_cycle_compliance` y **generaría descuentos que no
debemos**.

La cláusula del contrato "los atrasos de PODENZA extienden el plazo de TDX día
por día" es literalmente `pauses_sla = true`. El enum no tiene un costo alto:
**derrota el propósito de la función**.

Con la columna, un ítem en fase `accesos` es `status = 'detenido'` +
`pause_reason = 'espera_accesos'` + `requirement_phase = 'accesos'`. El reloj se
pausa. Que es exactamente el contrato.

### La decisión

```sql
CREATE TYPE requirement_phase AS ENUM (
  'propuesto','backlog','documentacion','accesos',
  'desarrollo','uat','despliegue','entregado','descartado'
);
ALTER TABLE tickets ADD COLUMN requirement_phase requirement_phase;
```

Columna nullable, cero lectores existentes. Un requerimiento en fase
`desarrollo` sigue siendo `status = 'in_progress'`, así que:

- el KPI de abiertos lo cuenta (`app/home/page.tsx:188`)
- el workspace lo coloca en su carril
- `VALID_TRANSITIONS['in_progress']` existe → no se congela
- `delivery_cycle_status` lo cuenta como pendiente, correctamente
- la facturación se comporta igual que hoy

La separación de procesos que pediste se mantiene íntegra: fases propias, SLA
propio, relojes separados. Lo único que cambia es **en qué columna vive la
fase**.

---

## 2. Lo que la facturación NO siente, verificado tres veces

Esta es la pregunta que importaba más, y la respuesta es tranquilizadora en
ambas rutas:

| Función | Se bifurca por | ¿Lee `status`? |
|---|---|---|
| `stamp_ticket_sla` (00053:198) | `ticket_type_counts_for_sla(NEW.type)` | **no** |
| `support_cycle_usage` (00058:193) | `ticket_type_consumes_quota(t.type)` | **no** |
| `support_cycle_compliance` (00057:40) | `t.sla_applies` | **no** |
| `ticket_sla_status` (00054:153) | `sla_applies`, `sla_due_date`, `first_response_at` | **no** |

**Ninguna de las cuatro mira el estado del ticket.** La cuota, el SLA de
respuesta y los descuentos quedan intactos por construcción, no por cuidado.

Y no hay un solo `CHECK` constraint que referencie valores de `ticket_status` en
las 74 migraciones.

---

## 3. Dos bugs vivos hoy, ajenos a este cambio

Los arreglo primero porque uno afecta lo que acabamos de entregar.

### 3.1 `'proposed'` falta en los dos enums de TypeScript — afecta Triage

La migración 00073 añadió el valor en la base; el código no lo sabe.

Consecuencia hoy, en la pestaña de Triage que construimos ayer:

- `ticketStatusEnum.parse('proposed')` **lanza** →
  `lib/actions/tickets.ts:428` falla
- `VALID_TRANSITIONS['proposed']` no existe → `?? []` → **un ticket propuesto no
  puede cambiar de estado por la vía normal**

`accept_proposal()` / `reject_proposal()` funcionan porque van por SQL directo y
no pasan por ese mapa. Pero cualquier otro camino está roto.

Corrección (4 archivos):

| Archivo | Cambio |
|---|---|
| `lib/domain/tickets.domain.ts:60` | añadir `proposed` a la unión |
| `lib/domain/tickets.domain.ts:74` | añadir `proposed: ['new','assigned','backlog','cancelled']` |
| `lib/schemas/ticket.schema.ts:26` | añadir `'proposed'` al `z.enum` |
| `packages/ui/src/itsm/status-badge.tsx:11,29` | añadir a la unión y una entrada en `STATUS_CONFIG` |

El compilador fuerza el cuarto en cuanto se toca el primero del paquete `ui`.

### 3.2 `delivery_cycle_status` cuenta mal los ítems cancelados

En `00074:84-92`, con el código delante:

```sql
count(*)::integer,                                              -- items_total
count(*) FILTER (WHERE i.st IN ('resolved','closed'))::integer, -- items_done
```

Un ítem `cancelled` **está en `items_total` y no está en `items_done`**. Así que
`items_done / items_total` reporta menos cumplimiento del real.

En puntos sí es consistente: `cancelled` queda fuera de `delivered_points` y
fuera de `pending_points`. El defecto es solo en el conteo de ítems.

Importa porque `close_delivery_cycle` (`delivery.domain.ts:550-558`) **congela**
el resultado al cerrar, y el portal del cliente lee ese número
(`portal-delivery.service.ts:311`). Un ciclo cerrado con un ítem cancelado queda
con un porcentaje erróneo para siempre.

Corrección: excluir `cancelled` de `items_total`, igual que ya se excluye
`proposed`.

Hoy hay **0 ciclos cerrados**, así que no hay nada que recalcular. Es el momento
más barato.

---

## 4. Riesgos de la ruta elegida, y cómo se cierran

| Riesgo | Mitigación |
|---|---|
| El trigger de fases se dispara de más | `AFTER UPDATE OF requirement_phase` con `WHEN (OLD.requirement_phase IS DISTINCT FROM NEW.requirement_phase)`. No es un tercer trigger sobre `status` |
| Orden de triggers sobre el mismo evento | Postgres los ejecuta en orden alfabético. Nombrarlo `trg_log_ticket_phase_change` lo sitúa después de `trg_log_ticket_status_change` |
| Las funciones nuevas sin `GRANT EXECUTE` | 00068 existe **solo** porque 00043 olvidó dos grants y eso rompió toda lectura con *permission denied*. Cada función nueva lleva su `GRANT` y se añade a `00060_function_grants.sql` |
| RLS de las tablas nuevas | Patrón de `00071:96-116` (scope por proyecto, escritura staff) + `FORCE ROW LEVEL SECURITY`. `ticket_phase_log` sin política de escritura: lo escribe el trigger como `SECURITY DEFINER` |
| El portal no pasa por RLS | `/portal/[token]/…` usa service-role con filtro manual. Toda lectura nueva en `portal-delivery.service.ts` lleva su `organization_id` explícito. **RLS no protege ahí** |
| `search_path` secuestrable | Toda función nueva: `SECURITY DEFINER` + `SET search_path = public, pg_temp`. No copiar `stamp_ticket_sla` (00053:242), que lo omite |
| El backfill de 2092 transiciones interpreta mal | Ensayo en `BEGIN … ROLLBACK` y comparación contra una muestra manual de 10 tickets |
| `verify-rls.mjs` falla por datos de prueba | Sus conteos son fijos (Admin 714, Camilo 470, Daniel 240). Correr `--esperado` antes y después, y re-basar si se sembró data |
| La escala por organización toca facturación | 0 tickets estimados hoy. Va **al final y en su propia ventana** |

### Lo que ningún gate automático detecta

| Gate | Detecta |
|---|---|
| `tsc` | solo el `Record` exhaustivo del paquete `ui` — 1 punto de 63 |
| `contract-test.mjs` suiteBilling | cambios por **tipo**. Es ciego a cambios por estado |
| `catalog.snapshot.json` | nombres de tools y campos requeridos. **Los valores de enum son invisibles** |
| `schema-audit.mjs` | nombres de **columna** → valida `requirement_phase` gratis |
| `verify-00067.mjs` | los 11 valores de facturación |
| `supabase:reset` | que un valor de enum nuevo no se use en la misma transacción que lo crea |

Las 24 listas `.in('status',[...])` no las protege **nada**. Ese es el argumento
que cierra la discusión: la ruta del enum apuesta a un barrido manual de 62
puntos sin red, en un repositorio donde el barrido de 1 valor ya falló ayer.

La columna hace que `schema-audit.mjs` valide el nombre gratis y que
`suiteBilling` **signifique algo**, porque la ruta de facturación queda
demostradamente intacta.

---

## 5. Orden de trabajo

| Paso | Qué | Riesgo | Reversible |
|---|---|---|---|
| **0a** | `'proposed'` en los 4 archivos de TS | ninguno: corrige un bug vivo | sí |
| **0b** `00075` | `items_total` excluye `cancelled` | ninguno: 0 ciclos cerrados | sí |
| **A** `00076` | `requirement_phase` + catálogo `delivery_phases`, `phase_sla_targets`, `billing_plans` | ninguno: columna nullable, tablas vacías | sí |
| **B** `00077` | `ticket_phase_log` + trigger + backfill de 2092 transiciones | bajo: solo escribe en tabla nueva | sí |
| **C** `00078` | `phase_waits` — el registro de esperas del PM | ninguno | sí |
| **D** `00079` | `ticket_phase_sla`, `cycle_sla_breaches`, `cycle_delivery_compliance` | ninguno: solo leen | sí |
| **E** | Pestaña "SLA por fase" en `/home/delivery` | ninguno | sí |
| **F** | Fases y esperas en `/portal/<token>/proyecto` | ninguno | sí |
| **G** | Escala por organización + tallas del contrato (S=1 M=2 L=4) | **alto: toca facturación** | sí |

El paso **G va al final y en su propia ventana** a propósito: es el único que
cambia lo que se cobra.

El paso **B es el que más valor da pronto**: con el backfill tendrás los tiempos
reales de los últimos meses sin esperar a que el proceso nuevo genere datos.

Cada migración se ensaya en `BEGIN … ROLLBACK` antes de aplicarse — el método
que ya encontró cuatro defectos reales en esta sesión.

### Verificación después de cada paso

```bash
node scripts/mcp/verify-00067.mjs            # facturación: 11 valores idénticos
node scripts/mcp/verify-rls.mjs --esperado   # aislamiento entre clientes
node scripts/mcp/schema-audit.mjs            # columnas inventadas
node scripts/mcp/contract-test.mjs           # catálogo MCP + invariantes
pnpm typecheck
```

---

## 6. Las pantallas

Ya están diseñadas y publicadas:

- **Interno** — pestaña "SLA por fase" en `/home/delivery`:
  https://claude.ai/artifact/Ep5fNurPNoAzfurofB8ZD3
- **Portal del cliente** — `/portal/<token>/proyecto`:
  https://claude.ai/artifact/BZY4JcMNFieoeGzcFMtmsB

Ambos privados. Se comparten desde el menú de la página.

La fase se muestra como un badge **adicional**, al lado del estado, no en su
lugar. Las dos informaciones son distintas y ambas sirven: el estado dice si
está parado, la fase dice en qué etapa del contrato va.

Portal y equipo leen **la misma función** (`cycle_delivery_compliance`), no dos
cálculos. Los números del cliente nunca pueden discrepar de los internos.

---

## 7. Lo que sigue pendiente de ti

De `PLAN-SLA-FASES.md`, sin responder:

1. **El mapeo estado → fase**: ¿lo validas tal cual o lo revisas con Emma? Es la
   única decisión que no puedo tomar con datos — depende de cómo trabaja el
   equipo.
2. **Los motivos de espera**: propuse cinco (`espera_documentacion`,
   `espera_accesos`, `espera_tercero`, `espera_cliente_validacion`,
   `freeze_calendario`). ¿Falta alguno de los que viven hoy en la práctica?
3. **La fecha del cambio Enterprise → Growth de Podenza**, para guardarla como
   vigencia.

Nuevas, de este análisis:

4. **¿Arranco por el paso 0?** Son dos correcciones pequeñas de bugs que ya
   existen, y la 0a desbloquea Triage.
5. **El contrato de Podenza en la base** sigue siendo Professional / 30 tickets
   / $1.000.000, no Enterprise / 14 créditos / $11.070.000. Eso es parte del
   paso G.
