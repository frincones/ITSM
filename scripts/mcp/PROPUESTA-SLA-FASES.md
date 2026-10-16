# SLA por fases — propuesta de implementación

Análisis del Anexo C del contrato TDX–Podenza (AI Pods 2026) contra lo que la
aplicación ya tiene. Medido contra producción el 16-oct-2026.

**Estado: propuesta. No se ha escrito código.**

---

## 1. Lo que pide el contrato

Cada ítem del backlog recorre **cinco fases**, cada una con su reloj, su
responsable y su regla de atraso:

| # | Fase | SLA | Responsable | ¿Descuento? |
|---|---|---|---|---|
| 1 | Documentación funcional | 2 días hábiles | PODENZA | no |
| 2 | Fundacional / accesos | 1 día hábil | PODENZA / tercero | no |
| 3 | **Desarrollo y pruebas** | **S:3 · M:4 · L:5** | **TDX** | **sí** |
| 4 | Pruebas de aceptación (UAT) | 2 días hábiles | PODENZA | no |
| 5 | Puesta en producción | calendario | freeze / tercero | no |

Dos reglas que gobiernan todo el cálculo:

- **El reloj de la Fase 3 no arranca hasta que las fases 1 y 2 estén
  completas.** TDX no responde por un atraso mientras espera documentación o
  accesos.
- **Los atrasos de PODENZA, de terceros o por fuerza mayor extienden el plazo
  de TDX día por día, sin penalización.**

Y el remedio económico, que se mide por ciclo y solo por causa de TDX:

- **≥ 50% y < 100%** entregado → se factura con descuento del valor no entregado
- **< 50%** → PODENZA puede retener el pago del ciclo

---

## 2. Qué de esto ya existe

Buena parte de la maquinaria está construida y en uso:

| Lo que hace falta | Ya existe | Dónde |
|---|---|---|
| Registrar entrada y salida de cada fase | **`ticket_status_history`** — 2092 filas, escrito por trigger, con actor y fecha | 00045 |
| Pausar el reloj mientras se espera al cliente | **`pause_reason` + `pauses_sla`** — ya en uso: 8 transiciones con `espera_cliente_validacion` | 00045 |
| Contar días hábiles sin festivos | **`working_days_between()`** | 00072 |
| Descontar tiempo en pausa | **`ticket_paused_business_minutes()`** | 00053 |
| Calendario de festivos | **`calendar_holidays`** — 36 cargados | 00006 |
| Cumplimiento por ciclo con crédito | **`support_cycle_compliance()`** | 00057 |
| Límite de devoluciones | **`testing_strikes`** — ya con datos | 00032 |
| Talla del ítem | **`effort_size`** | 00067 |

**El mecanismo de pausa es el hallazgo más importante.** La regla "el reloj de
TDX no corre mientras espera a PODENZA" es exactamente lo que
`pauses_sla = true` ya implementa, y ya se usó 8 veces. No hay que inventarlo:
hay que conectarlo a las fases.

---

## 3. Tres conflictos que hay que resolver antes

### 3.1 Las tallas no coinciden

| | S | M | L | XL |
|---|---|---|---|---|
| **Implementado** (00067) | 1 | 3 | 8 | 13 |
| **Contrato** (Anexo C) | 1 | **2** | **4** | no existe |

Nuestra escala es Fibonacci, pensada para estimar esfuerzo relativo. La del
contrato es la que determina **cuánto se factura y cuánto se descuenta**.

Son dos usos distintos del mismo nombre, y mantener dos escalas en paralelo es
cómo se acaba facturando por la equivocada.

**Recomiendo alinear a la del contrato y eliminar XL**, porque es la que tiene
consecuencia económica. Si el equipo necesita una escala más fina para estimar,
mejor en otra columna con otro nombre.

⚠️ Esto es una decisión tuya: cambiar la escala afecta a lo que se cobra.

### 3.2 El contrato en la base no es el del documento

| | Plan | Cupo | Mensual | Unitario |
|---|---|---|---|---|
| **En producción** | Professional | 30 tickets | $1.000.000 | $33.333 |
| **Anexo C** | Enterprise | 14 créditos | $11.070.000 | $790.714 |
| | Growth | 8 créditos | $7.980.000 | $997.500 |

El contrato cargado en la base es **otro** — distinto plan, distinto cupo,
distinto valor. Hay que decidir si el de Podenza se actualiza a Enterprise o si
conviven dos acuerdos.

Además, el cupo actual cuenta **tickets**; el Anexo C cuenta **créditos por
talla**. No es lo mismo: 14 créditos pueden ser 14 ítems S o 3 ítems L.

### 3.3 "Crédito" ya significa dos cosas, y ahora tres

- `credit_cop` / `credit_tickets` = **descuento por incumplir SLA de respuesta**
  (00057), ya en reportes entregados
- `effort_points` = **esfuerzo** (00067), lo que decidimos llamar así
  precisamente para no chocar
- El Anexo C llama **"crédito"** a la unidad facturable por talla

Propongo: la unidad del contrato se llama `billing_credits`, distinta de
`effort_points` y de `credit_cop`. Tres nombres para tres cosas.

---

## 4. Lo que falta construir

### 4.1 Catálogo de fases y sus SLA

```
delivery_phases        las 5 fases, con orden y responsable
phase_sla_targets      el plazo por fase y, en la 3, por talla
```

Versionado por vigencia, como `effort_conversion`: si el contrato cambia los
plazos, lo ya medido no se recalcula.

### 4.2 Registro de entrada y salida por fase

```
ticket_phase_log       ticket, fase, entró, salió, responsable, pausas
```

Lo escribe un trigger sobre los cambios de estado, siguiendo el patrón de
`ticket_type_history`: así recoge los movimientos vengan de la UI, del MCP o de
SQL directo.

**Requiere mapear estados a fases.** Los 13 estados actuales no se
corresponden uno a uno con las 5 fases, y ese mapeo es una decisión de negocio
que conviene acordar con Emma antes de escribirlo.

### 4.3 El cálculo

```
ticket_phase_sla_status(ticket_id)   días consumidos vs objetivo, por fase
cycle_sla_breaches(cycle_id)         qué rompió el SLA y de quién es la culpa
cycle_delivery_compliance(cycle_id)  el % del ciclo y el descuento aplicable
```

La tercera implementa el umbral del 50% y la fórmula del descuento:
`(valor mensual ÷ créditos del plan) × créditos del ítem`, con el tope de que
el descuento de un ciclo nunca excede el valor del ciclo.

### 4.4 Las pantallas

**Interno** (`/home/delivery`): una pestaña "SLA" con los ítems que están
rompiendo plazo, agrupados por fase y responsable, y el semáforo del ciclo
contra el umbral del 50%.

**Portal del cliente** (`/portal/<token>/proyecto`): el avance por fase de cada
ítem suyo y, con franqueza, **qué está esperando de ellos**. La mitad de los
atrasos del contrato son de PODENZA; una pantalla que solo muestre los de TDX
cuenta media historia.

---

## 5. Lo que recomiendo NO hacer

**No tocar `support_cycle_compliance()`.** Mide el SLA de *respuesta* de
soporte, está en reportes entregados y su crédito ya se factura. El SLA de
*fases* es otro mecanismo sobre otro tipo de trabajo. Dos funciones separadas
que nadie confunda, no una que haga las dos cosas.

**No añadir estados de ticket nuevos.** Ya hay 13, y el contrato habla de
fases, no de estados. Es mejor mapear los estados existentes a fases que
multiplicar el enum — cada valor nuevo obliga a tocar 7 archivos de TypeScript
y puede alterar la facturación en silencio.

---

## 6. Fases de implementación

| Fase | Qué | Riesgo |
|---|---|---|
| **A** | Catálogo de fases y SLA, sin conectar nada | ninguno: tablas nuevas vacías |
| **B** | Registro por fase + trigger + backfill del histórico | bajo: solo escribe en tabla nueva |
| **C** | Funciones de cálculo y vista interna | bajo: solo lee |
| **D** | Vista del cliente en el portal | bajo |
| **E** | Alinear tallas y contrato | **alto: toca facturación** |

La fase E va al final y por separado a propósito: es la única que cambia lo que
se cobra, y merece su propia ventana y su propia verificación.

El backfill de la fase B es valioso: con 2092 transiciones de historial se
puede reconstruir cuánto tardó cada fase en los ítems ya entregados, y eso da
una línea base real de cumplimiento antes de empezar a medir hacia adelante.

---

## 7. Decisiones que necesito de ti

1. **¿Alineamos las tallas al contrato** (S=1, M=2, L=4, sin XL) o conviven dos
   escalas?
2. **¿El contrato de Podenza pasa a Enterprise** (14 créditos, $11.070.000) o
   el de la base es otro acuerdo vigente?
3. **El mapeo estado → fase**: ¿lo acordamos contigo y Emma, o prefieres que
   proponga uno a partir de cómo se usan hoy los 13 estados?
4. **¿El portal del cliente muestra también los atrasos de PODENZA?** Lo
   recomiendo —es la mitad de la historia y evita discusiones— pero cambia el
   tono de la pantalla.
