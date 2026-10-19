# Plan — la fase «propuesto» para lo que aún no ha iniciado

Los nueve entregables del ciclo 1 están en `levantamiento`, pero solo cuatro
han empezado de verdad: la capa de filtros, los dos de WhatsApp y la
integración de Santander. Los otros cinco no han iniciado.

**No es un dato que alguien metiera mal: lo puse yo.** El script
`arrancar-ciclo1.mjs:116` los movió a `levantamiento` en bloque el 16 de
octubre para que el tablero no saliera vacío:

```js
UPDATE tickets SET requirement_phase='levantamiento' WHERE id=$1
```

Era una suposición, y el reloj del contrato lleva tres días contándola.

---

## 1. Lo que cuesta hoy

| Entregable | ¿Inició? | Días netos |
|---|---|---|
| R1 · Capa de filtros | sí | 2 |
| R2 · Captura por WhatsApp y QR | sí | 2 |
| R2 · Validación y enrutamiento WhatsApp | sí | 2 |
| Trabajo paralelo · Santander | sí | 1 |
| R2 · Inactivación de usuarios | **no** | 2 ❌ |
| R3 · Asociar un codeudor | **no** | 2 ❌ |
| R3 · Desistimiento general | **no** | 2 ❌ |
| R3 · Duplicar una solicitud | **no** | 2 ❌ |
| R3 · Modal rol Seguros | **no** | 2 ❌ |

**10 de los 17 días de `client_delay_days` son falsos.** Y `levantamiento`
tiene plazo de 2 días hábiles: los cinco ya lo agotaron. Están al borde de
incumplir un plazo que nunca debió abrirse.

---

## 2. Por qué «propuesto» y no otra cosa

`propuesto` ya existe en `delivery_phases` (orden 0) y el tablero es el único
sitio que no la pinta. Medido contra producción:

```
propuesto       SIN PLAZO — el reloj no corre
levantamiento   2.00 días
desarrollo      4.00 días
```

Y arregla de paso un defecto que encontré el jueves:

```
'propuesto' = 'entregado'  ->  false   (sus créditos SÍ cuentan)
NULL        = 'entregado'  ->  NULL    (se pierden en silencio)
```

Un entregable sin fase desaparece de `pending_credits` porque
`WHERE NOT is_delivered` descarta el `NULL`. Con `propuesto` eso no pasa. Por
eso esta opción es mejor que dejarlos sin fase.

---

## 3. El hallazgo que cambia la receta

**Mover a `propuesto` no basta.** Medido con un ticket:

```
antes:    levantamiento  2 días  ABIERTO        cliente=2d
después:  levantamiento  2 días  cerrado
          propuesto      sin plazo  ABIERTO     cliente=3d   ← subió
```

`propuesto` tiene `owner = 'cliente'`, así que **sigue sumando días aunque no
tenga plazo**. Y el tramo viejo se cierra conservando sus 2 días falsos.

Aplicado a los cinco, `client_delay_days` **subiría de 17 a 22**.

La receta correcta es borrar el tramo falso **y después** poner la fase:

| | `client_delay_days` |
|---|---|
| hoy | 17 |
| solo `propuesto` | **22** ✗ |
| borrar tramo + `propuesto` | **12** ✓ |

Los 12 restantes son los días reales de los cuatro que sí empezaron.

---

## 4. Qué se construye

### 4.1 La columna en el tablero

`CARRILES` pasa de 7 a 8, con `propuesto` primera. Es el único cambio de
código: el tipo `Fase` y la pestaña de SLA ya la contemplan
(`delivery.domain.ts:879`, `phase-sla-tab.tsx:61`).

Se pinta distinta de las demás —sin plazo que mostrar— y su cabecera lo dice:
*«aún no inicia · el reloj no corre»*.

### 4.2 La corrección de los datos

Un script con respaldo y `BEGIN/ROLLBACK`, sobre los cinco que no iniciaron:

1. **Respaldar** sus filas de `ticket_phase_log` a un `.json`.
2. **Borrar** el tramo de `levantamiento` que abrió mi script.
3. **Poner** `requirement_phase = 'propuesto'`.

El orden importa: si se pone la fase primero, el trigger cierra el tramo viejo
y lo deja contando.

---

## 5. Análisis de regresión

### 5.1 Lo que este cambio toca

| | |
|---|---|
| Código | `CARRILES` en `cycle-board.tsx` — una entrada más |
| Datos | 5 filas de `tickets`, 5 de `ticket_phase_log` |
| Base | **nada**: ni migración, ni función, ni enum |

### 5.2 Riesgos, medidos

| # | Riesgo | Por qué no ocurre | Verificación |
|---|---|---|---|
| 1 | Confundir la fase `propuesto` con el estado `proposed` | columnas distintas: `requirement_phase` vs `status`. El triage del portal filtra por `status` (`delivery.domain.ts:785`) y no se entera | contar propuestas del portal antes y después |
| 2 | Se mueve el descuento | los cinco tienen `exposed_over = 0` y `propuesto` no tiene plazo, así que no puede incumplir | las 15 cifras, idénticas |
| 3 | Se pierden créditos del total | al contrario: `propuesto` los conserva donde `NULL` los perdía | `pending_credits` sigue en 21 |
| 4 | Borrar tramos rompe el historial | solo se borra el tramo que abrió mi script el 16-oct; los de los cuatro que sí empezaron no se tocan | contar tramos por ticket antes y después |
| 5 | El arrastre deja de funcionar con 8 columnas | la zona de drop es `banda:fase` y se genera de `CARRILES` | los 6 invariantes del arrastre |
| 6 | La pestaña SLA se rompe | ya tiene `propuesto` en su lista de fases | abrirla y comprobar la columna |
| 7 | El portal del cliente muestra algo raro | usa `portal-delivery.service.ts`, camino aparte, y lee el catálogo de la base | contar lo que ve el portal antes y después |
| 8 | Las tools MCP dejan de responder | `REQUIREMENT_PHASES` ya incluye `propuesto` | el verificador de las 34 |

### 5.3 Lo que no se toca

- El SLA de soporte: el CHECK de 00076 impide que una fase llegue a un ticket
  de soporte
- `billing_plans`, el descuento y el valor del crédito
- Los 13 miembros sin fase: siguen en la franja de «falta por iniciar»
- La agrupación, los filtros y el panel lateral

### 5.4 Guardas

Las cuatro de siempre, más la línea base, más una comprobación propia:
`client_delay_days` debe bajar de 17 a 12 — **esa cifra tiene que cambiar**, y
si no cambia es que el borrado no se aplicó.

---

## 6. Orden

```
1. feat(proyectos): la columna «propuesto» en el tablero     (código)
2. fix(datos): los cinco que no iniciaron vuelven a propuesto  (datos)
```

Separados a propósito: el primero es reversible con `git revert`; el segundo
con el respaldo del `.json`.

---

## 7. Lo que decides tú

1. **¿Los cinco son los correctos?** Dijiste que siguen en levantamiento la
   capa de filtros, los dos de WhatsApp y Santander. Los otros cinco son
   Inactivación de usuarios y los cuatro de R3.
2. **¿Autorizas borrar los 10 días falsos?** Es corregir una cifra del
   contrato a la baja, a favor del cliente. Hay respaldo.
