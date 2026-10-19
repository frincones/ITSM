# Plan — el aviso de los tickets sin fase

El tablero muestra trece selectores de «Asignar fase» en tres renglones,
siempre abiertos, encima del tablero. El propósito es correcto —sin fase el
reloj no corre— pero así compite con el tablero por la atención.

Mockup aprobado, opción 1: https://claude.ai/artifact/7kDKhW2fqyJ3SKqRtNeaEa

---

## 1. La regla nueva: no haber empezado es legítimo

Freddy: *«no todos los requerimientos se inician al mismo tiempo cuando empieza
el ciclo. Es válido que un requerimiento esté sin mover el reloj por cierto
tiempo. Pero tiene que estar pendiente siempre el flag diciendo: epa, falta por
iniciar.»*

Eso separa dos cosas que hoy el aviso mezcla:

| | Qué es | Cómo debe verse |
|---|---|---|
| **Falta por iniciar** | estado legítimo: aún no toca | recordatorio, no alarma |
| **Va con atraso** | el plazo de una fase ya se pasó | alarma, y cuesta dinero |

**La base ya distingue las dos, y no hay que tocarla.** Comprobado contra
producción en `BEGIN/ROLLBACK`, quitándole la fase a un entregable:

```
con fase:  en breaches SI · exposed_over=0 · tdx_days=0 · discount=null
sin fase:  en breaches SI · exposed_over=0 · tdx_days=0 · discount=null
```

Un entregable sin fase **sigue apareciendo** en `cycle_sla_breaches` —no se
pierde de vista— pero **no acumula días ni expone créditos**. Es decir: el
cálculo del contrato ya trata «no empezado» como legítimo. Lo único que miente
es el texto de la interfaz.

**Consecuencia para el plan: ninguna migración, ninguna función SQL.**

---

## 2. Lo que se construye

Una franja de una línea, plegable, en lugar del bloque de trece selectores.

**Cerrada** — una línea con un punto que late suavemente:

```
● 13 tickets sin fase — su reloj no corre · quedan 10 días hábiles   [3 entregables] [abrir]
```

**Abierta** — los trece agrupados por entregable, con asignación por grupo:

```
  R1 · Capa de filtros          7 tickets    [Asignar fase a los 7 ▾]
     TKT-2610-00730  Filtro de QR                      [Asignar fase ▾]
     ...
  R2 · Captura por WhatsApp     4 tickets    [Asignar fase a los 4 ▾]
  R2 · Validación y enrutamiento 2 tickets   [Asignar fase a los 2 ▾]
```

Agrupar es lo que lo hace tolerable: **los trece caen en solo tres
entregables**, y siete de ellos en uno solo. Un clic clasifica más de la mitad.

### El texto

El actual dice *«el plazo lo lleva su entregable, pero sin fase no se pueden
repartir ni seguir»*. Es cierto y es flojo. El que importa:

- **Miembros sin fase** → «falta por iniciar — su reloj no corre»
- **Entregable sin fase** → lo mismo, pero en ámbar: es su propio plazo el que
  no ha arrancado
- Nunca «vas tarde», porque no haber empezado no es un atraso

### El tono

Hoy el bloque es ámbar entero, y ámbar significa «hay un problema». Un
recordatorio permanente no puede gritar: queda **un punto de color y el borde
izquierdo**, no el fondo completo. El latido es lento (2,4 s) y se desactiva con
`prefers-reduced-motion`.

---

## 3. Análisis de regresión

### 3.1 Lo que este cambio toca

Un solo bloque de `cycle-board.tsx`: el que hoy pinta el aviso (`sinFase`). No
se toca la rejilla, ni el arrastre, ni el panel, ni el dominio, ni la base.

### 3.2 Lo que podría romperse, y por qué no

| Riesgo | Por qué no ocurre | Cómo se comprueba |
|---|---|---|
| El aviso deja de verse y quedan tickets sin medir | la franja cerrada **siempre** está presente mientras haya uno; no se puede descartar, solo plegar | contar que el número de la franja = `items.filter(sin fase).length` |
| El filtro silencia el aviso | `sinFase` se calcula sobre `items` completo, no sobre `visibles` — ya es así y se conserva | filtrar por R1 y comprobar que la franja sigue diciendo 13 |
| Asignar por grupo mueve el reloj de más tickets de la cuenta | cada asignación es una llamada por ticket a la acción que ya existe | contar llamadas y tramos abiertos |
| Asignar por grupo mueve cifras del contrato | los miembros tienen 0 créditos y están excluidos de `cycle_sla_breaches` | ensayo en `BEGIN/ROLLBACK` |
| Un entregable sin fase se pierde | sigue en `cycle_sla_breaches` con `exposed_over = 0` | ya comprobado, sección 1 |
| El tablero se rompe si no hay ninguno sin fase | la franja no se pinta | poner fase a los 13 en ensayo y ver el tablero |

### 3.3 La regresión que de verdad importa

**Asignar fase a un grupo de siete dispara siete veces el trigger de 00077.**
Cada una abre un tramo con dueño y plazo congelados. Es la misma escritura que
hace hoy un arrastre, pero multiplicada.

Por eso:

1. Las llamadas van **en serie, no en paralelo**: si una falla, las anteriores
   ya están aplicadas y hay que poder decir cuáles.
2. El resultado dice **cuántas se aplicaron y cuántas fallaron**, en vez de un
   error genérico.
3. Se recarga una sola vez al final, no siete.
4. **Ensayo previo obligatorio** en `BEGIN/ROLLBACK`: asignar fase a los siete
   de R1 y exigir que las 15 cifras del contrato no se muevan.

### 3.4 Guardas

Las cuatro de siempre más la línea base:

| Guarda | Qué exige |
|---|---|
| `baseline-soporte.mjs --esperado` | las 13 cifras del SLA de soporte |
| `verify-reloj-miembros.mjs` | los miembros no mueven las 15 cifras |
| `verify-aislamiento.mjs` | nadie ve datos de otro cliente |
| `verify-mcp-proyectos.mjs` | las 34 tools responden |
| línea base | las 16 cifras, idénticas |
| `tsc` + `eslint` | sin errores |

**Manual:** plegar y desplegar; asignar a uno; asignar a un grupo; comprobar
que la franja desaparece cuando no queda ninguno; y que el arrastre sigue
funcionando (la franja está encima del tablero y no debe robarle el drop).

---

## 4. Orden

Un solo commit. Es un bloque acotado y conviene poder revertirlo entero:

```
feat(proyectos): el aviso de sin fase, plegable y por entregable
```

Si sale mal, `git revert` devuelve el bloque de trece selectores, que es feo
pero funciona.

---

## 5. Fuera de alcance

- **Un plazo para «falta por iniciar»** —avisar cuando lleva demasiado sin
  empezar— necesita decidir cuántos días son demasiados, y eso es una decisión
  de negocio. Dato para cuando la tomes: el más viejo de los trece lleva **192
  días hábiles** sin fase y al ciclo le quedan **10**.
- **La cola de clasificación** (opción 4 del mockup), como botón «Clasificar
  todo» dentro de la franja. Se puede añadir después sin tocar esto.
- Clasificar los trece: es tuyo, no de un script.
