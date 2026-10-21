# Plan — la barra apilada del portal pasa a dos tarjetas

Cada requerimiento del portal dice el mismo número **tres veces**: en la frase
de arriba, en la barra apilada y en el texto de abajo. Y cuando solo hay una
parte con tiempo, la barra se pinta llena de un color: una proporción sin nada
que proporcionar.

Mockup aprobado: https://claude.ai/artifact/JiH9dC9LvnBudzMk5pWT7b

```
┌─────────────────────────┬──────────────────────────┐
│ TDX                     │ PODENZA                  │
│ 4 h                     │ 5 días                   │
│ dentro del plazo        │ se pasó 4 días del plazo │
└─────────────────────────┴──────────────────────────┘
```

---

## 1. Lo que mostrarían hoy

| Requerimiento | TDX | Podenza |
|---|---|---|
| R1 · Capa de filtros | 4,0 h | **40,8 h** (+32,8 h) |
| R2 · Captura WhatsApp | 25,1 h **(+16,1 h)** | 8,9 h (+0,9 h) |
| R2 · Inactivación | — | 9,4 h (+1,4 h) |
| R2 · Validación | — | 8,9 h (+0,9 h) |
| Santander | 14,2 h | — |

Los dos lados con datos reales, que es lo que hace que las tarjetas funcionen.

---

## 2. El hallazgo que simplifica todo: terceros no existe

`tercero_minutes` es **estructuralmente 0 y siempre lo será**. Verificado por
dos caminos:

- **Por catálogo:** sale de `sum(net_minutes) FILTER (WHERE owner = 'tercero')`,
  y las 10 fases de `delivery_phases` solo tienen `cliente`, `ninguno` o `tdx`.
- **Por datos:** **cero** tramos con `owner = 'tercero'` en toda la base.

El tiempo de Santander no está ahí: vive en la **espera**, que pausa el reloj y
ya se muestra arriba en «Lo que esperamos de ti».

**Consecuencia:** el segmento gris de la barra nunca se ha pintado, y la
entrada «Terceros» de la leyenda describe un color que no existe. Las dos
tarjetas TDX/Podenza cubren el 100% del tiempo que hay.

---

## 3. Lo que se toca

Un solo archivo: `portal-phases.tsx`.

| Qué | Líneas |
|---|---|
| La barra y las frases de atraso → dos tarjetas | 420–480 |
| La leyenda de colores, entera | 264–278 |
| `const total`, que queda huérfano | 314 |
| El guard `total > 0` | 422 |

Ni la base, ni las funciones SQL, ni el tablero interno.

---

## 4. Los riesgos, medidos

### 4.1 🔴 «Podenza» no puede escribirse a mano

El componente **no recibe el nombre de la organización**. Hay `orgName` en
`portal-project-client.tsx:65` y en `page.tsx:96`, pero no llega hasta aquí.

Si se escribe «Podenza» literal, **el portal del segundo cliente mentiría**. Se
pasa como prop desde donde ya existe.

### 4.2 🔴 El dato se duplicaría

`tdx_over` y `client_over` **ya se muestran** en las frases de 459–478. Si las
tarjetas los añaden y solo se sustituye la barra, el mismo número sale dos
veces por requerimiento.

Por eso se reemplaza **420–480 completo**: las tarjetas absorben los `over` y
las frases desaparecen.

### 4.3 🟠 No perder el mensaje positivo

La línea 463 dice **«Sin atraso de nuestra parte»** en verde cuando
`tdx_over === 0`. Es un *else* explícito, no una omisión: la honestidad en las
dos direcciones fue un pedido del equipo, y está documentada en la cabecera del
archivo.

Las tarjetas lo conservan: el subtítulo dice **«dentro del plazo»** cuando no
hay exceso, no se queda vacío.

### 4.4 🟠 El guard `total > 0` deja de valer

Se diseñó para la barra: *«una barra repartida a partes iguales insinuaría días
que no existieron»*. Ese razonamiento no aplica a una tarjeta — «0 h» es un dato
válido, y ocultarla justo en los requerimientos recién empezados es lo peor,
porque son los que el cliente abre a mirar.

Pasa a `tdx_minutes > 0 || client_minutes > 0`.

### 4.5 🟡 Terceros, si algún día existe

`'tercero'` es un `owner` legal en los CHECK, y el comentario de 00076 contempla
*«Fundacional / accesos · PODENZA / tercero»*. Si alguien lo activa, ese tiempo
desaparecería del portal sin aviso, porque `total` ya no estará para delatarlo.

Se deja un comentario en el código diciéndolo, para que quien lo active sepa que
tiene que volver aquí.

### 4.6 🟡 Sin red de seguridad

**No hay tests, snapshots ni Storybook** que toquen este archivo. El único
guardián es `tsc` más ESLint, que sí detectará `total` sin usar. La verificación
es manual.

---

## 5. Lo que NO se replica

El tablero interno tiene **dos barras equivalentes** —`phase-sla-tab.tsx` y la
mini-barra de `cycle-board.tsx`— y **no se tocan**, por tres razones:

1. El portal habla en segunda persona y con el nombre del cliente; el interno es
   multi-cliente y dice «cliente» en tercera.
2. El interno muestra el crédito expuesto en pesos; el portal no, a propósito.
3. El orden del portal está pensado para que la pantalla no sea un reproche, y
   eso no aplica al interno.

Queda anotada una deuda menor: `cycle-board.tsx:1096` mete `tercero_minutes` en
el denominador pero no pinta ese segmento. Hoy es inocuo porque es 0.

---

## 6. Lo que las auditorías encontraron de paso

Tres defectos que ya existen, ninguno causado por este cambio. Van en commits
aparte porque no dependen de él.

### 6.1 🔴 Una tool MCP anuncia un campo que no existe

`mcp/tools/delivery.ts:486` dice que `requirements_list` devuelve
**`tercero_days`**. La función devuelve `tercero_minutes`. Al renombrar en
00085 se cambiaron dos de los tres y este quedó atrás.

Un agente que lea esa descripción pedirá `tercero_days`, recibirá `undefined`
y mostrará un cero. Es el único resto de nomenclatura vieja apuntando a una
salida de función.

Y otras ocho descripciones siguen diciendo «días» donde el dato son minutos.

### 6.2 🔴 Dos guardas dejaron de proteger

`reset-fases-ciclo1.mjs` compara `tdx_delay_days` y `client_delay_days`, que
ya no existen. Ejecutado ahora:

```
  OK     tdx_delay_days       undefined
  FALLA  client_delay_days baja  undefined → undefined
```

**Compara `undefined` con `undefined` y lo da por OK.** La guarda pasa sin
verificar nada. Lo mismo en `verify-reloj-miembros.mjs:32` y una consulta de
`arrancar-ciclo1.mjs:163` que directamente falla.

### 6.3 🟡 El portal no puede hablar de dinero

`exposed_over` —el atraso que cuesta crédito— **nunca se mapea** al portal.
Y `exposed_credits` e `items_at_risk` sí llegan en runtime, pero el tipo
`PhaseSummary` los omite, así que no se pueden usar.

El portal puede decir «nos pasamos N» pero no «de los que M exponen crédito»,
que es la distinción que el tablero interno sí hace.

---

## 7. Verificación

- Las cuatro guardas
- `tsc` y `eslint` sin errores nuevos (427 es la línea base)
- Que las cifras de las tarjetas cuadren con `requirement_delay`
- **Manual:** que «Podenza» salga del nombre de la organización, que un
  requerimiento sin tiempo muestre las tarjetas igual, y que no quede ningún
  número repetido en la misma tarjeta
