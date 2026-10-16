# Agrupar tickets en un requerimiento facturable

Cómo manejar que el contrato facture por **entregable** mientras el trabajo
entra como **tickets individuales**, y cómo medir el SLA de fases cuando
varios tickets comparten una sola historia de usuario.

**Propuesta. No se ha escrito código ni tocado la base.**

---

## 1. El problema, con el caso real

El cronograma de Podenza agrupa así:

| Grupo | Créditos | Tickets que lo componen |
|---|---|---|
| Filtros de R1 | **2** | 7 (filtro de QR, por banco, de aprobados, múltiple, Dinateam, ejecutivo…) |
| WhatsApp/QR de R2 | **4** | 4 |
| Leads de R4 | **2** | 5 |
| Reasignación | 1 | 1 |
| Los 4 de R3 | 2 c/u | 1 cada uno |

Y según el equipo, R2 ya se levantó como **una sola historia de usuario**:
*"levantarla por separado es una locura"*.

Hoy en la base `tickets.effort_points` es por ticket, y
`cycle_delivery_compliance` hace `sum(effort_points)`. Si se cargan los 7
filtros con 2 créditos cada uno, **el medidor dice 14 donde el contrato dice
2** — siete veces lo facturable.

Pero el caso individual también tiene que seguir funcionando: los 4 ítems de
R3 son un ticket, una talla y sus créditos propios.

**Hace falta que ambos convivan.**

---

## 2. Lo que ya existe y sirve

| Pieza | Estado | Para qué sirve aquí |
|---|---|---|
| `ticket_relations` | **existe, 0 filas** | Ya admite `parent` / `child` (00004). Es el mecanismo natural |
| `project_tasks.parent_task_id` | existe, 0 usos | Subtareas *dentro* de un ticket; otro nivel |
| `tickets.effort_points` | `integer` | Donde se congela el crédito al estimar |
| `requirement_phase` | 00076 | La fase que mide el SLA |
| `ticket_phase_log` | 00077 | Los tramos por ticket |

**No hace falta inventar la agrupación: `ticket_relations` ya la modela.**
Lo que falta es decidir *qué significa* un grupo para el crédito y para el
reloj.

---

## 3. La propuesta

### 3.1 Un requerimiento es el ticket padre

El ticket que lleva la historia de usuario es el **requerimiento
facturable**. Los demás cuelgan de él como `child`.

```
PDZ-xxxx  "R1 · Capa de filtros"        <- padre: talla M, 2 créditos, fase
   ├── PDZ-aaaa  Filtro de QR            <- hijo: 0 créditos, sin fase
   ├── PDZ-bbbb  Filtrar por banco       <- hijo
   ├── PDZ-cccc  Filtro de aprobados     <- hijo
   └── … 4 más
```

**Tres reglas, y de ellas sale todo lo demás:**

1. **El crédito vive en el padre.** Un hijo tiene `effort_points = 0`.
2. **La fase vive en el padre.** Solo el padre tiene `requirement_phase`, así
   que solo él genera tramos y SLA.
3. **Un ticket sin padre es su propio requerimiento.** Los 4 de R3 siguen
   funcionando exactamente como hoy, sin cambiar nada.

La tercera regla es la que hace que esto no rompa lo existente: **un ticket
suelto es un grupo de uno.**

### 3.2 Por qué el crédito en el padre y no repartido

Las tres opciones que planteé antes, resueltas:

| Opción | Problema |
|---|---|
| Fracción (2÷7 = 0,29) | `effort_points` es `integer`. Y 7 fracciones que suman 1,99 no son 2 |
| Un solo ticket con subtareas | Se pierde el ticket individual, que el cliente ya creó y sigue |
| **Padre con el crédito, hijos en 0** | **Ninguno** — la suma cuadra exacta y cada ticket conserva su identidad |

La tercera además no necesita cambiar el tipo de `effort_points` ni tocar
`sum()`: los hijos suman 0 y el total sale correcto solo.

### 3.3 Qué cambia en el cálculo

**Casi nada, y esa es la gracia.** `cycle_delivery_compliance` hace
`sum(effort_points)` — con hijos en 0, ya da el número correcto.

Lo único que hay que ajustar es **no contar los hijos como ítems**:

```sql
-- items_total e items_done deben contar REQUERIMIENTOS, no tickets.
-- Un hijo no es un entregable: es parte de uno.
AND NOT EXISTS (
  SELECT 1 FROM ticket_relations r
   WHERE r.related_ticket_id = t.id AND r.relation_type = 'child'
)
```

Sin eso, el grupo de 7 filtros diría "1 de 7 entregado" cuando el
entregable es uno solo.

---

## 4. El SLA de fases con grupos — lo que preguntaste

Esta es la parte que no sabías cómo manejar, y creo que tiene una respuesta
limpia.

### 4.1 La fase es del requerimiento, no del ticket

**Solo el padre lleva `requirement_phase`.** Los hijos no entran al medidor:
no tienen fase, no generan tramos, no se les mide plazo.

Es coherente con el contrato: el Anexo C da plazo a *entregables*
(documentación 2d, desarrollo S:3/M:4/L:5, UAT 2d). Un filtro individual no
es un entregable; la capa de filtros sí.

### 4.2 El plazo sale de la talla del padre

Ya funciona así. `phase_target_days(tenant, org, fase, talla)` resuelve
desde `phase_sla_targets`, y la talla es la del padre:

| Grupo | Talla del padre | Plazo de desarrollo |
|---|---|---|
| 7 filtros de R1 | M | **4 días hábiles** |
| 4 de WhatsApp/QR | L | **5 días hábiles** |
| Reasignación (suelto) | S | 3 días hábiles |

No importa que sean 7 tickets: el contrato pactó 4 días para un entregable
talla M.

### 4.3 El caso de R2: una historia de usuario para varios ítems

Es exactamente este modelo. El documento funcional se levantó una vez, así
que:

- **La fase `documentacion` se mide una vez**, en el padre. Sus 2 días de
  plazo aplican al documento, no a cada ítem.
- **El ida y vuelta de 24h se registra una vez**, en el padre. Una espera por
  documento, no cuatro por lo mismo.
- Los hijos existen para que el cliente siga *su* ticket, pero no consumen
  reloj.

Lo que el equipo ya hizo en la práctica es lo que el modelo quiere.

### 4.4 Cuando un hijo se atrasa

Un hijo no tiene fase, así que no se atrasa por sí mismo. **El padre no
avanza de fase hasta que todos sus hijos estén listos**, y el reloj del padre
corre mientras tanto.

Eso es correcto contractualmente: si 6 de 7 filtros están hechos pero el
séptimo falta, el entregable **no está entregado** y el plazo sigue corriendo.

Para que el PM no vuele a ciegas, el tablero muestra el avance interno:
*"Capa de filtros · 5 de 7 listos · 2 días sobre el plazo"*.

---

## 5. Cómo se agrupa en la práctica

### 5.1 Desde la interfaz

En la pestaña de Backlog, seleccionar varios y **"Agrupar en un
requerimiento"**:

```
┌─ Agrupar 7 tickets ────────────────────────────┐
│ Título del requerimiento                       │
│ [R1 · Capa de filtros                       ]  │
│                                                │
│ Talla   ( ) S=1   (•) M=2   ( ) L=4            │
│         → 2 créditos                           │
│                                                │
│ ⓘ Los 7 tickets quedan como parte de este      │
│   requerimiento. Sus créditos pasan a 0 y el   │
│   plazo se mide sobre el requerimiento.        │
│                                                │
│ Crear un ticket nuevo como padre  (•)          │
│ Usar uno existente como padre     ( )          │
└────────────────────────────────────────────────┘
```

Dos modos porque los dos casos pasan: a veces el padre ya existe (la HU que
se levantó) y a veces hay que crearlo (los 7 filtros no tenían uno).

### 5.2 Desde el MCP

Dos tools nuevas sobre el dominio que ya existe:

- `requirements_group` — agrupa tickets bajo un padre, con su talla
- `requirements_ungroup` — deshace el grupo, devolviendo los créditos

### 5.3 Deshacer

Importa porque agrupar mal es fácil. `requirements_ungroup` borra las
relaciones y deja a los hijos sin crédito y sin fase — vuelven al backlog
como estaban. **Nunca borra tickets.**

---

## 6. Qué habría que construir

| | Qué | Riesgo |
|---|---|---|
| `00081` | Vista `requirement_items` + ajuste de `cycle_sla_breaches` y `delivery_cycle_status` para no contar hijos | bajo: las funciones ya existen, solo se añade un filtro |
| dominio | `groupRequirement`, `ungroupRequirement`, `listGroupMembers` | ninguno: tablas existentes |
| MCP | 2 tools | ninguno |
| UI interna | Selección múltiple + diálogo de agrupar; el padre muestra "5 de 7 listos" | ninguno |
| Portal | El cliente ve el requerimiento con sus ítems dentro | ninguno |

**No hace falta ninguna tabla nueva.** `ticket_relations` ya existe con los
tipos correctos y está vacía, así que no hay datos que migrar.

### Lo que NO se toca

- `effort_points` sigue siendo `integer`
- `sum(effort_points)` sigue igual: los hijos aportan 0
- El SLA de soporte, intacto
- Un ticket sin grupo funciona exactamente como hoy

---

## 7. Decisiones que necesito de ti

1. **¿El padre es un ticket nuevo o uno de los existentes?** Propongo
   permitir ambos: para R1 conviene crear uno ("Capa de filtros"), para R2 ya
   existe la HU.

2. **¿Qué tipo de ticket lleva el padre?** Si es `backlog` o
   `desarrollo_pendiente`, no consume cuota de soporte y puede llevar fase
   (el CHECK de 00076 lo exige). Los hijos pueden seguir siendo `support` o
   `warranty` sin problema, porque ya no llevan ni crédito ni fase.

3. **¿Un hijo puede estar en un ciclo distinto al del padre?** Propongo que
   no: el entregable es uno y pertenece a un ciclo. Si un filtro se pospone,
   sale del grupo y vuelve al backlog.

4. **¿El cliente ve los hijos en el portal?** Propongo que sí, plegados bajo
   el requerimiento — él creó esos tickets y quiere saber en qué van. Pero
   los días y el plazo se muestran una sola vez, en el padre.

---

## 8. Lo que esto resuelve

- Los 7 filtros valen **2 créditos**, no 14
- El plazo se mide **una vez** sobre el entregable, no siete
- La historia de usuario de R2 encaja **sin forzar nada**
- Cada ticket conserva su identidad y su seguimiento
- Un ticket suelto sigue funcionando igual que hoy
- La suma del ciclo cuadra con el contrato **sin cambiar el cálculo**
