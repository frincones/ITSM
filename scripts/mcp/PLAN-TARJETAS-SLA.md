# Plan — las tarjetas del SLA dicen lo que hay que saber

La pantalla de SLA por fase muestra cifras correctas con etiquetas que no
corresponden, y oculta la única que de verdad hace falta para hablar con el
cliente.

---

## 1. Lo que ya se corrigió

En `bb969d4`, al revisar la captura:

| | Antes | Ahora |
|---|---|---|
| R2 · Captura | *«Sin atraso imputable a TDX»* con 16,1 h de atraso | el atraso real, y aparte si expone crédito |
| Tarjetas | «ATRASO DE TDX» sobre tiempo trabajado | «Tiempo de TDX» |
| Espera | «3.4 h» con la etiqueta **DÍAS** debajo | «en espera» |

Queda un problema de fondo que ese arreglo no resuelve.

---

## 2. El problema que queda

La cabecera pone dos cifras juntas que no son comparables:

```
  TIEMPO DE TDX        32,6h        TIEMPO DEL CLIENTE      30,1h
```

Cualquiera las suma y cree que el ciclo lleva 62,7 h. Pero:

- Los 32,6 h de TDX incluyen el levantamiento, que **no tiene plazo y no puede
  incumplir**
- Los 30,1 h del cliente son **una sola espera** de aprobación en curso
- Y ninguna de las dos responde a *«¿quién se pasó y cuánto?»*

### Las cinco cifras que existen, y cuáles se ven

| Campo | Valor | Qué es | ¿Se ve hoy? |
|---|---|---|---|
| `tdx_minutes` | 32,6 h | tiempo trabajado por TDX | **sí** |
| `cliente_minutes` | 30,1 h | tiempo esperando al cliente | **sí** |
| `tdx_over` | **16,1 h** | lo que NOS pasamos del plazo | solo por requerimiento |
| `cliente_over` | **22,1 h** | lo que SE pasó el cliente | **no se ve en ningún sitio** |
| `exposed_over` | 0 h | atraso que cuesta dinero | solo si hay descuento |

**`cliente_over` es el dato que falta.** 22,1 horas que el cliente se pasó de
su plazo de aprobación, y la pantalla no lo dice en ninguna parte. Es
exactamente la cifra que sustenta la conversación con Camilo.

---

## 3. Lo que se construye

Cuatro tarjetas, cada una con una pregunta distinta:

```
  ENTREGADO        NOS PASAMOS         SE PASÓ EL CLIENTE      EXPONE
  0%               2d 0,1h             2d 6,1h                 —
  0 de 14 cr       de 4d 0,5h          de 3d 6h esperando      sin plazo
                   trabajados          su respuesta             vigente
```

Cada una responde a algo que el PM pregunta de verdad:

1. **Entregado** — cómo va el ciclo *(sin cambios)*
2. **Nos pasamos** — `tdx_over`, con el tiempo trabajado como contexto
3. **Se pasó el cliente** — `cliente_over`, el dato que falta
4. **Expone** — `exposed_over` en pesos, o por qué no hay cifra

El tiempo trabajado no desaparece: baja a ser el contexto en letra pequeña,
que es su sitio.

### Por qué «nos pasamos» y no «atraso»

«Atraso» invita a sumar las dos cifras y a leerlas como una deuda conjunta.
«Nos pasamos» y «se pasó el cliente» dicen de quién es cada una sin que haga
falta explicarlo.

---

## 4. El otro dato duplicado, ya resuelto

El tiempo compartido de los dos R2 se corrigió en `aa24fc5`: la reunión y la
HU fueron una sola, así que el tiempo vive en «Captura por WhatsApp y QR» —el
de 4 créditos— y «Validación» arranca en aprobación.

Verificado hoy: `tdx_minutes` suma 32,6 h contando ese trabajo **una vez**.
Siguen separados porque valen distinto (L/4cr y M/2cr), y agruparlos exigiría
una talla de 6 créditos que la escala de Podenza no tiene.

---

## 5. Análisis de riesgo

### Qué se toca

Solo `phase-sla-tab.tsx`: las cuatro tarjetas de cabecera y el `useMemo` que
las alimenta. **Ni la base, ni las funciones, ni el portal del cliente.**

### Riesgos

| # | Riesgo | Por qué no ocurre |
|---|---|---|
| 1 | Mostrar un campo que no existe | `tdx_over` y `cliente_over` ya vienen de `requirement_delay`; se usan hoy por requerimiento |
| 2 | Que `cliente_over` incluya fases sin plazo | `over_minutes` es NULL cuando no hay plazo, y la suma lo ignora |
| 3 | Romper el cálculo del descuento | la tarjeta solo lee; `exposed_over` se sigue calculando igual |
| 4 | Que las cifras dejen de cuadrar entre pantallas | el portal del cliente lee los mismos campos y no se toca |
| 5 | Confundir «nos pasamos» con «expone» | se separan en dos tarjetas, que es el motivo del cambio |

### Verificación

- Las cuatro guardas
- Las cifras de la cabecera deben cuadrar con la suma de los requerimientos:
  `tdx_over` 16,1 h y `cliente_over` 22,1 h
- `tsc` y `eslint` sin errores nuevos

---

## 6. Fuera de alcance

- **El portal del cliente**, que tiene sus propias tarjetas y su propio tono.
  Si este cambio funciona, se lleva allí después.
- **El umbral de exposición**, que solo importa al cerrar el ciclo.
- **`billing_plans`**, que sigue vacío y por eso la cuarta tarjeta dirá «sin
  plan vigente» en vez de una cifra en pesos.
