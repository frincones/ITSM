# SLA por fases del Anexo C (contrato TDX–Podenza)

Mide cuánto tarda cada requerimiento de proyecto en cada fase del contrato,
de quién es cada día de atraso, y cuánto descuento expone.

**El SLA de soporte no se toca.** Ese es otro mecanismo sobre otro tipo de
trabajo, está en reportes entregados al cliente y su crédito ya se factura.

---

## Lo que resuelve

El equipo describió el dolor así:

> "el dolor mayor que tenemos es que Podenza se demora mucho en aprobar un
> documento funcional (...) y el PM asignado debe lograr revisarlos,
> gestionarlos y usar la herramienta para decir ya recibimos o cuándo
> recibimos la respuesta"

Hoy es imposible responder "¿este atraso es de TDX o del cliente?". Medido en
el historial: de **221 pausas registradas, 209 no dicen por qué** el ticket
está parado. Y por el diseño conservador del SLA de soporte, una pausa sin
justificar no detiene el reloj: corre contra nosotros.

---

## Las cinco fases, con el proceso real

| # | Fase | Plazo | Responsable | ¿Descuento? |
|---|---|---|---|---|
| 1 | Levantamiento | 2 días hábiles | cliente | no |
| 2 | Documentación funcional | 2 días hábiles | **TDX** | no |
| 3 | Fundacional / accesos | 1 día hábil | cliente / tercero | no |
| 4 | **Desarrollo y pruebas** | **S:3 M:4 L:5** | **TDX** | **sí** |
| 5 | UAT | 2 días hábiles | cliente | no |
| 6 | Puesta en producción | calendario | freeze / tercero | no |

`levantamiento` y `documentacion` van separadas porque el proceso real tiene
dos tramos: el cliente se sienta a la reunión, y después **TDX redacta** con
turnos de ida y vuelta de 24 horas cada uno. El plazo arranca el día de la
reunión.

Los turnos se registran uno por uno, así que queda constancia de si el cliente
tardó cinco días cuando tenía uno — y de si fuimos nosotros.

---

## La decisión de arquitectura, y por qué cambió

La propuesta inicial era añadir 9 estados `req_*` al enum `ticket_status`.
**Medido el costo, se descartó.**

| | Estados `req_*` | Columna propia |
|---|---|---|
| Mapas etiqueta/color | 10 archivos | 0 |
| Listas `.in('status',[...])` | 24 consultas | 0 |
| Claves de `VALID_TRANSITIONS` | 9 + aristas | 0 |
| **Puntos a tocar** | **~63** | **~1** |
| Protegidos por el compilador | **1 de 63** | n/a |
| Reversible | **no, nunca** | sí |

Dos de esos fallos serían **silenciosos**:

- `workspace-grouping.ts:429` descarta sin error un ticket que no coincide con
  ninguna regla (`// drop quietly`), así que un requerimiento desaparecería de
  la pantalla sin aviso.
- `tickets.domain.ts:381` hace `VALID_TRANSITIONS[status] ?? []`, así que un
  estado sin clave **congela el ticket para siempre**.

Y hay prueba empírica de que el barrido manual no se hace: la migración 00073
añadió el valor `'proposed'` y **nunca actualizó las dos declaraciones de
TypeScript**. Ese bug venía en producción y se corrige en este PR.

**Lo que cierra el asunto:** el enum colapsaría *fase* y *estado de pausa* en
una columna. Un ítem no podría estar a la vez en fase de desarrollo y detenido
esperando al cliente — y la cláusula *"los atrasos de PODENZA extienden el
plazo de TDX día por día"* es literalmente `pauses_sla = true`. El enum habría
roto la función que da sentido a todo esto.

---

## Que soporte no se toca: medido, no afirmado

Los dos universos **ya estaban separados por tipo de ticket** desde que se
construyó el SLA de soporte. Las tres funciones que gobiernan SLA, cuota y
descuentos filtran idéntico:

```sql
SELECT p_type IN ('support', 'incident', 'request');
```

Los tipos de proyecto (`backlog`, `desarrollo_pendiente`) **no están en esa
lista y nunca estuvieron**.

| Universo | Tickets | Con SLA activo |
|---|---|---|
| Soporte | 375 | **15** |
| Garantía | 323 | **0** |
| Proyecto | 16 | **0** |

Los 15 con SLA son todos de tipo `support`.

**La garantía mecánica**, añadida en 00076:

```sql
CHECK (requirement_phase IS NULL
       OR type IN ('backlog','desarrollo_pendiente'))
```

Probado tipo por tipo: `support`, `incident`, `request` y `warranty` con fase
quedan **bloqueados por la base**. Ya no depende de que el código se porte
bien.

### La guardia que lo verifica en cada paso

`scripts/mcp/baseline-soporte.mjs` llama a las funciones reales y exige las 13
cifras del ciclo vigente:

```
measurable=15  met=15  breached=0  compliance_pct=100  credit_cop=0
consumed=15  quota=30  excluded_bad_dates=7
tickets con SLA: 15 de tipo support, 0 de otros tipos
```

En verde tras las 6 migraciones. No es un argumento, es una medición.

---

## La cláusula del contrato, funcionando

La prueba que más importa de todo el PR. A un ítem con 4 días de atraso
imputable se le registra una espera del cliente:

```
atraso imputable:   4d  ->  0d
descuento:          $3.162.857,16  ->  $0
```

Y el caso inverso: un ítem atrasado 19 días esperando al cliente mueve
`client_delay_days` pero **no toca el descuento**.

Eso es *"los atrasos de PODENZA extienden el plazo de TDX día por día"*
implementado, no descrito. Sale del modelo: `paused_days` resta en `net_days`,
y solo `net_days` se compara con el plazo.

### La fórmula, verificada exacta

```
$11.070.000 ÷ 14 créditos = $790.714,29 por crédito
$790.714,29 × 4 créditos (talla L) = $3.162.857,16
```

Con el tope del contrato (el descuento nunca excede el valor del ciclo) y el
umbral del 50% que habilita la retención del pago.

---

## Las migraciones

| | Qué | Riesgo |
|---|---|---|
| `00075` | Corrige `delivery_cycle_status`: los cancelados salían del numerador pero no del denominador | ninguno: 0 ciclos cerrados |
| `00076` | Enum `requirement_phase`, la columna, el CHECK y el catálogo de 9 fases + 7 plazos | ninguno: columna nullable |
| `00077` | `ticket_phase_log` + trigger + el cálculo del atraso por responsable | bajo: solo escribe en tabla nueva |
| `00078` | `phase_waits` con los turnos de 24h — el "ya llegó" | ninguno |
| `00079` | `cycle_delivery_compliance` y el descuento | ninguno: solo lee |
| `00080` | **Escala por organización** (Podenza S=1 M=2 L=4) | **toca facturación** |

Cada una ensayada en `BEGIN … ROLLBACK` antes de aplicarse.

### Defectos que el ensayo encontró antes de aplicar

1. **`CREATE TRIGGER` y `CREATE POLICY` no admiten `IF NOT EXISTS`** —
   reaplicar 00076 y 00077 fallaba. Corregido con `DROP IF EXISTS` previo.
2. **`paused_days` podía superar la duración del tramo** — un PM apunta el
   lunes algo que pidió la semana pasada, y la espera costaba 6 días hábiles
   dentro de un tramo de 1. La pantalla lo tapaba con `greatest(…, 0)`, pero
   el dato almacenado quedaba falso, y es el que se audita. Acotado.
3. **`assigned_points` sumaba los puntos del ítem cancelado**, inflando el
   `over_commitment`.
4. **`getEffortScale` era no determinista con dos escalas** — ver abajo.

---

## El bug que 00080 habría creado

`getEffortScale` hacía:

```js
for (const row of rows) scale[row.size] = row.points;
```

Con dos escalas vigentes (la general y la de Podenza), el valor final dependía
**del orden que devolviera la base**, que Postgres no garantiza. El mismo ítem
podía estimarse con una escala u otra entre dos llamadas, y un ítem de
Prosuministros podía recibir los créditos pactados con Podenza.

Corregido con precedencia explícita. `verify-00067.mjs` tenía el mismo defecto
en su `Object.fromEntries`; también actualizado para verificar las dos escalas
por separado.

Resultado medido: un ítem **L vale 4 créditos para Podenza y 8 puntos para
Prosuministros**.

---

## Lo que NO hace este PR, a propósito

**No carga el plan Enterprise.** El Anexo C dice Enterprise (14 créditos,
$11.070.000) y el contrato en la base dice Professional (30 tickets,
$1.000.000). **Decidir cuál rige para facturar no es una decisión técnica.**

Mientras `billing_plans` esté vacía, `cycle_delivery_compliance` devuelve
`discount_cop` en NULL y explica qué falta, en vez de calcular con el plan
equivocado. El `INSERT` listo está comentado al pie de 00080.

**No toca `organization_support_contracts`.** La cuota de soporte sigue igual.

**No hace backfill del histórico.** Las 2092 transiciones son de soporte y
garantía; leerlas como fases de proyecto mezclaría los dos procesos justo
donde importa no mezclarlos.

---

## Verificación

### Probado

| | |
|---|---|
| `baseline-soporte.mjs` | las 13 cifras de soporte idénticas |
| `verify-00067.mjs` | "todo igual" — las 12 cifras de facturación |
| `schema-audit.mjs` | 257 referencias de columna, sin inventos |
| RLS | los 7 usuarios con sus conteos exactos (admins 714, Camilo/Bibiana 470, Daniel/Andrés 240); `anon` bloqueado en las 5 tablas nuevas |
| Aislamiento del portal | Prosuministros ve **0** requerimientos y **0** esperas de Podenza |
| `typecheck` | 0 errores en los archivos tocados (427 en el repo: deuda previa; bajaron de 442 al regenerar tipos) |
| Ensayos | 6 migraciones × `BEGIN…ROLLBACK`, ~140 comprobaciones |

### NO probado — conviene saberlo antes de aprobar

**Build de producción: no verificado localmente.** `next build` se cuelga en
la máquina de desarrollo: el log se congela siempre en el mismo punto y nunca
genera `BUILD_ID`. **Comprobado que ocurre igual sin estos cambios** (10
minutos, árbol limpio, mismo punto exacto), así que es del entorno. Vercel lo
compilará en este PR y ahí sale la verdad.

**Verificación visual: no hecha.** El perfil de Chrome de Playwright está
bloqueado (`Browser is already in use`). Se verificó el typecheck y que los
datos que consumen las pantallas son correctos, pero **nadie ha visto las dos
pantallas renderizadas**.

**`contract-test.mjs`: 12 fallos ajenos a este PR.** Corre contra producción y
espera que `initialize` devuelva 200, pero ahora exige credencial — que es el
arreglo que hizo funcionar el conector de Claude.ai. El harness necesita
actualizarse a ese contrato.

---

## Pendiente, fuera del alcance de este PR

**Datos** (sin esto el módulo no se puede usar en serio):
- Los 3 proyectos existentes **no tienen organización asignada**, así que
  ningún ciclo resuelve a qué cliente facturar
- Los 16 requerimientos reales no tienen proyecto ni fase

**Decisiones:**
- ¿Podenza pasa a Enterprise, o el Professional de la base es el acuerdo
  vigente?
- El mapeo estado → fase, a validar con Emma
- La fecha del paso Enterprise → Growth (modelada como vigencia abierta)

**Deuda anotada, sin tocar:**
- `app/home/reports/tickets/page.tsx` **consulta tickets sin filtro de
  organización** — el mismo tipo de escape que se corrigió en las 12 tablas,
  en una superficie que quedó fuera
- Las páginas de `/home` no revalidan permisos de módulo: el menú filtra, la
  ruta no
- Congelar `cycle_delivery_compliance` al cerrar un ciclo, como hace
  `support_cycle_closures` con los de soporte

---

## Pantallas

- **Interno** — pestaña "SLA por fase": https://claude.ai/artifact/Ep5fNurPNoAzfurofB8ZD3
- **Portal del cliente**: https://claude.ai/artifact/BZY4JcMNFieoeGzcFMtmsB
- **Las dos leyendo la misma cifra**: https://claude.ai/artifact/XE9Rz7qLP1qPYmEMRA21fw

Son privados: hay que compartirlos desde el menú de cada página.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
