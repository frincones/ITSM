# Agrupación de tickets en requerimientos — plan de implementación

Permite que la reunión de refinement y planning arme el ciclo agrupando
tickets en entregables facturables, o dejándolos sueltos.

Decisiones tomadas con el equipo el 16-oct-2026. **Plan: no se ha escrito
código ni tocado la base.**

---

## 1. El modelo, en tres reglas

```
PDZ-nuevo  "R1 · Capa de filtros"        ← PADRE
           tipo: desarrollo_pendiente
           talla M · 2 créditos · fase: desarrollo
   ├── PDZ-1184  Filtro de QR             ← hijo (sigue siendo support)
   ├── PDZ-1201  Filtrar por banco        ← hijo (sigue siendo warranty)
   └── …
```

1. **El crédito y la fase viven en el padre.** Un hijo va con
   `effort_points = 0` y `requirement_phase = NULL`.
2. **El padre es un ticket NUEVO de tipo `desarrollo_pendiente`**, creado en
   el momento de agrupar. Ya no es backlog: agrupar es comprometerse.
3. **Un ticket sin padre es su propio entregable.** Lo individual sigue
   funcionando exactamente como hoy, sin tocar nada.

La tercera regla es la que hace que esto no sea una migración: agrupar es
opcional.

---

## 2. Las dos decisiones del equipo, y lo que implican

### 2.1 El hijo conserva su tipo

Un ticket que entra a un grupo **no se reclasifica**: si era `support`,
sigue siendo `support`; si era `warranty`, sigue igual.

**Ventaja:** la reunión de planning no se convierte en una sesión de
reclasificación, y no se toca retroactivamente la cuota de un ciclo de
soporte ya facturado.

**⚠ Consecuencia que hay que conocer:** `support`, `incident` y `request`
**consumen cuota de soporte** (`ticket_type_consumes_quota` lo confirma).
Un hijo de esos tipos seguirá contando en la cuota de 30 tickets/mes,
*además* de que su trabajo cuente en los créditos de entrega del padre.

Medido hoy en Podenza:

| Tipo | Abiertos | ¿Consume cuota? |
|---|---|---|
| `support` | 32 (16 en backlog, 7 testing, 7 detenidos) | **sí** |
| `warranty` | 26 | no |
| `backlog` | 11 | no |

Los 16 `support` en estado backlog son trabajo de desarrollo mal tipado.
Si se agrupan tal cual, ese trabajo se cuenta en los dos contadores.

**No es un defecto del modelo: es el precio de no reclasificar.** Queda
dicho para que sea una decisión visible y no una sorpresa en una factura.

Mitigación propuesta, sin obligar a nada: al agrupar, si hay hijos que
consumen cuota, la interfaz lo avisa con un enlace para reclasificar —
pero deja seguir.

```
⚠ 3 de los 5 tickets son de tipo support y seguirán consumiendo
  cuota de soporte además de los créditos de este entregable.
  [Reclasificar a warranty]   [Agrupar de todas formas]
```

### 2.2 El padre nace como `desarrollo_pendiente`

Se crea al agrupar, con el nombre del entregable. No consume cuota, admite
fase (el CHECK de 00076 solo permite `backlog` y `desarrollo_pendiente`), y
hereda la organización y el proyecto de sus hijos.

---

## 3. Qué hay que construir

### 3.1 Migración `00081`

**No crea tablas.** `ticket_relations` existe desde 00004 con
`parent`/`child` y está vacía.

**a) Función `group_tickets_into_requirement()`**

Crea el padre y engancha los hijos, en una transacción:

```
entrada:  títulos de los hijos, nombre del entregable, talla, ciclo, proyecto
salida:   el ticket padre creado

hace:     1. crea el padre (desarrollo_pendiente, talla, effort_points,
             delivery_cycle_id, project_id, organization_id del grupo)
          2. inserta las relaciones child
          3. pone effort_points = 0 y requirement_phase = NULL en los hijos
          4. mueve los hijos al mismo delivery_cycle_id que el padre
```

Validaciones, y cada una por un motivo:

- Todos los hijos de **la misma organización** — si no, un entregable
  cruzaría clientes y el crédito no sabría a quién facturarse
- Ningún hijo ya tiene padre — evita grupos anidados
- El padre no puede ser hijo de nadie
- Mínimo un hijo

**b) Función `ungroup_requirement()`**

Deshace: borra las relaciones y deja a los hijos sin crédito ni fase.
**Nunca borra tickets.** El padre queda vacío y se puede cancelar aparte.

**c) Ajuste de dos funciones existentes**

`delivery_cycle_status` y `cycle_sla_breaches` deben **contar entregables,
no tickets**:

```sql
AND NOT EXISTS (
  SELECT 1 FROM ticket_relations r
   WHERE r.related_ticket_id = t.id AND r.relation_type = 'child'
)
```

Sin esto, un grupo de 5 diría "1 de 5 entregado" cuando el entregable es
uno. **La suma de créditos ya es correcta sin tocarla**, porque los hijos
aportan 0.

**d) Vista `requirement_members`**

Para que la interfaz pida el grupo de un tirón en vez de N consultas.

### 3.2 Dominio y acciones

```
groupTickets(ctx, { child_ids, title, size, cycle_id, project_id })
ungroupRequirement(ctx, parent_id)
listGroupMembers(ctx, parent_id)
getGroupProgress(ctx, parent_id)   → "4 de 5 listos"
```

Con sus server actions, siguiendo el patrón del módulo.

### 3.3 MCP

Dos tools: `requirements_group` y `requirements_ungroup`. La descripción de
la primera debe advertir del efecto sobre la cuota, porque un agente no
puede deducirlo.

### 3.4 Interfaz

**Pestaña Backlog** — casillas de selección y una barra al seleccionar:

```
5 seleccionados    [Agrupar]  [Al ciclo por separado]
```

**Diálogo de agrupar** — nombre, talla (con los créditos de la escala de
esa organización) y ciclo. Más el aviso de cuota si aplica.

**Pestaña Planning** — un grupo se muestra plegado con sus hijos dentro y
el progreso interno:

```
[5 tickets]  R1 · Capa de filtros        M · 2 cr    4 de 5 listos
  └ 1184  Filtro de QR                   ✓
  └ 1201  Filtrar por banco              en curso
```

**Pestaña SLA por fase** — el padre lleva el reloj; los hijos aparecen como
detalle. El progreso "4 de 5" explica por qué el reloj sigue corriendo.

**Portal del cliente** — el requerimiento con sus tickets plegados dentro.
El cliente ve avanzar el suyo, pero los días y el plazo se muestran una sola
vez, en el padre.

---

## 4. El SLA con grupos

**El plazo es del entregable.** Es lo que pacta el Anexo C: los días se dan
por entregable (documentación 2d, desarrollo S:3/M:4/L:5, UAT 2d). Un filtro
suelto no es un entregable; la capa de filtros sí.

| Grupo | Talla del padre | Plazo de desarrollo |
|---|---|---|
| 5 filtros | M | 4 días hábiles |
| 4 de WhatsApp/QR | L | 5 días hábiles |

No hay que cambiar nada: `phase_target_days` ya resuelve por talla, y la
talla es la del padre.

**Un hijo no tiene fase, así que no se atrasa por sí mismo.** El padre no
avanza hasta que todos estén listos, y su reloj corre mientras tanto.
Correcto: con 4 de 5 filtros hechos, la capa no está entregada.

**El caso de R2 encaja sin forzar nada.** Como el documento funcional se
levantó una vez para los cuatro ítems, la fase `documentacion` se mide una
vez y el ida y vuelta de 24h se registra una vez — no cuatro esperas por el
mismo documento.

---

## 5. Lo que NO se toca

| | Por qué |
|---|---|
| El SLA de soporte (00047-00063) | Otro mecanismo sobre otro trabajo |
| `ticket_type_consumes_quota` | La cuota por tipo no cambia |
| `effort_points` sigue `integer` | Los hijos van en 0, no en fracciones |
| `sum(effort_points)` | Ya da el número correcto |
| Un ticket sin grupo | Funciona exactamente como hoy |

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Doble conteo de un hijo `support` | Aviso en el diálogo con opción de reclasificar. Es decisión del equipo, documentada arriba |
| Un grupo cruza organizaciones | La función lo rechaza |
| Grupos anidados | Un hijo no puede tener padre; un padre no puede ser hijo |
| Agrupar por error | `ungroup_requirement` lo deshace sin borrar nada |
| Un hijo en otro ciclo que el padre | Al agrupar, los hijos se mueven al ciclo del padre |
| Las cifras de soporte se mueven | `baseline-soporte.mjs --esperado` antes y después |

---

## 7. Orden de trabajo

| Paso | Qué | Riesgo |
|---|---|---|
| **A** `00081` | Las 2 funciones + ajuste de las 2 existentes + vista | bajo: tablas existentes, 0 filas |
| **B** | Dominio y acciones | ninguno |
| **C** | MCP (2 tools) | ninguno |
| **D** | Backlog: selección y diálogo | ninguno |
| **E** | Planning y SLA: mostrar grupos | ninguno |
| **F** | Portal: el cliente ve los hijos | ninguno |

Con el ensayo en `BEGIN … ROLLBACK` de siempre, y las guardias
(`baseline-soporte`, `verify-00067`, `schema-audit`, RLS) en cada paso.

---

## 8. Lo que falta decidir

1. **¿La interfaz avisa del doble conteo de cuota, o se queda callada?**
   Propongo avisar: es un peso en la factura y el PM debería verlo.
2. **Cuando se deshace un grupo, ¿qué pasa con el padre?** Propongo dejarlo
   vacío y que el PM lo cancele si quiere — borrarlo automáticamente
   perdería su histórico de fases.
3. **¿Un grupo puede cambiar de talla después de creado?** Propongo que sí
   mientras el ciclo esté abierto, re-estimando como cualquier ítem.

---

## 9. Mockup

https://claude.ai/artifact/DUrRUmUZ1tENKTm5F5rvcd

Los tres momentos de la reunión, la comparación entre agrupar y no agrupar
(10 créditos contra 2), y cómo corre el reloj sobre el grupo.
