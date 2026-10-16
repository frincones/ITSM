# Plan final — Fases y SLA de PROYECTOS

Proceso nuevo y separado. **No toca el SLA de soporte, garantías ni bugs.**

Análisis de regresión ejecutado contra las 74 migraciones y medido contra
producción el 16-oct-2026.

**Estado: plan. No se ha escrito código.**

---

## 1. La pregunta de fondo: ¿esto afecta a soporte?

**No.** Y no por cuidado nuestro, sino porque **los dos universos ya estaban
separados por tipo de ticket** desde que Emma construyó el SLA de soporte.

Las tres funciones que gobiernan SLA, cuota y descuentos filtran idéntico:

```sql
SELECT p_type IN ('support', 'incident', 'request');
```

`ticket_type_consumes_quota` (00048:191) y `ticket_type_counts_for_sla`
(00048:201).

Los tipos de proyecto — `backlog` y `desarrollo_pendiente` — **no están en esa
lista y nunca estuvieron**.

### Medido en producción

| Universo | Tipos | Tickets | Con SLA activo |
|---|---|---|---|
| **Soporte** (zona de Emma) | support, incident, request | 375 | **15** |
| **Garantía** | warranty | 323 | **0** |
| **Proyecto** (lo nuevo) | backlog, desarrollo_pendiente | 16 | **0** |

Los 15 tickets con SLA son **todos de tipo `support`**. Ni uno de proyecto, ni
uno de garantía.

El ciclo vigente de Podenza (22-sep → 21-oct), calculado por la función real:

```
measurable = 15    met = 15    breached = 0
compliance_pct = 100    credit_cop = 0
cuota: 15 consumidos de 30
```

### La zona intocable, delimitada

Commits de `EmmaMCastillo` del 30-sep al 2-oct-2026 — migraciones **00047–00063**
y 30 archivos de TypeScript, entre ellos:

```
lib/services/sla.service.ts
lib/services/support-contract.service.ts
lib/services/cycle-report.service.ts
app/api/cron/sla-check, testing-strike-check, quota-threshold-check,
             advance-assigned-tickets, ticket-auto-assign
app/home/reports/ciclo/, app/home/reports/gestion-soporte/
app/home/tickets/[id]/_components/clause4-commitments.tsx
app/home/tickets/[id]/_components/pause-reason-dialog.tsx
```

**Ninguno se modifica en este plan.** Lo nuevo vive en migraciones 00075+ y en
archivos propios.

### Precedente que lo confirma

Las migraciones **00067** y **00071** ya añadieron cuatro columnas nullable a
`tickets` (`project_id`, `effort_size`, `effort_points`, `delivery_cycle_id`)
**después** de que el SLA de soporte estuviera en producción. 00071:132 lo dejó
escrito: *"No afecta a la facturación: `support_cycle_usage()` sigue contando por
`created_at`."* El patrón está probado.

---

## 2. Análisis de regresión — los seis frentes

| # | Frente | Veredicto |
|---|---|---|
| 1 | Las 30 funciones/triggers/vistas de SLA de 00047–00063 | **SEGURO** — todas leen columnas nombradas; ninguna depende del conjunto de columnas |
| 2 | `SELECT *`, `row_to_json`, tipo compuesto `tickets` | **SEGURO** — cero ocurrencias en 00047–00063 |
| 3 | Triggers que disparen al escribir cualquier columna | **ACOTADO** — uno solo, ver 2.1 |
| 4 | ¿Están excluidos los tipos de proyecto hoy? | **SEGURO en todo el dinero**; una cifra informativa se mueve, ver 2.2 |
| 5 | CHECK, columnas generadas, índices | **SEGURO** — ninguno enumera el conjunto de columnas |
| 6 | Copias masivas de filas de tickets | **SEGURO** — no existe ningún `INSERT INTO tickets ... SELECT *` |

### 2.1 El único trigger sin cláusula de columna

`set_updated_at BEFORE UPDATE ON tickets` (00004:164) **no tiene `OF <columna>`**,
así que se dispara al escribir cualquier columna, incluida una nueva. Solo
escribe `updated_at`.

Eso importa porque `updated_at` alimenta `ticket_dates_plausible()`
(00062:41), que filtra cuota, cumplimiento y gráficas. La migración 00062 lo
documentó: *"tocar un ticket corrupto hoy repara su `updated_at` y volvería a
colarse en el conteo."*

**Medido el escenario real.** En el ciclo vigente de Podenza hay 14 tickets con
fechas imposibles, de los que **7 son de tipo soporte**:

```
#PDZ-2610-00232  sla_applies=false  due=NULL  resp=NULL
#PDZ-2606-00221  sla_applies=false  due=NULL  resp=NULL
#PDZ-2610-00221  sla_applies=false  due=NULL  resp=NULL
#TKT-2604-00478  sla_applies=false  due=NULL  resp=NULL
#PDZ-2606-00220  sla_applies=false  due=NULL  resp=NULL
#PDZ-2610-00230  sla_applies=false  due=NULL  resp=NULL
#PDZ-2610-00231  sla_applies=false  due=NULL  resp=NULL
```

**Los siete tienen `sla_applies = false`.** Como
`support_cycle_compliance` mide sobre `sla_applies`, no pueden entrar al
denominador ni generar un peso de crédito aunque su `updated_at` se repare.
El `measurable` seguiría siendo 15.

**Mitigación de todas formas**, porque el riesgo es estructural y no quiero
depender de que esos 7 sigan así:

```sql
-- Un ticket de soporte NUNCA lleva fase de requerimiento.
ALTER TABLE tickets ADD CONSTRAINT tickets_phase_only_project
  CHECK (requirement_phase IS NULL
         OR type IN ('backlog','desarrollo_pendiente'));
```

Con esa restricción, la función de proyectos **no puede** escribir en una fila de
soporte ni siquiera por error de código. El acoplamiento queda cerrado por la
base, no por disciplina.

### 2.2 La cifra informativa que sí se mueve

`support_cycle_compliance` (00062:273) **no filtra por tipo**: recorre todos los
tickets del ciclo y manda a `excluded_count` los que no tienen SLA.

Hoy, en el ciclo de Podenza, `excluded_count = 3`:

```
#TKT-2609-00715  backlog   <- ya es de proyecto
#TKT-2610-00724  warranty
#TKT-2610-00726  warranty
```

**Un ticket de proyecto ya está contándose ahí hoy**, antes de este plan. A
medida que haya más requerimientos, esa cifra crecerá.

No es dinero: `measurable`, `met`, `breached`, `compliance_pct`, `credit_tickets`
y `credit_cop` no la usan. Es una cifra del reporte que significa "sin SLA
debido".

**Decisión: no tocar `support_cycle_compliance`.** Está en la zona de Emma. Si
la cifra llega a confundir en el reporte, se resuelve en la capa de
presentación, separando "sin contrato" de "trabajo de proyecto" — sin cambiar la
función.

---

## 3. Las fases, con el proceso que describiste

Corregido respecto a propuestas anteriores: **el documento funcional lo redacta
TDX**, no el cliente.

| # | Fase | Arranca | Plazo | Responsable | ¿Descuento? |
|---|---|---|---|---|---|
| 1 | Levantamiento y documento | reunión agendada | ver abajo | **TDX** redacta | no |
| 2 | Fundacional / accesos | se piden accesos | 1 día hábil | cliente / tercero | no |
| 3 | **Desarrollo y pruebas** | fases 1 y 2 cerradas | **S:3 M:4 L:5** | **TDX** | **sí** |
| 4 | UAT | se entrega a validar | 2 días hábiles | cliente | no |
| 5 | Puesta en producción | UAT aprobada | calendario | freeze / tercero | no |

### La Fase 1 en detalle

El proceso que describiste tiene varios tramos alternados, no un plazo único:

```
agendar  →  reunión de levantamiento  →  TDX redacta  →  v1 al cliente
              ↓                                              ↓
         arranca el reloj                            ida y vuelta
                                                   máx 24h cada parte
```

Modelo: **la fase arranca el día de la reunión** (como dijiste), con un plazo
total de **2 días hábiles** según el contrato, y **cada turno del ida y vuelta
tiene 24 horas**.

Los turnos se registran en `phase_waits`: cuando TDX manda la v1, se abre una
espera a cargo del cliente; cuando el cliente devuelve comentarios, se cierra la
suya y se abre la de TDX. **Cada parte acumula sus propias horas**, y el reloj de
TDX se pausa mientras espera.

Eso resuelve el dolor que describiste: queda registrado si Podenza tardó 5 días
en devolver comentarios cuando tenía 24 horas.

### Los motivos de pausa — aprobados, sin tocar el enum

Usamos el catálogo existente `sla_pause_reason` (00048:56), tal como aprobaste:

| Valor | Uso en proyectos | ¿Pausa? |
|---|---|---|
| `espera_cliente_info` | falta información del cliente | sí |
| `espera_cliente_validacion` | esperando comentarios o UAT | sí |
| `dependencia_tercero` | accesos de banco o proveedor | sí |
| `ventana_mantenimiento` | freeze de calendario | sí |
| `fuerza_mayor` | — | sí |
| `priorizacion_interna` | aparcado por nosotros | **no** |

**Cero valores nuevos.** La fase dice *en qué etapa* se espera; el motivo dice
*de quién*. Juntos dan "esperando accesos de un tercero en la fase 2" sin
ampliar ningún enum.

**El hallazgo que hay que atender:** de 221 pausas registradas en el historial,
**209 no dicen por qué**:

```
209   (sin motivo)                 pausa=false
  8   espera_cliente_validacion    pausa=true
  4   priorizacion_interna         pausa=false
```

El mecanismo funciona; nadie lo usa. Por diseño conservador, esas 209 corren
contra TDX. **En proyectos el motivo será obligatorio** para entrar en una fase
de espera — es la única forma de que el cálculo sirva.

### El plan Enterprise → Growth

Dijiste que la fecha no está definida. Se modela como vigencia abierta:
Enterprise desde el inicio, `effective_to = NULL`. Cuando se decida, se cierra la
vigencia y se abre la de Growth — `support_contract_at()` ya resuelve por fecha
(00048:211), así que lo ya medido no se recalcula.

**Nota:** el contrato en la base es Professional / 30 tickets / $1.000.000, no
Enterprise. Mientras siga así, cualquier descuento se calcularía con el plan
equivocado. Va en el paso G.

---

## 4. Lo que se construye

Todo en migraciones **nuevas**, sobre tablas **nuevas**, con una sola columna
añadida a `tickets`.

### 4.1 `00076` — La fase y su catálogo

```sql
CREATE TYPE requirement_phase AS ENUM (
  'propuesto','levantamiento','documentacion','accesos',
  'desarrollo','uat','despliegue','entregado','descartado'
);

ALTER TABLE tickets ADD COLUMN requirement_phase requirement_phase;

ALTER TABLE tickets ADD CONSTRAINT tickets_phase_only_project
  CHECK (requirement_phase IS NULL
         OR type IN ('backlog','desarrollo_pendiente'));
```

Más tres tablas de catálogo, versionadas por fecha: `delivery_phases`,
`phase_sla_targets`, `billing_plans`.

**La restricción es la pieza de seguridad.** Hace imposible que esta
funcionalidad escriba en un ticket de soporte.

### 4.2 `00077` — Registro de fases

```
ticket_phase_log   ticket, fase, entró, salió, responsable, días hábiles netos
```

Trigger `AFTER UPDATE OF requirement_phase` con
`WHEN (OLD.requirement_phase IS DISTINCT FROM NEW.requirement_phase)` —
acotado a la columna, no un tercer trigger sobre `status`.

Nombre `trg_log_ticket_phase_change`: ordena alfabéticamente después de
`trg_log_ticket_status_change`, por si necesita leer esa fila.

### 4.3 `00078` — Esperas

```
phase_waits   ticket, fase, qué se pidió, a quién, cuándo se pidió,
              cuándo llegó, días hábiles que costó, motivo de pausa
```

Es el registro del ida y vuelta de la Fase 1 y de las esperas de accesos.
Mientras `received_at` sea NULL, el reloj de TDX está pausado.

### 4.4 `00079` — El cálculo

```
ticket_phase_sla(ticket_id)          días consumidos vs objetivo, por fase
requirement_delay(ticket_id)         días de TDX vs días del cliente
cycle_delivery_compliance(cycle_id)  el % del ciclo y el descuento
```

**Funciones nuevas con nombres nuevos.** No reemplazan ni envuelven a
`support_cycle_compliance`: son otro mecanismo sobre otro trabajo.

### 4.5 Pantallas

**Interno** — quinta pestaña en `/home/delivery`:
https://claude.ai/artifact/Ep5fNurPNoAzfurofB8ZD3

**Portal** — en `/portal/<token>/proyecto`:
https://claude.ai/artifact/BZY4JcMNFieoeGzcFMtmsB

**Las dos juntas**, mostrando que leen la misma cifra:
https://claude.ai/artifact/XE9Rz7qLP1qPYmEMRA21fw

Ninguna pantalla de soporte se modifica. La fase se muestra como badge
**adicional** al estado, solo en las vistas de proyecto.

---

## 5. Dos bugs vivos, previos a este plan

### 5.1 `'proposed'` falta en los enums de TypeScript — bloquea Triage

La migración 00073 añadió el valor en la base; el código no lo sabe.
`lib/domain/tickets.domain.ts:60` y `lib/schemas/ticket.schema.ts:26` listan 12
valores.

Hoy: `ticketStatusEnum.parse('proposed')` lanza, y `VALID_TRANSITIONS['proposed']`
no existe, así que un ticket propuesto no cambia de estado por la vía normal.

4 archivos. **Ninguno en la zona de Emma** — `ticket.schema.ts` sí lo tocó ella,
pero solo añadimos un valor al enum, sin cambiar los existentes.

### 5.2 `delivery_cycle_status` cuenta mal los cancelados

00074:84-92: `items_total` usa `count(*)` e incluye los cancelados;
`items_done` no. El porcentaje por ítems sale más bajo del real.

Función de proyectos, creada por nosotros. Fuera de la zona de Emma. Hoy hay
**0 ciclos cerrados**, así que no hay nada que recalcular.

---

## 6. Orden de trabajo

| Paso | Qué | Toca soporte | Reversible |
|---|---|---|---|
| **0a** | `'proposed'` en los 4 archivos de TS | no | sí |
| **0b** `00075` | `items_total` excluye cancelados | no | sí |
| **A** `00076` | Columna de fase + CHECK + catálogo | no | sí |
| **B** `00077` | Registro de fases + trigger | no | sí |
| **C** `00078` | Esperas (el ida y vuelta de la Fase 1) | no | sí |
| **D** `00079` | Funciones de cálculo | no | sí |
| **E** | Pestaña interna de SLA por fase | no | sí |
| **F** | Vista del cliente | no | sí |
| **G** | Contrato Enterprise + tallas S=1 M=2 L=4 | **sí: cambia lo que se cobra** | sí |

Los pasos 0a–F **no tocan una sola línea de las migraciones 00047–00063 ni de
los 30 archivos de Emma**.

El paso **G va aparte y en su propia ventana**: es el único que cambia la
facturación, y requiere decidir si el contrato de Podenza pasa a Enterprise.

### Sin backfill del histórico

Las propuestas anteriores incluían reconstruir las 2092 transiciones para tener
una línea base. **Lo retiro.** Esas transiciones son de tickets de soporte y
garantía; interpretarlas como fases de proyecto mezclaría los dos procesos justo
donde más importa no mezclarlos.

Los 16 tickets de tipo proyecto que existen no tienen `project_id`, ni ciclo, ni
estimación: entran al proceso nuevo desde la fase que el PM les asigne.

### Verificación de cada paso

```bash
node scripts/mcp/verify-00067.mjs            # facturacion: 11 valores identicos
node scripts/mcp/verify-rls.mjs --esperado   # aislamiento entre clientes
node scripts/mcp/schema-audit.mjs            # columnas inventadas
node scripts/mcp/contract-test.mjs           # catalogo MCP + invariantes
pnpm typecheck
```

Más, específico de este plan, antes y después de cada migración:

```sql
-- Las cifras de soporte no se mueven. Deben dar idénticas.
SELECT * FROM support_cycle_compliance('6c257312-d151-48fe-8d37-dfe5143472fa');
SELECT * FROM support_cycle_usage('6c257312-d151-48fe-8d37-dfe5143472fa');
```

Línea base medida hoy, 16-oct-2026, ciclo 22-sep → 21-oct:

```
measurable=15  met=15  breached=0  compliance_pct=100  credit_cop=0
consumed=15  quota=30  excluded_bad_dates=7
excluded_count=3
```

**Si cualquiera de esas cifras cambia tras un paso, se revierte.** Esa es la
prueba de que soporte no se tocó: no un argumento, una medición.

Y el ensayo en `BEGIN … ROLLBACK` de cada migración antes de aplicarla — el
método que ya encontró cuatro defectos reales.

---

## 7. Resumen de la pregunta que originó este plan

> *"Yo veo que estás nombrando todos los tickets, como que si lo que vamos a
> aplicar afecta a todos los tickets. Y esto no debe ser así."*

Tenías razón, y el motivo del malentendido fue mío: el análisis de riesgos que
resumí medía la ruta de **estados `req_*` en el enum compartido**, que sí tocaba
los 714 tickets. Esa ruta quedó descartada precisamente por eso. Lo que se
construye es la otra: columna propia, tablas propias, restringida por CHECK a los
tipos de proyecto.

Verificado con tres mediciones independientes:

1. Las funciones de SLA, cuota y crédito filtran por **tipo**, y los tipos de
   proyecto nunca estuvieron en la lista.
2. De 714 tickets, **15 tienen SLA activo y los 15 son de tipo `support`**.
3. En el peor escenario del único trigger sin cláusula de columna, los 7 tickets
   afectados tienen `sla_applies = false` y **no pueden generar un peso de
   crédito**. Y el CHECK lo impide de todas formas.
