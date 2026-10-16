# Cronograma Podenza 5 Meses — contexto extraído

Extracción completa de `Contexto/Cronograma_Podenza_5Meses (1).xlsx`,
leída el 16-oct-2026. **Documento de contexto: no se ha insertado nada.**

---

## 0. Advertencia sobre la lectura del Excel

La hoja "Mes 1 · Detalle" usa **17 rangos de celdas combinadas**
(`C7:C13`, `D7:D13`, `C15:C18`, `C19:C20`, `C28:C32`…). Una lectura ingenua
del XML devuelve la talla y los créditos solo en la primera fila de cada
grupo y deja vacías las demás, lo que hace parecer que faltan datos.

Peor: en las filas donde la talla estaba combinada aparecían números sueltos
(57, 64, 100) en la columna de Clasificación. **No son tallas ni ids de
ticket**: son valores desplazados de otra celda. Comprobado contra
`custom_fields.legacy_id` de los tickets reales — los títulos no coinciden,
así que no son referencias cruzadas.

Lo que sí es fiable: **la columna de Créditos**, que se propaga por las
celdas combinadas. De ahí se deduce la talla con la escala del Anexo C que
ya está sembrada (S=1, M=2, L=4).

---

## 1. Las cuatro hojas

| Hoja | Contenido |
|---|---|
| **Roadmap 5 Meses** | 5 bloques, julio–noviembre 2026, con el aviso de que no todo sale a producción dentro del mes |
| **Mes 1 · Detalle** | 25 ítems con release (R1–R4), talla, créditos, módulo, prioridad, semana de salida y notas |
| **Supuestos y Proceso** | Los cuellos de botella: QA, ventanas de despliegue, gates bancarios |
| **Meses 2-5** | El backlog de los bloques 2 a 5, ~28 ítems |

---

## 2. Mes 1 — la matriz completa

**Lo que está en el ciclo actual son R1, R2 y R3.** R4, "Mes 2" y "Track"
son backlog que se irá agrupando en ciclos futuros.

### R1 · Filtros + quick wins (Dev S1 → Deploy S2) — 7 ítems, 16 créditos

| Ítem | Talla | Cr | Módulo | Prio | Salida | Nota |
|---|---|---|---|---|---|---|
| Filtrar por banco en parrilla de Clientes | M | 2 | — | Bug | Mes 1 · S2 | Desbloqueo operativo (hoy no filtra por banco) |
| Filtro de aprobados (Gestor de Aprobaciones) | M | 2 | — | P4 | Mes 1 · S2 | HU 7.1 |
| Ver por cuál banco vino el cambio no-viable / negado | M | 2 | — | Bug | Mes 1 · S2 | — |
| Filtro múltiple estados + establecimientos | M | 2 | — | — | Mes 1 · S2 | Comparte capa de filtros |
| Filtro por Dinateam | M | 2 | — | — | Mes 1 · S2 | Comparte capa de filtros |
| Alcance de filtro de ejecutivo (establecimientos) | M | 2 | — | — | Mes 1 · S2 | Comparte capa de filtros |
| Link de WhatsApp demasiado largo | L | 4 | WhatsApp | P3 | Mes 1 · S2 | Quick win |

### R2 · WhatsApp / QR / Leads — 5 ítems, 15 créditos

| Ítem | Talla | Cr | Módulo | Prio | Salida | Nota |
|---|---|---|---|---|---|---|
| Alimentar formulario del lead desde WhatsApp | L | 4 | — | P2 | Mes 1 · S3 | HU (continuación de formulario QR) |
| Texto inicial QR con nombre de asesor/marca + varios QR | L | 4 | — | P5 | Mes 1 · S3 | — |
| Insertar contacto de WhatsApp a Leads (track QR) | L | 4 | — | P6 | Mes 1 · S3 | — |
| Reasignación automática por inactivación de usuario | S | 1 | WhatsApp | P1 | Mes 1 · S3 | HU 19.1 · lleva migración → soak en UAT |
| Editar tipo de Producto de Interés (Leads/Clientes) | M | 2 | Solicitudes | Bug | Mes 1 · S3 | Permiso para aux/gestor/analista |

### R3 · Solicitudes — 4 ítems, 8 créditos

| Ítem | Talla | Cr | Módulo | Prio | Salida | Nota |
|---|---|---|---|---|---|---|
| Desistimiento general + retomar TODOS los bancos | M | 2 | Solicitudes | P3 | Mes 2 · S1 | ⚠ RIESGO: estados/triggers (rel. TDX-34) → QA fuerte |
| Duplicar una solicitud (sin duplicar el lead) | M | 2 | Solicitudes | P3 | Mes 2 · S1 | — |
| Modal de visualización para rol Seguros | M | 2 | Solicitudes | P2 | Mes 2 · S1 | HU · bajo riesgo |
| Asociar un codeudor a una solicitud existente | M | 2 | Solicitudes | — | Mes 2 · S1 | Codeudor pasa a lead |

**Total del ciclo actual (R1+R2+R3): 16 ítems, 17 créditos.**

### Cómo se cuentan los créditos — importa

El crédito de una celda combinada es **del grupo entero**, no de cada fila.
Los 7 filtros de R1 comparten capa y valen **2 créditos en total**, no 2
cada uno. Verificado contra la barra de estado del Excel: `Count: 8, Sum: 17`.

| Grupo | Talla | Cr | Ítems | Release |
|---|---|---|---|---|
| `D7:D13` | M | **2** | 7 filtros | R1 |
| `D15:D18` | L | **4** | 4 de WhatsApp/QR | R1+R2 |
| `D19:D20` | M | **2** | 2 de WhatsApp | R2 |
| `D21` | S | 1 | 1 | R2 |
| `D23`–`D26` | M | 2 c/u | 4 de Solicitudes | R3 |

**17 créditos**, contra un cupo Enterprise de 14/mes. Encaja con que R3 salga
en "Mes 2 · S1": R1+R2 son 9 créditos dentro del mes, y R3 (8) se desborda al
siguiente.

⚠ **Un grupo de 7 ítems con 1 solo crédito no encaja con el modelo actual**,
donde cada ticket lleva sus propios `effort_points`. Si se cargan como 7
tickets de 2 créditos, el medidor diría 14 donde el contrato dice 2. Ver la
sección 5.3.

### R4 · Backlog del mes siguiente — 5 ítems, 10 créditos

| Ítem | Talla | Cr | Prio | Salida |
|---|---|---|---|---|
| Crear Leads como Persona Jurídica | M | 2 | Bug | Mes 2 · S1 |
| Trazabilidad de qué aux. comercial envió el lead | M | 2 | — | Mes 2 · S2 |
| Leads creados por un gestor no entran a FIFO | M | 2 | — | Mes 2 · S2 |
| Validación: matrícula como documento mandatorio | M | 2 | — | Mes 2 · S2 |
| Envío de peritaje para bancos específicos | M | 2 | — | Mes 2 · S2 |

### Fuera de release

| Ítem | Talla | Cr | Release | Salida | Nota |
|---|---|---|---|---|---|
| Delegación de funciones entre usuarios de distinto rol | L | 4 | Mes 2 | Mes 2 · S3 | ⚠ complejo (permisos) |
| Sufi / Bancolombia — finalizar y certificar | M | 2 | Track | **Espera banco** | ~90–95% listo (rama `feature/sufi-integration`, E2E 20/20 sandbox) |
| Vehigrupo — 2 endpoints | M | 2 | Track | **Espera banco** | Desarrollo mínimo |
| Santander — consulta de aprobación | L | 4 | Track | **Espera banco** | Greenfield ligero |

---

## 3. Lo que dice la hoja de Supuestos

Es la parte que más afecta al diseño, porque describe **por qué el trabajo
se detiene**, que es justo lo que el módulo de fases mide:

- **QA y UAT son seriales**: cada release necesita QA interno más validación
  del cliente. Toma días por release, independientemente de la velocidad de
  codificación.
- **Ventanas de despliegue**: fin de mes es temporada alta del cliente → **no
  se despliega la última semana**. Quedan ~3 semanas útiles por mes.
- **Cadencia**: ~1 release semanal, nunca dos días seguidos.
- **Gates bancarios**: Sufi, Vehigrupo y Santander requieren certificación del
  banco. *"El código puede estar 100% listo y aún así esperar al banco."*
- **Migration QA**: los releases con cambios de base de datos pasan por
  DEV → UAT → MAIN con tiempo de soak adicional.

Los tres "Track" y el freeze de fin de mes son **exactamente** los casos que
`phase_waits` modela con `dependencia_tercero` y `ventana_mantenimiento`.

---

## 4. Meses 2–5 (backlog futuro)

### Bloque 2 · Comisiones — agosto 2026, ~15 HU

Módulo grande, puede extenderse al Mes 3. Una HU trae talla y créditos
explícitos; el resto tiene la columna desplazada por celdas combinadas.

- HU-0067 Generación de desembolso desde Solicitudes — **XL, 14 créditos**
- Enrolamiento de afiliados (contrato, firma AUCO)
- HU-0068 Cálculo automático de comisión por crédito
- HU-0069 Registro y liquidación de pólizas
- HU-0070 Pagos múltiples de comisiones
- HU-0071 Cálculo acumulativo de seguridad social
- HU-0072 Novedades de seguridad social
- HU-0073 Comisión bancaria por escalas
- HU-0074 Conciliación y cierre mensual
- HU-0075 Promotores por establecimiento
- HU-0076 Reapertura controlada de mes
- HU-0077 Perfil de afiliado para pago a otro usuario
- HU Exportación de reportes y pagos
- HU Visual del afiliado (comisiones, pagos, históricos)
- Envío de documentos electrónicos (crear HU con Yuli)

⚠ **HU-0067 es XL, 14 créditos** — un solo ítem consume el cupo mensual
completo del plan Enterprise. Y XL no existe en la escala del Anexo C que
sembramos para Podenza (solo S/M/L): caería en la escala general del tenant
(13 puntos), que no es un valor pactado.

### Bloque 3 · Solicitudes / Simulador / WhatsApp / IA — septiembre 2026

| Ítem | Módulo | Talla | Cr | Prio |
|---|---|---|---|---|
| Cambio de estado para reconsiderar ofertas | Solicitudes | M | 2 | — |
| Simulación de cuotas previo al preaprobado | Simulador | S | 1 | P1 |
| Segmentación dinámica de documentos | Solicitudes | M | 2 | — |
| Modal para rol Promotor (sin edición) | Solicitudes | M | 2 | P5 |
| Reportería de gestión y tiempos (CMG) | Administración | M | 2 | — |
| Resumen descriptivo del cliente con IA | Leads | M | 2 | — |

### Bloques 4 y 5 · octubre–noviembre 2026

| Ítem | Módulo | Talla | Cr |
|---|---|---|---|
| Delegación de funciones entre roles | Solicitudes | L | 4 |
| Envío de peritaje para bancos específicos | Bancos | M | 2 |
| Etiquetar notas externas a asesores de establecimientos | Solicitudes | S | 1 |
| Registro de leads con formulario manual (Sol. Corta) | Solicitudes | M | 2 |

Dos notas del cliente en estas filas: *"Pendiente confirmar si es garantía o
backlog"* y *"Pendiente de cobro"* — ambas son decisiones de clasificación
que afectan a la facturación.

---

## 5. El choque con lo que ya existe en la base

Esto es lo que hay que resolver antes de insertar nada.

### 5.1 Varios ítems ya existen como tickets

Búsqueda por palabras clave en los 470 tickets de Podenza: **9 de 18 ítems
del Mes 1 tienen un ticket que podría ser el mismo**. Ejemplos:

| Ítem del Excel | Posible ticket existente |
|---|---|
| Filtrar por banco en parrilla de Clientes | `TKT-2605-00560` [backlog/backlog] |
| Filtro por Dinateam | `PDZ-2601-00037` [support/backlog] |
| Editar tipo de Producto de Interés | `TKT-2604-00526` [support/backlog] |
| Crear Leads como Persona Jurídica | `TKT-2605-00593` [backlog/backlog] |
| Alcance de filtro de ejecutivo | `PDZ-2609-00157` [warranty/backlog] |

⚠ **La coincidencia por texto no es prueba.** Algunas son falsos positivos
(buscar "peritaje" devuelve tickets de 2025 sin relación). Hace falta que
alguien del equipo confirme cada pareja.

**Si se insertan sin cruzar, habrá dos registros del mismo trabajo**, y el
medidor de créditos del ciclo contará doble.

### 5.2 Los tipos no se corresponden

El Excel clasifica por **Prioridad** (Bug, P1–P6). La base clasifica por
**tipo de ticket**, que es lo que gobierna la facturación:

| Excel | ¿Qué tipo en la base? |
|---|---|
| Bug | ¿`warranty` (no consume cuota) o `support`? |
| P1–P6 | ¿`backlog` / `desarrollo_pendiente`? |
| Track (integraciones) | ¿`request`? |

**Esta decisión cambia lo que se factura.** `warranty` está excluida de la
cuota (323 tickets lo demuestran); `support`, `incident` y `request` la
consumen.

### 5.3 El crédito compartido entre varios ítems

El Excel agrupa: 7 filtros = 2 créditos, 4 ítems de WhatsApp = 4 créditos.
La base no tiene ese concepto: `tickets.effort_points` es por ticket.

Tres salidas posibles, y es una decisión de negocio:

1. **Un ticket por grupo**, con los 7 filtros como subtareas
   (`project_tasks` ya existe). El crédito queda donde lo pone el contrato,
   pero se pierde el seguimiento individual de cada filtro.
2. **Siete tickets, el crédito en uno** y los otros seis en 0. Mantiene el
   detalle y la suma cuadra, pero un ítem "de 0 créditos" es raro de leer.
3. **Siete tickets con fracción** (2 ÷ 7 ≈ 0,29). `effort_points` es
   `integer`, así que no cabe sin cambiar el tipo.

Sin resolver esto, cualquier carga infla o desinfla la facturación.

### 5.4 El estado actual de la base

```
delivery_cycles          0
tickets con project_id   0
tickets estimados        0
billing_plans            0
proyectos con org        0 de 3
```

El módulo está vacío y **ningún proyecto tiene organización asignada**, así
que hoy ningún ciclo podría resolver a qué cliente facturar.

---

## 6. Lo que falta decidir antes de insertar

1. **¿Los ítems del Excel son tickets nuevos o ya existen?** Hay que cruzar
   los 25 uno por uno. Lo propongo como una tabla de correspondencia que
   revise el equipo antes de tocar la base.
2. **¿Qué tipo de ticket le corresponde a cada clasificación del Excel?**
   Decide qué consume cuota.
3. **¿Cómo se cargan los créditos de grupo?** Los 7 filtros valen 2
   créditos entre todos. Ver las tres opciones de la sección 5.3.
4. **¿A qué proyecto se asocian?** No existe un proyecto de Podenza con
   organización asignada.
5. **¿XL para Podenza?** HU-0067 son 14 créditos y el Anexo C no define esa
   talla.
6. **Las dos notas pendientes del cliente**: "¿garantía o backlog?" en el
   peritaje y "pendiente de cobro" en Sol. Corta.

---

## 7. Lo que el cronograma confirma del diseño

Dos cosas que validan lo que ya se construyó:

**Las esperas externas son el cuello de botella real.** Los tres "Track"
dicen *"Espera banco"* sin fecha. Eso es `phase_waits` con
`dependencia_tercero`: el reloj de TDX se pausa y los días se imputan al
tercero. El Excel lo dice con todas las letras: *"El código puede estar 100%
listo y aún así esperar al banco."*

**El freeze de fin de mes es una fase real.** *"No se despliega la última
semana"* es `ventana_mantenimiento` en la fase de despliegue — una espera que
no es culpa de nadie y que extiende el plazo.

Ambos casos ya están modelados. Lo que falta es cargar los datos.
