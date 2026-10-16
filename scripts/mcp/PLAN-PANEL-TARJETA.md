# Panel de la tarjeta — plan de implementación

El tablero funciona, pero la tarjeta es ilegible y el panel que abre es
minúsculo. Hay que convertirlo en un espacio de trabajo real.

**Plan. No se ha escrito código.**

---

## 1. Lo que está mal hoy

Mirando el tablero con los 8 entregables cargados:

| Problema | Qué se ve |
|---|---|
| **No se distingue la tarjeta** | Título a 11px sin número de ticket visible. "Cuando se va a desistir un cliente que no desea continuar en el proceso, no nos permite generar el cambio de estado general desistido, si no que debem" ocupa 5 líneas |
| **El panel es un acordeón de 240px** | Se abre dentro de la tarjeta, en una columna estrecha. No cabe nada |
| **No se puede comentar** | Hay 1273 comentarios en la base y ninguno es accesible desde el tablero |
| **No hay checklist** | `ticket_tasks` existe y está vacía: nadie puede marcar "esto ya está" |
| **Los miembros no se pueden cerrar** | Se listan con ✓/○ pero no hay forma de cambiarlos desde ahí |

---

## 2. Lo que ya existe y no hay que construir

Esto cambia el tamaño del trabajo: **no hace falta ninguna tabla nueva.**

| Pieza | Estado | Para qué |
|---|---|---|
| `ticket_followups` | **1273 filas** | Comentarios. Ya soporta privados (`is_private`), menciones (`mentioned_agent_ids`) y autor (agente / contacto / IA / sistema) |
| `ticket_tasks` | **existe, 0 filas** | El checklist: título, estado, responsable, fecha, horas |
| `ticket_attachments` | **51 filas** | Adjuntos, y ya se enlazan a un comentario (`followup_id`) |
| `addFollowup()` | `lib/actions/tickets.ts:678` | Server action lista |
| `addTask()` | `lib/actions/tickets.ts:878` | Server action lista |
| `ticket_status_history` | **2145 filas** | La actividad: quién cambió qué y cuándo |
| `ticket_phase_sla()` | 00077 | Los tramos de fase con sus días |

**Todo el trabajo es de interfaz.**

---

## 3. Cómo lo resuelven otras plataformas

Busqué el patrón antes de decidir, porque esto ya está resuelto.

**Linear usa panel lateral, no modal.** Su regla es que un modal centrado se
reserva para lo destructivo; lo demás va en un panel que desliza desde la
derecha y **mantiene el contexto visible**. El tablero no desaparece.

**Jira está migrando en la misma dirección**: sus «preview panels» van a
sustituir al *detail view* clásico.

El patrón se llama **list-detail** (o master-detail): la colección a la
izquierda, el elemento seleccionado a la derecha con sitio para trabajarlo.
Es el caballo de batalla del software B2B porque evita navegar a otra página
por cada clic.

Hay una tensión conocida: a mucha gente le gusta el modal, pero **quien
revisa muchos ítems seguidos prefiere el panel**, porque no tiene que
cerrarlo para pasar al siguiente. Un PM en una reunión de refinement es
exactamente ese caso.

**Decisión: panel lateral deslizante**, con navegación ↑↓ entre tarjetas sin
cerrarlo.

---

## 4. La tarjeta, rediseñada

El problema es que hoy muestra todo con el mismo peso. Jerarquía propuesta:

```
┌─────────────────────────────────┐
│ TKT-2610-00733      M · 2cr     │  ← número e identidad, mono 10px
│ R1 · Capa de filtros            │  ← título, 2 líneas máximo
│                                 │
│ ▓▓▓▓▓▓▓░░░  0 de 7              │  ← avance del grupo, barra
│ ─────────────                   │  ← reparto de días (ancho = tiempo)
│ 💬 3   ☑ 2/5   ⏱ 2d/2d          │  ← señales: comentarios, checklist, plazo
└─────────────────────────────────┘
```

**Tres reglas:**

1. **El título se trunca a 2 líneas** con `line-clamp`. El texto completo va
   en el panel; en la tarjeta estorba.
2. **El número del ticket siempre visible.** Es cómo el equipo se refiere a
   las cosas en la reunión.
3. **Los contadores son señales, no datos.** `💬 3` dice "hay conversación
   aquí"; el contenido está a un clic.

---

## 5. El panel

Seis bloques, en el orden en que se consultan:

### 5.1 Cabecera — siempre visible al hacer scroll

```
TKT-2610-00733                              ← →  ✕
R1 · Capa de filtros
[Levantamiento ▾]  M · 2cr  ·  Cliente  ·  2 de 2 días
```

El selector de fase mueve la tarjeta sin arrastrar: en una reunión es más
rápido que el ratón. Las flechas pasan al entregable siguiente **sin cerrar**
— el motivo por el que se elige panel sobre modal.

### 5.2 El reloj

```
┌──────────────────────────────────────────┐
│ Levantamiento · a cargo del cliente      │
│ ███████████░░░░░  2 de 2 días hábiles    │
│                                          │
│ ⏸ Esperando: aprobación del documento    │
│    3 días · Camilo Mayorga               │
│    [Ya llegó]  [Recordar]                │
└──────────────────────────────────────────┘
```

Si no hay espera abierta, un botón **«Esperando algo…»**. Es el gesto que
pausa el reloj, y tiene que estar a un clic.

### 5.3 Los tickets que agrupa

Lo que hoy es una lista muerta pasa a ser accionable:

```
Tickets de este entregable            0 de 7 listos
┌──────────────────────────────────────────┐
│ ○ TKT-2610-00730  Filtro de QR           │
│   backlog                    [Cerrar] 💬 │
│ ✓ TKT-2605-00560  Filtrar por banco      │
│   closed · cerrado hace 2 días           │
└──────────────────────────────────────────┘
```

Cerrar un miembro desde aquí actualiza el contador del grupo. Y el icono de
comentario abre **ese** ticket en el panel, con una miga de pan para volver
al entregable.

### 5.4 Checklist — `ticket_tasks`

Lo que pediste. La tabla ya existe:

```
Checklist                                 2 de 5
☑ Levantar requerimiento con Camilo
☑ Documentar casos de uso
☐ Validar con el equipo de desarrollo
☐ Estimar esfuerzo
☐ Confirmar alcance con el cliente
[+ Añadir]
```

Es distinto de los miembros: **el miembro es un ticket**, la tarea del
checklist es un paso interno que no necesita uno.

### 5.5 Comentarios — `ticket_followups`

```
💬 Conversación                        3

Freddy Rincones · hace 2h
  Camilo confirmó que los filtros de banco
  son prioridad para el cierre de mes.

Emma Castillo · ayer · 🔒 interno
  Ojo: esto toca la capa de permisos.

[Escribe un comentario…]          ☐ Solo interno
```

`is_private` ya existe: un comentario interno no lo ve el cliente en su
portal. Y `mentioned_agent_ids` permite mencionar con `@`.

### 5.6 Actividad — plegada

De `ticket_phase_log` y `ticket_status_history`. Plegada por defecto: es para
auditar una cifra, no para la gestión diaria.

```
▸ Actividad (12)
```

---

## 6. Lo que hay que construir

| Paso | Qué | Riesgo |
|---|---|---|
| **A** | Rediseñar la tarjeta: jerarquía, truncado y contadores | ninguno |
| **B** | El panel lateral con cabecera y navegación ↑↓ | ninguno |
| **C** | Bloques de reloj y espera (reusa lo del tablero actual) | ninguno |
| **D** | Miembros accionables: cerrar y abrir desde el panel | bajo |
| **E** | Checklist sobre `ticket_tasks` + 2 acciones nuevas | bajo |
| **F** | Comentarios sobre `ticket_followups` con `addFollowup()` | bajo |
| **G** | Actividad plegada | ninguno |

### Lo que NO se toca

- Ninguna tabla nueva ni migración
- El SLA de soporte
- La pantalla de ticket existente (`/home/tickets/[id]`), que sigue siendo
  la vista completa

### Dos riesgos reales

**Los contadores de la tarjeta.** Mostrar `💬 3` obliga a contar comentarios
de cada entregable. Ocho tarjetas × 2 consultas = 16 idas y vueltas al abrir
el tablero. Se resuelve con una consulta agregada, como ya se hace con los
miembros (`listMembersBulk`).

**Los comentarios del cliente.** `ticket_followups` tiene `is_private`, pero
hay que comprobar que el portal lo respeta antes de animar al equipo a
escribir ahí. Si se escribe un comentario interno creyendo que el cliente no
lo ve, y resulta que sí, el daño es serio. **Va a verificarse antes de
publicar el bloque de comentarios.**

---

## 7. Lo que necesito decidir contigo

1. **¿Panel lateral o modal?** Propongo lateral por lo que investigué, pero
   si el equipo prefiere modal centrado, es el mismo trabajo.

2. **¿El checklist es por entregable o por ticket?** Propongo por entregable:
   los pasos de "R1 · Capa de filtros" son del conjunto, no de un filtro
   suelto.

3. **¿Los comentarios del panel son los mismos del ticket?** Propongo que sí
   — son `ticket_followups` del mismo ticket, así que lo escrito aquí se ve
   en `/home/tickets/[id]` y viceversa. Una sola conversación, dos ventanas.

---

## Fuentes

- [Linear usa panel lateral, nunca modal centrado, para acciones que mantienen contexto](https://cdn.jsdelivr.net/npm/@exxatdesignux/ui@0.6.59/consumer-extras/patterns/modern-saas-patterns.md)
- [Jira sustituirá el detail view por preview panels](https://community.atlassian.com/forums/Jira-articles/Preview-Panels-will-soon-replace-the-detail-view-in-Jira-s/bc-p/3252685)
- [El patrón list-detail y por qué es el caballo de batalla del B2B](https://www.saasui.design/blog/saas-list-detail-master-detail-ux-patterns)
- [Modal vs sidebar: quien revisa muchos ítems prefiere el panel](https://community.developer.atlassian.com/t/whats-happening-with-the-issue-details-view-popup-functionality/13569/2)
- [Patrón de modal de Linear](https://www.saasui.design/pattern/modal/linear)
- [Detalle de tarea en kanban: panel que desliza desde la derecha](https://docs.gitscrum.com/en/standalone/kanban-task-detail)
