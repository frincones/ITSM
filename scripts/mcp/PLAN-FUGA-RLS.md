# Fuga de aislamiento entre clientes — análisis y plan de remediación

Medido contra producción el 15-oct-2026 simulando las sesiones reales de cada
usuario. Todo en solo lectura; nada se modificó.

---

## 1. Qué está fallando

El RLS de la mayoría de tablas comprueba **solo `tenant_id`**. Las tres
organizaciones —Podenza, Prosuministros y TDX— comparten un único tenant, así
que `tenant_id` no las separa: las distingue `organization_id`, y **12 tablas
que tienen esa columna no la usan en sus políticas**.

La intención de aislar sí existe en la aplicación: los 4 usuarios cliente
tienen permisos con `scope: 'own'` sobre 3 recursos (`tickets`, `dashboard`,
`notifications`). El fallo es que **la base de datos no refleja esa intención**.

---

## 2. Qué ve hoy un cliente (medido, no estimado)

Simulando la sesión real de Camilo Mayorga (Podenza) y Daniel Valbuena
(Prosuministros) con `auth.uid()`:

| Tabla | Camilo ve | Daniel ve | Camilo debería ver | Filas de más |
|---|---|---|---|---|
| `tickets` | **714** | **714** | 479 | 235 de otro cliente |
| `ticket_followups` | **1273** | **1273** | ~893 | ~380 comentarios ajenos |
| `nps_surveys` | **188** | **188** | 93 | 95 encuestas ajenas |
| `contacts` | **6** | **6** | 1 | 5 contactos ajenos |
| `agent_organizations` | **10** | **10** | 5 | el mapa de quién atiende a quién |
| `organization_users` | **5** | **5** | 3 | usuarios de otros clientes |
| `inbox_conversations` | **8** | **8** | 4 | conversaciones ajenas |
| `ai_dashboard_insights` | **6** | **6** | 1 | análisis de otros clientes |
| `assets`, `kb_articles`, `slas` | 7 / 6 / 4 | igual | 0 | datos internos de TDX |

Lo más sensible: **`ticket_followups`** son los comentarios de los tickets —
conversaciones completas con otro cliente. Y `contacts` expone nombres,
correos y teléfonos de la competencia.

### Lo que SÍ está bien

`ticket_status_history` aísla correctamente (Camilo 1456, Daniel 626), igual
que `support_cycle_closures`, `ticket_type_history`,
`organization_support_contracts` y `support_contract_targets`. **El patrón
correcto ya existe en esta base y está probado** — no hay que inventarlo.

---

## 3. Por dónde se explota, y por dónde no

**Por la interfaz normal: no se ve.** Las server actions y el dominio filtran
por organización en código (`enforcedOrgId` en `lib/actions/tickets.ts:131`,
`resolveOrgScope` en 9 módulos de dominio). Un cliente navegando la app ve lo
suyo.

**Por acceso directo a la API: sí.** El cliente tiene una sesión válida de
Supabase en el navegador. Con esa sesión, una llamada a
`/rest/v1/tickets?select=*` devuelve los 714. No hace falta nada sofisticado:
basta abrir las herramientas de desarrollo y copiar el token.

**Hay además una página sin filtro.** `app/home/reports/tickets/page.tsx:13`
consulta `.from('tickets').select('status, type')` sin filtrar por
organización, y **las páginas `/home` no re-verifican permisos** — el filtro
del menú lateral es solo cosmético. Un cliente que escriba la URL ve el
conteo agregado de los 714.

---

## 4. Qué usuarios están afectados

Los 4 con rol `readonly`, todos con sesión activa en la aplicación:

| Usuario | Organización | Ve indebidamente |
|---|---|---|
| Camilo Mayorga | Podenza | 240 tickets de Prosuministros |
| Daniel Valbuena | Prosuministros | 470 tickets de Podenza |
| Andrés Valbuena | Prosuministros | 470 tickets de Podenza |
| Bibiana Carvajal | Dinafik (vía Podenza) | 240 tickets de Prosuministros |

Los 3 usuarios `admin` (Admin NovaDesk, Freddy, Emma) deben seguir viéndolo
todo, y la corrección lo preserva.

---

## 5. Por qué la migración 00043 no sirve tal cual

00043 existe en el repositorio y fue escrita exactamente para esto, pero
**nunca llegó a producción**: `to_regproc('is_staff_agent')` devuelve NULL.

Al ensayarla en una transacción revertida, falla para **todos** los usuarios,
admin incluidos:

```
ERROR: 42501: permission denied for function is_staff_agent
```

**Causa: 00043 nunca otorga `GRANT EXECUTE` sobre las funciones que crea**, y
`00060_function_grants.sql` tampoco las incluye. Eso explica por qué no está
aplicada: lo más probable es que se intentara, rompiera la aplicación y se
revirtiera.

Con dos líneas de `GRANT` añadidas, el ensayo da el resultado correcto:

| Usuario | Con la corrección |
|---|---|
| Los 3 admin | **714** — sin pérdida de acceso |
| Camilo, Bibiana | **470** — solo Podenza |
| Daniel, Andrés | **240** — solo Prosuministros |

Verificado además: el admin sigue pudiendo escribir (`UPDATE` sobre tickets),
y las tablas hijas se aíslan en consecuencia.

00043 cubre `tickets` y `ticket_followups`. **Las otras 10 tablas siguen
expuestas** y necesitan su propia migración.

---

## 6. Plan de remediación

Tres migraciones, en orden de riesgo y de valor. Cada una se ensaya primero
en transacción revertida y se verifica contra la línea base.

### Paso 1 — `00068`: los GRANT que le faltan a 00043

Crea `is_staff_agent()` y `has_org_access()` **con sus permisos**, y añade los
grants a `00060_function_grants.sql` para que no vuelvan a faltar.

No cambia ninguna política todavía: solo deja las funciones disponibles y
probadas. Riesgo: ninguno — añadir funciones no altera nada existente.

### Paso 2 — `00069`: aislar `tickets` y `ticket_followups`

Es el contenido de 00043, que ya está escrito y ensayado. Cubre el 95% del
volumen expuesto (714 tickets + 1273 comentarios).

**Este es el paso que cambia lo que ven 4 personas.** Requiere la ventana
coordinada.

Verificación obligatoria después: los 3 admin siguen en 714; Camilo y Bibiana
en 470; Daniel y Andrés en 240; la facturación sin moverse (cupo 30, consumo
15, 100%, 0 créditos).

### Paso 3 — `00070`: las 10 tablas restantes

`contacts`, `nps_surveys`, `inbox_conversations`, `ai_dashboard_insights`,
`agent_organizations`, `organization_users`, `assets`, `kb_articles`, `slas`,
`portal_activity_log`.

Menos volumen pero igual de sensible: `contacts` expone datos personales.

Tratamiento distinto según la tabla:
- Con datos de varias organizaciones (`contacts`, `nps_surveys`,
  `inbox_conversations`, `agent_organizations`, `organization_users`,
  `ai_dashboard_insights`) → aislar por `organization_id`.
- Catálogos internos de TDX (`assets`, `slas`, y `kb_articles` cuando no es
  público) → **solo personal**, los clientes no deberían verlos en absoluto.

Sobre `kb_articles`: **el portal NO se ve afectado.** Verificado —
`app/portal/[token]/kb/page.tsx:31` usa `service_role`, que salta el RLS por
completo. Aun así la política debe permitir `is_public = true`, porque la KB
pública también se consulta desde la aplicación autenticada.

### Paso 4 — código: la página sin filtro

`app/home/reports/tickets/page.tsx` debe filtrar por organización como hacen
las demás. Con el RLS corregido ya no filtraría de más, pero depender solo del
RLS para eso es frágil.

Aparte, y fuera de este plan: **las páginas `/home` no re-verifican permisos
de módulo**. Vale la pena un gate en el layout, porque hoy el menú oculta pero
no protege.

---

## 7. Análisis de regresión

### Lo que podría romperse

| Riesgo | Mitigación |
|---|---|
| Un admin pierde acceso | Ensayado: los 3 siguen en 714. `is_staff_agent()` cubre admin, supervisor y agent |
| Se rompen las escrituras | Ensayado: `UPDATE` como admin funciona |
| El portal deja de mostrar la KB | **Sin riesgo**: el portal usa `service_role` (verificado en `portal/[token]/kb/page.tsx:31`), que salta el RLS |
| Los reportes cambian de números | La facturación no depende del RLS (las funciones son `SECURITY DEFINER`); verificado: 11 valores idénticos |
| El MCP deja de leer | **Sin riesgo**: `api/mcp/route.ts:313` usa `getSupabaseServerAdminClient()` = `service_role` |
| Un cron falla | Los crons usan `service_role`. Sin impacto |

### Lo que hay que verificar después de cada paso

```bash
node scripts/mcp/verify-00067.mjs     # facturación y volúmenes
node scripts/mcp/schema-audit.mjs     # columnas inventadas
MCP_BASE_URL=... node scripts/mcp/contract-test.mjs   # 116+ tools
```

Más la comprobación por usuario, que es la que importa:

```sql
-- por cada uno de los 7 usuarios
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
SELECT count(*) FROM tickets WHERE deleted_at IS NULL;
```

### Lo que NO se toca

- Ninguna función de facturación (`support_cycle_*`)
- Ningún trigger
- Ninguna columna ni dato
- El RLS de las 5 tablas que ya aíslan correctamente

---

## 8. Recomendación de secuencia

1. **00068 ya** — es inocuo y desbloquea el resto
2. **00069 en ventana coordinada** — avisar antes a los 4 usuarios de que
   dejarán de ver datos que hoy ven, aunque no debieran verlos
3. **00070 inmediatamente después**, en la misma ventana
4. **El arreglo de la página** en el mismo despliegue

Si hay que priorizar una sola cosa: **el paso 2**, porque `ticket_followups`
son conversaciones completas entre TDX y el otro cliente.
