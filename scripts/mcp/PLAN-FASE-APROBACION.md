# Plan final — la fase «Aprobación» y el dueño del levantamiento

Hoy el tablero mide en un solo tramo tres cosas con dueños distintos: agendar
la reunión, redactar el documento y que el cliente lo apruebe. Como la
aprobación es donde más se atasca, no se puede demostrar de quién fue la
demora.

Versión final tras auditar front y back con dos agentes y medir todo contra
producción.

---

## 1. El reparto

| Fase | Dueño | Plazo | Qué mide |
|---|---|---|---|
| Por iniciar | cliente | sin plazo | aún no arranca |
| **Levantamiento** | **TDX** ← corregido | **sin plazo** ← se le quita | agendar la reunión |
| **Documentación** | TDX | **1 día** ← baja de 2 | redactar el documento |
| **Aprobación** ← nueva | **cliente** | **1 día** | que el cliente apruebe |
| Accesos | cliente | 1 día | |
| Desarrollo | TDX | S:3 M:4 L:5 | genera crédito |
| UAT | cliente | 2 días | |

Los 2 días del contrato, repartidos 1 + 1.

### El defecto de fondo

`levantamiento` tiene `owner = 'cliente'` (`00076:407`), pero la reunión la
convoca TDX. El plan original ya lo decía: *«Levantamiento y documento →
responsable TDX»* (`PLAN-PROYECTOS-FINAL.md:165`). **Los días se le están
imputando al cliente siendo de TDX** — un error a favor de TDX, y por eso hay
que corregirlo: un descuento sobre días mal atribuidos no se sostiene.

---

## 2. Medido contra producción

```
                     tdx   cliente
antes                 0      12
solo el catálogo      0      12     ← no se mueve
+ los 4 tramos        7       5     ← 7 días cambian de dueño
```

El trigger **congela** dueño y plazo al abrir el tramo, así que cambiar el
catálogo no toca lo ya abierto. Es correcto —impide que una regla nueva
reescriba el pasado— pero obliga a corregir los 4 tramos vivos a mano.

Ensayo completo ejecutado: créditos, ítems, `exposed_credits`, `discount_cop`
y `breached_items` **no se mueven**.

---

## 3. Lo que las auditorías encontraron

### 3.1 Hay CINCO listas de fases duplicadas

Ninguna importa de las otras. No existe una fuente única de verdad:

| # | Dónde | Qué |
|---|---|---|
| 1 | `lib/domain/delivery.domain.ts:878` | `REQUIREMENT_PHASES` |
| 2 | `_components/cycle-board.tsx:78` | `CARRILES` |
| 3 | `_components/phase-sla-tab.tsx:60,74,87` | `FASES` + 2 `Record` |
| 4 | `_components/card-panel.tsx:54` | `FASES` (sin `propuesto`) |
| 5 | `portal/.../portal-phases.tsx:92,105` | `FASE_CORTA` + `LINEA` |

Más `packages/supabase/src/database.types.ts`, con el enum **inlineado en 19
sitios**.

### 3.2 Tres degradaciones mudas, ninguna lanza error

| | Qué pasa | Dónde |
|---|---|---|
| **1** | Un ticket en `aprobacion` **desaparece del tablero**: `repartir()` lo manda a `__sin`, que no se renderiza, y tampoco sale en el aviso de «sin fase» porque sí tiene fase | `cycle-board.tsx:266` |
| **2** | **Al cliente le desaparece la barra de avance** en su portal: `LINEA.indexOf` da −1 y el render se omite entero | `portal-phases.tsx:293,327` |
| **3** | El responsable se muestra **al revés**: la pantalla diría «Cliente» mientras la base dice `tdx`, justo en la vista que sustenta los descuentos | `phase-sla-tab.tsx:89`, `cycle-board.tsx:83` |

### 3.3 Dos defectos que YA existen hoy

- **El tablero ya está comprimido.** `min-w-[1180px]` (`cycle-board.tsx:813`)
  con 8 columnas que necesitan `230 + 8×135 = 1310px`. Faltan 130px **ahora**;
  con 9 faltarían 265. Se corrige derivándolo de `CARRILES.length`.
- **`card-panel.tsx` no tiene `propuesto`** en su `FASES`, así que los 5
  tickets que moví hoy a «Por iniciar» muestran **«Sin fase»** en el panel — y
  cambiar algo desde ahí lo sobrescribiría.

### 3.4 Los tres `as never` tapan el error

`cycle-board.tsx:429` y `:457`, `card-panel.tsx:193`. Castean la fase, así que
**si falta en `REQUIREMENT_PHASES` compila igual** y el fallo solo aparece en
runtime. Hoy la única barrera real es el enum de PostgreSQL. Se quitan en este
cambio: sin ellos el compilador habría señalado solo varios de estos sitios.

### 3.5 Lo que es seguro, verificado

- **`portal-delivery.service.ts` no enumera fases**: lee `delivery_phases` de
  la base, así que hereda la fase nueva con su nombre y dueño
- **El `z.enum` de MCP deriva de `REQUIREMENT_PHASES`** (`mcp/tools/delivery.ts:513`):
  se arregla solo al tocar el dominio
- **Ninguna función SQL ni TS compara fases por orden del enum**, así que
  insertar en medio no altera ninguna lógica
- **`lib/schemas/` y `lib/ai/` no tienen fases**
- `apps/web/lib/database.types.ts` está **obsoleto** (0 referencias); el activo
  es `packages/supabase/src/database.types.ts` (6). Cuidado al regenerar

---

## 4. Orden de ejecución

El orden importa: el paso 2 hace que el compilador encuentre los demás.

```
1. migración 00082  ALTER TYPE ... ADD VALUE 'aprobacion' BEFORE 'accesos'
2. migración 00083  delivery_phases, sort_order, owner de levantamiento, plazos
3. REQUIREMENT_PHASES  ← desbloquea el z.enum de MCP
4. regenerar database.types.ts (al archivo de packages/supabase)
5. quitar los tres `as never`  ← ahora el compilador señala lo que falta
6. cycle-board: carril, owner, «sin plazo», min-w derivado
7. phase-sla-tab: FASES + los dos Record (el build falla si falta una clave)
8. card-panel: FASES, y de paso añadir `propuesto`
9. portal-phases: FASE_CORTA y LINEA
10. fix(datos): owner y plazo de los 4 tramos abiertos
```

El 10 va al final y solo: es el único que mueve una cifra del contrato.

---

## 5. Verificación

### Guardas

Las cuatro de siempre más la línea base.

### Dos cifras que DEBEN cambiar

Si no cambian, el trabajo no se aplicó:

- `tdx_delay_days`: 0 → **7**
- `client_delay_days`: 12 → **5**

### Las que NO pueden moverse

`committed_credits`, `pending_credits`, `items_total`, `exposed_credits`,
`discount_cop`, `breached_items`, `third_party_days`.

### Manual

- Un ticket en `aprobacion` **se ve** en el tablero, no en «sin fase»
- El portal del cliente **sigue dibujando la barra** de avance
- Tablero y pestaña SLA dicen **lo mismo** sobre el dueño del levantamiento
- Los 5 de «Por iniciar» ya **no dicen «Sin fase»** en el panel
- El arrastre funciona con 9 columnas (los 6 invariantes)

---

## 6. El riesgo que se acepta

`ALTER TYPE ADD VALUE` **no se revierte**. Quitar un valor exige recrear el
tipo y reescribir las 5 columnas que dependen de él (`tickets`,
`ticket_phase_log`, `phase_waits`, `delivery_phases`, `phase_sla_targets`).

Freddy lo aceptó explícitamente. Mitigación: `IF NOT EXISTS` para que la
migración sea idempotente, y respaldo de las 5 tablas antes de aplicar.

**Nota:** el ensayo de hoy ya dejó `aprobacion` en el enum de producción —
`ADD VALUE` no se revierte ni dentro de una transacción. Es inocuo (0 tickets
lo usan, el catálogo no lo conoce) y la migración formal lo asume.

---

## 7. Fuera de alcance

- Unificar las cinco listas en una sola fuente de verdad. Es la causa de que
  este cambio toque siete archivos, pero refactorizarlo ahora mezclaría dos
  trabajos.
- `billing_plans`, que sigue vacío.
- Los 13 miembros sin fase.
