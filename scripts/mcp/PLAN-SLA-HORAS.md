# Plan final — el SLA de proyectos en horas hábiles

El reloj del Anexo C mide en días hábiles enteros y eso falsea los veredictos:
una reunión al mediodía y un documento enviado esa noche cuentan como dos días.

**Decidido:** se mide **y se imputa en horas**. Jornada de **8 horas efectivas**
(8-17 menos la hora de almuerzo), lunes a viernes, festivos de Colombia fuera.

---

## 1. Lo que cambia, con los datos reales

Medido contra el calendario nuevo:

| | En días (hoy) | En horas (nuevo) |
|---|---|---|
| **R1 · documentación** | 2 días → **incumple** | **4,0 h → en plazo** ✅ |
| **R1 · aprobación** | 4 días | **32,0 h → +24h** 🔴 cliente |
| **R2 · documentación** | 4 días | **25,1 h → +17,1h** 🔴 TDX |

**Reloj TDX: 17,1 h · Reloj cliente: 24,0 h · Expuesto: 0 créditos**

El veredicto de R1 se invierte: lo que en días era incumplimiento, en horas está
holgadamente en plazo.

---

## 2. El calendario propio

Se crea **«Proyectos · Anexo C»**, separado del de soporte:

```
L-V 08:00 – 16:00   = 480 min = 8 h exactas
36 festivos de Colombia (copiados del calendario existente)
America/Bogota
```

**Por qué 8-16 y no 8-12 + 13-17:** `calendar_schedules` tiene un `UNIQUE
(calendar_id, day_of_week)` — solo admite **un tramo por día**. Partir el día
exigiría quitar esa restricción, y esa tabla la usa el SLA de soporte. Como lo
que importa es que la jornada sume 8 h, se modela seguida. Verificado: da 480
minutos exactos.

**Por qué propio y no el de Colombia 8-17:** ese lo usa el contrato de soporte
de Podenza. Tocarlo alteraría las cifras de Emma.

---

## 3. Los plazos, convertidos

| Fase | Hoy | En horas |
|---|---|---|
| Por iniciar | sin plazo | sin plazo |
| Levantamiento | sin plazo | sin plazo |
| Documentación | 1 día | **8 h** |
| Aprobación | 1 día | **8 h** |
| Accesos | 1 día | **8 h** |
| Desarrollo S / M / L | 3 / 4 / 5 días | **24 / 32 / 40 h** |
| UAT | 2 días | **16 h** |

---

## 4. Los riesgos, medidos

### 4.1 🔴 La exposición en pesos se multiplica por 8

`cycle-board.tsx:937` y `:1235` hacen `exposed_over × 790.714,29`:

```
hoy        3 días   →  $2.372.143
en horas  24        →  $18.977.143   ← ocho veces
```

Y **la base no valida esa cifra** (`credit_value_cop` es NULL porque
`billing_plans` está vacío): nadie avisaría. Es el único daño económico directo
y se arregla temprano en el orden.

### 4.2 🔴 La tabla auditable del portal pierde su unidad

`portal-phases.tsx:457, 460, 463` — tres celdas **sin sufijo**; su unidad la da
solo la cabecera `<th>Días</th>`. Si cambia el dato y no la cabecera, el cliente
lee *«Netos: 16»* junto a *«Plazo: 2d»* = **14 días de incumplimiento
inventado**. Es la tabla que el código describe como *«para quien quiera auditar
la cifra en vez de creérsela»*.

### 4.3 🔴 `numeric(5,2)` desborda

Probado: **1440 no cabe** (máximo 999,99). Afecta a `ticket_phase_log`,
`phase_waits` y `phase_sla_targets`. Fallaría al escribir, dentro del trigger,
cuando el PM cambie una fase. Desarrollo L = 40 h = 2400 min.

### 4.4 🟠 El `default: 1` de las esperas

`open_phase_wait` y la tool MCP usan `target_days = 1`. En horas significaría
**1 hora**, y toda espera nacería casi incumplida. Pasa a 8.

### 4.5 🟡 Un defecto preexistente

`card-panel.tsx:593` calcula los días de una espera **en el cliente dividiendo
por `864e5`** — días de calendario, con fines de semana. Ya hoy discrepa del
backend: una espera abierta el viernes se ve «3 días» en el panel y «1 día» en
el portal. Se elimina y se lee del backend.

---

## 5. El aislamiento de soporte

| Función | La usan |
|---|---|
| `working_days_between` | 4 del reloj de proyectos + `agent_capacity_status` |
| `business_minutes_between` | solo `ticket_paused_business_minutes` (soporte) |
| **Intersección** | **ninguna** |

**Regla: no se modifica `working_days_between`.** La capacidad del equipo sigue
en días hábiles, que es lo correcto para ella; mutarla multiplicaría las horas
disponibles por ~480 sin que ningún test lo detectara.

---

## 6. Qué se construye

### Base de datos
1. Calendario «Proyectos · Anexo C» con sus 36 festivos
2. Función `project_business_minutes(tenant, from, to)` — **nueva**, no se toca
   la existente
3. Columnas **nuevas en paralelo**: `business_minutes`, `paused_minutes`,
   `target_minutes`. No se reinterpretan las viejas
4. Ampliar la precisión de las tres `numeric(5,2)`
5. **Renombrar las salidas** de las 6 funciones (`net_days` → `net_minutes`…),
   para que un sitio sin migrar **falle en TypeScript** en vez de mentir
6. Convertir los plazos de la sección 3

### Interfaz — 42 puntos en 5 archivos
Un formateador único en `lib/format/business-time.ts` (hoy no existe ninguno
compartido; el que hay vive suelto en Settings). Por orden de riesgo: el cálculo
en COP, la tabla del portal, los números grandes, las barras y sus umbrales
(`0.14` y `0.16`, calibrados para `3d` y que se desbordan con `24h`), y las
descripciones MCP.

### No hay historial que migrar
Medido: **9 tramos, todos abiertos, ninguno con `business_days`**. Es el momento
de hacerlo.

---

## 7. Orden

```
1. calendario de proyectos + función en minutos
2. columnas nuevas y precisión
3. las 6 funciones, con salidas renombradas
4. regenerar los tipos
5. lib/format/business-time.ts
6. cycle-board: el cálculo en COP          ← el único daño económico
7. portal-phases: la tabla auditable primero
8. phase-sla-tab, card-panel (y el bug de 864e5)
9. descripciones MCP y el default de las esperas
10. cargar el historial real del ciclo 1
```

---

## 8. Sobre la redacción «día por día»

No hace falta otrosí. **Un día son 8 horas**, así que el texto del portal y el
cálculo dicen lo mismo: se mide en horas y se muestra en días cuando la cifra
pasa de una jornada.

```
  R1 · documentación    4,0 h       →  en plazo
  R1 · aprobación       4 días      →  3 días de atraso (cliente)
  R2 · documentación    3d 1,1h     →  2d 1,1h de atraso (TDX)
```

Un tramo corto se lee en horas, uno largo en días. Nadie tiene que hacer
cuentas, y la cláusula sigue siendo cierta.

### El umbral de exposición queda fuera

Cuándo un atraso «cuesta crédito» solo importa **al cerrar el ciclo**, y
`discount_cop` ya devuelve NULL porque `billing_plans` está vacío. No se decide
ahora.

## 9. Lo que NO se toca

- El SLA de soporte y su calendario
- `working_days_between` y `agent_capacity_status`
- Los correos de `testing-strike-check`
- `billing_plans`, que sigue vacío
