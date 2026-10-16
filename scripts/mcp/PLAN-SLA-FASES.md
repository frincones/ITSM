# SLA por fases — plan de implementación

Basado en el Anexo C del contrato TDX–Podenza y en las decisiones tomadas el
16-oct-2026. Todo lo que sigue está medido contra producción, en solo lectura.

---

## 1. Qué es el "mapeo estado → fase", y por qué importa

Preguntaste qué era. Es la pieza que decide si esto funciona, así que la
explico con los datos reales antes de nada.

Un ticket tiene hoy **13 estados** (`new`, `in_progress`, `testing`,
`detenido`…). El contrato habla de **5 fases**. No es la misma lista, y nadie
le ha dicho al sistema cómo se corresponden.

El problema concreto, medido en los tickets de Podenza:

```
detenido      13 tickets    de 22 pausas, 21 SIN motivo registrado
testing       22 tickets
pending        1 ticket
```

**21 de 22 pausas no dicen por qué el ticket está parado.** Así que hoy es
imposible responder "¿este atraso es de TDX o de Podenza?" — que es
exactamente el dolor que describes.

Y los tiempos reales lo confirman:

| Transición | Veces | Promedio |
|---|---|---|
| `in_progress → testing` | 49 | **6.4 días** |
| `pending → detenido` | 7 | **28.9 días** |
| `testing → closed` | 73 | 1.7 días |

El SLA de Fase 3 (TDX) es de 3 a 5 días según talla. La media real de
`in_progress → testing` es 6.4. Pero **sin saber cuánto de eso fue espera de
Podenza, ese número no sirve para nada** — ni para cobrar, ni para defenderse.

El mapeo es decirle al sistema: "cuando un ticket entra en `in_progress`,
empieza la Fase 3; cuando pasa a `detenido` con motivo `espera_documentacion`,
el reloj de TDX se pausa y empieza a correr el de Podenza".

**Propongo este mapeo** y lo validas con Emma:

| Fase | Entra cuando el ticket pasa a | Sale cuando pasa a |
|---|---|---|
| 1 · Documentación funcional | `new`, `backlog` → `assigned` | `assigned` con doc aprobada |
| 2 · Fundacional / accesos | `detenido` con motivo `espera_accesos` | se reanuda |
| 3 · **Desarrollo (TDX)** | `in_progress` | `testing` |
| 4 · UAT (Podenza) | `testing` | `resolved` o `in_progress` (devolución) |
| 5 · Producción | `resolved` | `closed` |

Y las pausas que detienen el reloj de TDX:

- `espera_documentacion` → culpa de Podenza
- `espera_accesos` → Podenza o tercero
- `espera_tercero` → tercero (banco, proveedor)
- `espera_cliente_validacion` → Podenza (**ya existe y se usa**)
- `freeze_calendario` → nadie

---

## 2. Decisiones tomadas

| # | Decisión | Consecuencia |
|---|---|---|
| 1 | **Tallas del contrato**: S=1, M=2, L=4, sin XL | Solo para Podenza; la escala pasa a ser por organización |
| 2 | **Podenza = Enterprise** los primeros 4 meses, luego Growth | El plan se versiona por vigencia, no se sobrescribe |
| 3 | **El portal muestra los atrasos de Podenza** | Es la mitad de la historia y evita discusiones |
| 4 | **El PM registra cuándo se pidió y cuándo llegó** la respuesta | Esos días se descuentan del reloj de TDX |

### Un hallazgo sobre la decisión 1

La escala de esfuerzo hoy es **única por tenant** (`UNIQUE (tenant_id, size)`),
así que Podenza y Prosuministros no pueden tener tallas distintas. Como Podenza
cambiará de Enterprise a Growth, **la escala tiene que ser por organización y
versionada por fecha**. Eso es un cambio en la tabla de 00067.

Lo bueno: hay **0 tickets estimados**, así que cambiarla no altera ningún dato.
Es el momento más barato para hacerlo.

---

## 3. Lo que ya existe y se reutiliza

| Pieza del contrato | Ya construido | Dónde |
|---|---|---|
| Entrada/salida de cada fase | `ticket_status_history` — 2092 filas, por trigger | 00045 |
| **Pausar el reloj** | `pause_reason` + `pauses_sla` — **ya en uso**, 8 transiciones | 00045 |
| Días hábiles sin festivos | `working_days_between()` | 00072 |
| Descontar tiempo en pausa | `ticket_paused_business_minutes()` | 00053 |
| 36 festivos cargados | `calendar_holidays` | 00006 |
| Límite de devoluciones | `testing_strikes` | 00032 |
| Talla del ítem | `effort_size` | 00067 |

**El mecanismo de pausa es lo más valioso.** La regla del contrato "los atrasos
de Podenza extienden el plazo de TDX día por día" es literalmente
`pauses_sla = true`. Ya funciona; falta conectarlo a las fases y poblar el
motivo, que hoy va vacío en 21 de 22 casos.

---

## 4. Lo que falta construir

### 4.1 Catálogo (migración 00075)

```
delivery_phases          las 5 fases: orden, nombre, responsable, ¿genera descuento?
phase_sla_targets        plazo por fase y, en la 3, por talla — versionado
billing_plans            Enterprise / Growth: créditos, valor mensual, vigencia
```

Todo versionado por fecha, como `effort_conversion`: cuando Podenza pase de
Enterprise a Growth, lo ya medido no se recalcula.

### 4.2 Escala por organización (migración 00076)

Cambia `effort_conversion` de `(tenant_id, size)` a
`(tenant_id, organization_id, size)`, con `organization_id` nullable para la
escala por defecto del tenant.

Siembra la del contrato para Podenza: **S=1, M=2, L=4**.

⚠️ Esta migración toca una tabla de 00067. Como no hay tickets estimados, el
riesgo es nulo hoy y crece cada día que pase.

### 4.3 Registro de fases (migración 00077)

```
ticket_phase_log     ticket, fase, entró, salió, responsable, días hábiles netos
```

Lo escribe un trigger sobre los cambios de estado, con el patrón de
`ticket_type_history`: recoge los cambios vengan de la UI, del MCP o de SQL.

**Incluye el backfill de las 2092 transiciones del histórico.** Eso da una línea
base real de cumplimiento antes de empezar a medir hacia adelante — podrás
decirle a Podenza "estos son los tiempos de los últimos seis meses" con datos.

### 4.4 Gestión de esperas (migración 00078)

Lo que pediste: que el PM registre cuándo pidió algo y cuándo llegó.

```
phase_waits    ticket, fase, qué se pidió, a quién, cuándo se pidió,
               cuándo llegó, días hábiles que costó
```

Mientras `received_at` sea NULL, el reloj de TDX está pausado y el de Podenza
corriendo. Al registrar la llegada, se cierra la espera y se reanuda.

### 4.5 El cálculo (migración 00079)

```
ticket_phase_sla(ticket_id)       días consumidos vs objetivo, por fase
cycle_sla_breaches(cycle_id)      qué rompió plazo y de quién es
cycle_delivery_compliance(cycle)  el % del ciclo y el descuento aplicable
```

La tercera implementa el umbral del 50% y la fórmula:
`(valor mensual ÷ créditos del plan) × créditos del ítem`, con el tope de que
el descuento nunca excede el valor del ciclo.

### 4.6 Las pantallas

**Interno** — pestaña "SLA" en `/home/delivery`:
- Ítems que rompen plazo, agrupados **por responsable**
- Esperas abiertas con sus días acumulados, y un botón "ya llegó"
- Semáforo del ciclo contra el umbral del 50%

**Portal del cliente** — en `/portal/<token>/proyecto`:
- El avance por fase de cada ítem
- **Qué está esperando de ellos**, con los días que lleva esperando

Esto último es lo que pediste: que quede claro cuándo el atraso es suyo.

---

## 5. Garantía de no impacto

### Lo que NO se toca

| Superficie | Por qué no se afecta |
|---|---|
| `support_cycle_compliance()` | Mide el SLA de *respuesta* de soporte, está en reportes entregados. El SLA de *fases* es otro mecanismo |
| `ticket_type_consumes_quota()` | La facturación por tipo no cambia |
| Estados de ticket | **Ningún enum nuevo**: se mapean los 13 existentes |
| Triggers de SLA de 00053 | Intactos |
| Las 714 filas de tickets | Solo se añaden columnas nullable |

### Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| El backfill de 2092 filas interpreta mal una transición | Se ensaya en transacción revertida y se compara con una muestra manual |
| La escala por organización rompe lo existente | 0 tickets estimados hoy; la migración se ensaya completa |
| Un trigger nuevo ralentiza los cambios de estado | Solo escribe en tabla propia, con `WHEN` para no dispararse de más |
| Los números del cliente no cuadran con los internos | Portal y equipo usan **la misma función**, no dos cálculos |

### Verificación de cada paso

```bash
node scripts/mcp/verify-00067.mjs   # facturación: 11 valores idénticos
node scripts/mcp/verify-rls.mjs --esperado   # aislamiento entre clientes
node scripts/mcp/schema-audit.mjs   # columnas inventadas
```

Más el ensayo en transacción revertida de cada migración antes de aplicarla —
el método que ya encontró cuatro defectos reales en esta sesión.

---

## 6. Orden de trabajo

| Paso | Qué | Riesgo | Reversible |
|---|---|---|---|
| **A** `00075` | Catálogo de fases, SLA y planes | ninguno: tablas nuevas vacías | sí |
| **B** `00076` | Escala por organización + tallas del contrato | bajo: 0 estimados | sí |
| **C** `00077` | Registro de fases + trigger + backfill | bajo: solo escribe en tabla nueva | sí |
| **D** `00078` | Gestión de esperas | ninguno | sí |
| **E** `00079` | Funciones de cálculo | ninguno: solo leen | sí |
| **F** | Pantalla interna de SLA | ninguno | sí |
| **G** | Vista del cliente con los atrasos de ambas partes | ninguno | sí |

Ningún paso toca datos existentes. Los pasos A–E son migraciones que solo
añaden; F y G son interfaz.

**El paso C es el que más valor da pronto**: con el backfill tendrás los
tiempos reales de los últimos meses sin esperar a que el proceso nuevo genere
datos.

---

## 7. Lo que necesito de ti antes de empezar

1. **El mapeo de la sección 1**: ¿lo validas tal cual, o lo revisas con Emma?
   Es la única decisión que no puedo tomar con datos — depende de cómo trabaja
   el equipo.

2. **Los motivos de espera**: propuse cinco (`espera_documentacion`,
   `espera_accesos`, `espera_tercero`, `espera_cliente_validacion`,
   `freeze_calendario`). ¿Falta alguno de los que viven hoy en la práctica?

3. **El cambio Enterprise → Growth de Podenza**: ¿sabes la fecha aproximada?
   La guardo como vigencia para que el cálculo use el plan correcto en cada
   ciclo sin tener que acordarse de cambiarlo.
