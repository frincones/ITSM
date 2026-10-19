# Plan de trabajo — rejilla del tablero, filtros y el defecto del Planning

El tablero repite las 7 cabeceras de fase una vez por banda: dibuja **28
cabeceras para 7 fases reales**, y casi todas sus celdas muestran un guion.
Este plan lo reorganiza al patrón del Taskboard de Azure DevOps —cabeceras una
sola vez, una fila por entregable— añade filtros que funcionan, y corrige un
defecto que ya está en producción.

Mockup aprobado: https://claude.ai/artifact/KjNwwXSZhUtb45HqKXmPC1

**Nada de esto toca la base de datos, el cálculo del contrato ni el SLA de
soporte.** Las dos auditorías lo verificaron; la sección 1 lo documenta.

---

## 1. Lo que la auditoría descartó como riesgo

Verificado por grep exhaustivo sobre `apps/web`, no por suposición:

| Afirmación | Evidencia |
|---|---|
| Ninguna tool MCP usa `listCycleItems` ni `getCardDetail` | no están entre los 35 imports de `lib/mcp/tools/delivery.ts` |
| Nada fuera de `app/home/delivery/` importa el tablero | cero importadores de `cycle-board` / `card-panel` |
| El portal del cliente no se ve afectado | va por `portal-delivery.service.ts`, camino independiente |
| El componente no puede tocar el cálculo | no hay cliente Supabase ni `.rpc()` en `_components/` |
| Filtrar en cliente no escribe nada | mismo patrón que `densidad` y `agrupar`, que ya existen |

**No hay tests que cubran estos componentes.** No hay nada que romper ahí, pero
tampoco red de seguridad: la verificación de esta entrega es manual y por
guardas de base de datos.

### Lo único que escribe

`mover()` → `setPhaseAction` → el trigger `trg_log_ticket_phase_change` de
00077 cierra el tramo anterior y abre el nuevo **congelando dueño y
`target_days`**. Eso alimenta `ticket_phase_sla` → `requirement_delay` →
`cycle_sla_breaches` → `cycle_delivery_compliance`, o sea el descuento en COP.

**Cada arrastre es un hecho contractual, no un movimiento de interfaz, y no
tiene deshacer.** De ahí que la fase A del plan sea proteger el arrastre antes
de reorganizar nada.

---

## 2. El defecto que ya está en producción

No lo causa este rediseño. Lo introduje al reescribir `listCycleItems` para que
el tablero recibiera los 21 tickets en vez de los 8 entregables.

`DeliveryClient` guarda esa respuesta en **un solo estado `items`**
(`delivery-client.tsx:128`) que comparten el tablero y la pestaña Planning. El
tablero sabe distinguir entregables de miembros; **Planning no**: los lista
todos (`delivery-client.tsx:700`, `:793`).

Consecuencias hoy, en producción:

- Planning muestra **21 filas en vez de 8**, trece de ellas miembros con `0`
  créditos y talla vacía.
- Cada una lleva un botón **«Sacar»** → `assignToCycleAction(id, null)`.
- Ensayado contra producción en `BEGIN/ROLLBACK`: sacar un miembro **no mueve
  ninguna cifra del contrato** (sus `effort_points` son 0), pero lo deja
  **huérfano** —fuera del ciclo y colgando de un padre que sigue dentro—, y el
  padre lo sigue contando en `member_count`. Estado incoherente con un clic.
- El comentario de `delivery-client.tsx:697` afirma que la función *"devuelve
  solo los ENTREGABLES, sin los miembros de un grupo"*. **Dejó de ser cierto.**

Se arregla primero, por separado y con su propio commit, porque no depende del
rediseño y hoy está expuesto.

---

## 3. Las fases

### Fase 0 — Red de seguridad (antes de tocar código)

1. Capturar la línea base del contrato: 17 cifras de
   `cycle_delivery_compliance` + `delivery_cycle_status` + `cycle_sla_breaches`.
2. Confirmar árbol limpio en los cuatro archivos a tocar, para que
   `git checkout` revierta sin arrastrar nada.
3. Dejar escrito el guion de verificación manual del arrastre (sección 5), que
   es lo único que ningún script cubre.

**Criterio de salida:** línea base en disco y árbol limpio.

---

### Fase 1 — El defecto del Planning  ·  *commit propio*

`apps/web/app/home/delivery/_components/delivery-client.tsx`

1. `delCiclo` pasa a `items.filter(i => i.is_deliverable !== false)`.
   El `!== false` y no `=== true` a propósito: si algún día la fila llega sin
   el campo, se comporta como antes en vez de vaciar la lista. Ya hubo una
   regresión así, documentada en `:697-699`.
2. Corregir el comentario que afirma lo que ya no es cierto.
3. Añadir a `Item` el campo `is_deliverable`.

**Qué se verifica:** Planning vuelve a 8 filas; los créditos suman 17; el botón
«Sacar» ya no aparece sobre ningún miembro.

**Riesgo:** bajo. Tres líneas, y restaura el comportamiento que Planning tenía
antes de mi cambio.

---

### Fase 2 — Deuda previa al refactor  ·  *commit propio*

Esto se hace **antes** de mover el layout, porque después es fácil que se
pierda entre el ruido del diff.

1. **Sacar la tarifa `790714.29` a una constante.** Está duplicada en
   `cycle-board.tsx:444` y `:746`. Al reorganizar el layout es fácil mover una
   de las dos y que la cabecera deje de cuadrar con la tarjeta.
   **Hallazgo a dejar escrito en el código:** `cycle_delivery_compliance`
   devuelve hoy `credit_value_cop = null` porque `billing_plans` está vacío, así
   que **el tablero pinta pesos que la base no valida**. La constante lleva un
   comentario diciéndolo, y queda pendiente de que cargues el plan.
2. **Sacar `repartir()` del `.map()` de carriles** (`:458`): hoy se ejecuta 7
   veces por banda. Con más celdas y filtros, empeora.
3. **Arreglar las deps del `useEffect` de Escape** en `card-panel.tsx:119-125`:
   son `[props]`, así que el listener se re-registra en cada render del padre.

**Qué se verifica:** typecheck, lint, y que las cifras del tablero no cambian.

---

### Fase 3 — La rejilla  ·  *commit propio*

`apps/web/app/home/delivery/_components/cycle-board.tsx`

**Lo que cambia:** una fila de cabeceras fija arriba; una fila por entregable
con el padre en su propia celda a la izquierda, fuera de las columnas de fase;
filas plegables; conteo **global** por fase (hoy es por banda, y por eso no se
puede leer la carga real del ciclo).

**Lo que NO cambia, y es la condición de que esto sea solo presentación:**

- **Cada ticket conserva su tarjeta y su arrastre.** Los 13 miembros siguen
  siendo tarjetas propias. Esto no es estética: es lo que permite que dos
  desarrolladores lleven requerimientos distintos del mismo entregable, y es
  la razón por la que se cambió `listCycleItems` en su día.
- **La forma de la respuesta de `listCycleItemsAction` y el estado `items`.**
  Siempre derivar listas nuevas con `useMemo`; nunca mutar `items`, porque
  Planning lee el mismo estado.
- **El entregable sigue siendo arrastrable.** Si su tarjeta se convierte en
  cabecera de fila no arrastrable, el PM pierde la única forma de mover por
  arrastre la fase que mueve el reloj del Anexo C.

**Invariantes del arrastre** (de la auditoría; cada uno es un fallo real si se
pierde):

| # | Invariante | Qué pasa si se pierde |
|---|---|---|
| 1 | `e.preventDefault()` en `onDragOver` | no se puede soltar en ningún sitio |
| 2 | La celda conoce su `fase` y llama `mover(id, fase)` | se mueve la fase equivocada |
| 3 | `zona` sigue siendo `fila:fase`, no solo `fase` | se iluminan las 7 celdas de la columna en todas las filas |
| 4 | `arrastrando ?? dataTransfer.getData('text/plain')` | se rompe en Firefox |
| 5 | Altura mínima en la celda vacía | **el drop deja de funcionar donde no hay tarjetas** — el riesgo nº1, porque visualmente se ve bien |
| 6 | `draggable={!bloqueado && !moviendo}` | se puede mover en un ciclo cerrado |

**Y hay que decidir dónde vive la tarjeta del entregable**: en la columna de su
propia fase, junto a sus miembros. Es lo que hace hoy (`:203`) y lo que mantiene
el invariante 2.

---

### Fase 4 — Los filtros  ·  *commit propio*

Barra escondida tras el embudo, como Azure. Lo permanente en la barra no son
filtros: es el periodo del ciclo y los días hábiles restantes.

**Los 7 filtros, elegidos midiendo cuántos valores distintos reparten los 21
tickets del ciclo** — un filtro cuyos 21 tickets comparten valor es un control
muerto:

| Filtro | Valores reales |
|---|---|
| Release | R1:8 · R2:9 · R3:4 |
| Responsable | Emma:12 · Camilo:5 · Admin:3 · Bibiana:1 |
| Tipo | Entregable:8 · Ticket de un grupo:13 |
| Estado | backlog:17 · new:3 · detenido:1 |
| Fase | Levantamiento:8 · Sin fase:13 |
| Talla | M:6 · S:1 · L:1 · sin estimar:13 |
| Etiqueta | Clientes:4 · No Stopper:1 |

Más búsqueda por número, título y descripción.

**Descartados, con su motivo medido:** prioridad (4:21), urgencia (medium:21),
impacto (medium:21), canal (portal:21) — un solo valor en los 21.
Área/categoría: vacía en 19 de 21. Organización y proyecto: el ciclo ya es de un
cliente. Módulo: `listCycleItems` ni lo selecciona, y está vacío en 17 de 21.

**Cuatro trampas del filtrado**, todas detectadas probando:

1. **Hijo visible con padre filtrado.** Filtrar por Camilo deja 4 tickets cuyo
   entregable es de Emma; sin tratarlo, esos 4 **desaparecen** porque la fila no
   se dibuja. Solución, la de Azure: conservar la fila del padre **como
   contexto**, atenuada y marcada *fuera del filtro*, sin pintar su tarjeta —
   él no cumple el filtro. Ya probado: los 5 tickets de Camilo se ven.
2. **El aviso de «sin fase» debe calcularse sobre `items` completo**, no sobre
   lo filtrado. Si no, un filtro silencia el aviso y quedan entregables sin
   tramo, invisibles para el cálculo de atraso.
3. **`hermanos` del `CardPanel` se queda sin filtrar.** Si se pasa la lista
   filtrada y se abre un ticket que queda fuera, `idx === -1` y Anterior/
   Siguiente se rompen.
4. **Arrastrar a una fase excluida por el filtro** hace que la tarjeta
   desaparezca tras recargar, y parece un fallo. Mínimo: avisar.

Los filtros son efímeros, como `densidad` y `agrupar`: `TabsContent` desmonta el
componente al cambiar de pestaña. Persistirlos en la URL es trabajo aparte y no
entra aquí.

---

### Fase 5 — Verificación

| Guarda | Qué exige |
|---|---|
| `baseline-soporte.mjs --esperado` | las 13 cifras del SLA de soporte, intactas |
| `verify-reloj-miembros.mjs` | 13 miembros con 90 días no mueven ninguna de las 15 cifras del contrato |
| `verify-aislamiento.mjs` | ningún cliente ve datos de otro |
| `verify-mcp-proyectos.mjs` | las 34 tools responden |
| línea base de la fase 0 | las 17 cifras, idénticas |
| `tsc --noEmit` + `eslint` | sin errores en los archivos tocados |

**Manual, porque ningún script lo cubre:** el guion de arrastre de la sección 5.

---

## 4. Orden y reversión

Cuatro commits independientes, cada uno revertible por separado:

```
1. fix(proyectos): Planning vuelve a listar solo los entregables
2. refactor(proyectos): tarifa a constante, repartir fuera del map, deps del Escape
3. feat(proyectos): la fase se nombra una vez — rejilla al estilo Taskboard
4. feat(proyectos): filtros del tablero detrás del embudo
```

El 1 puede ir a producción sin esperar a los demás: arregla algo que hoy está
expuesto. Si el 3 o el 4 salen mal, `git revert` de ese commit deja el tablero
como está hoy sin tocar el arreglo del Planning.

---

## 5. Guion de verificación manual del arrastre

Ningún script cubre esto y es lo único que escribe en el camino del descuento.
Sobre el ciclo 1, **anotando `requirement_phase` antes y después**:

1. Arrastrar un **miembro** de una fase a otra → cambia solo él; su entregable
   no se mueve; las cifras del contrato no se mueven.
2. Arrastrar el **entregable** → cambia él; sus miembros se quedan donde están.
3. Soltar sobre una **celda vacía** → funciona (invariante 5, el riesgo nº1).
4. Arrastrar con un **filtro activo** hacia una fase excluida → comprobar qué
   pasa y que no parezca un fallo.
5. Con el **ciclo cerrado** → no se puede arrastrar.
6. Soltar **fuera** de cualquier celda → no pasa nada.

---

## 6. Fuera de alcance

- **Cargar el plan en `billing_plans`.** Hasta que no esté, `discount_cop`
  devuelve NULL y el tablero pinta pesos con una tarifa escrita a mano. Decisión
  tuya.
- **Clasificar los 13 tickets sin fase.** Poner un ticket en una fase es una
  afirmación real sobre su estado; no se hace por script.
- **Persistir filtros en la URL.**
- **Tests automatizados del tablero.** No existen; crearlos es trabajo aparte.
- **El portal del cliente.** Es otro componente y este plan no lo toca.
