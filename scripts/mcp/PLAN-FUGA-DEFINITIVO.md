# Corrección de la fuga de aislamiento — plan definitivo

Todo lo que sigue está medido contra producción el 15-oct-2026 simulando las
sesiones reales de los 7 usuarios. Solo lectura; nada modificado.

---

## 1. Decisiones tomadas

| # | Decisión | Verificación que la respalda |
|---|---|---|
| 1 | **Aislamiento por ORGANIZACIÓN**, no por persona | Camilo creó 12 tickets pero Podenza tiene 470. Aislar por persona le quitaría 458 que hoy usa, y a Bibiana 81 |
| 2 | **El personal de TDX sigue viendo todo** | Restringir por `agent_organizations` rompería el acceso de los 3 admin: Admin NovaDesk perdería 244 tickets, Emma 4, Freddy 1 |

La decisión 2 no es una preferencia: está forzada por los datos. Las
asignaciones de `agent_organizations` están incompletas, y usarlas como regla
de acceso dejaría a los admin sin tickets que hoy atienden.

---

## 2. Resultado objetivo, usuario por usuario

| Usuario | Rol | Hoy ve | Debe ver | Cambio |
|---|---|---|---|---|
| Admin NovaDesk | admin | 714 | **714** | ninguno |
| Freddy Rincones | admin | 714 | **714** | ninguno |
| Emma Castillo | admin | 714 | **714** | ninguno |
| Camilo Mayorga | readonly | 714 | **470** | −244 (Prosuministros) |
| Bibiana Carvajal | readonly | 714 | **470** | −244 (Prosuministros) |
| Daniel Valbuena | readonly | 714 | **240** | −474 (Podenza) |
| Andrés Valbuena | readonly | 714 | **240** | −474 (Podenza) |

Ningún usuario pierde un solo ticket de su propio cliente.

---

## 3. Alcance real de la fuga: 12 tablas

Medido con la sesión de Camilo (Podenza):

| Tabla | Ve hoy | Debería | Tratamiento |
|---|---|---|---|
| `tickets` | 714 | 470 | aislar por `organization_id` |
| `ticket_followups` | 1273 | **893** | heredar del ticket padre |
| `nps_surveys` | 188 | 93 | aislar por `organization_id` |
| `contacts` | 6 | 1 | aislar por `organization_id` |
| `inbox_conversations` | 8 | 4 | aislar por `organization_id` |
| `ai_dashboard_insights` | 6 | 1 | aislar por `organization_id` |
| `organization_users` | 5 | 3 | aislar por `organization_id` |
| `agent_organizations` | 10 | 5 | aislar por `organization_id` |
| `assets` | 7 | 0 | **solo personal** (ninguno tiene org) |
| `slas` | 4 | 0 | **solo personal** (catálogo interno) |
| `kb_articles` | 6 | **5** | **por `is_public`**, no por org |
| `portal_activity_log` | 32 | 32 | ya correcto (una sola org) |

### Lo más sensible no son los tickets

**`ticket_followups`** son los comentarios: conversaciones completas entre TDX
y el otro cliente. Camilo ve hoy los 367 de Prosuministros; Daniel, los 893
de Podenza. **`contacts`** expone nombres, correos y teléfonos.

### Dos casos que requieren cuidado especial

**`kb_articles`** — los 6 artículos tienen `organization_id = NULL`. Si la
política filtrara por organización, los clientes perderían **toda** la base de
conocimiento. Verificado: 5 están publicados con `is_public = true` y 1 es un
borrador interno. La política correcta es por `is_public`, no por org.

**1 ticket huérfano** (`TKT-2604-00291`, incidente cerrado de abril,
solicitante `freddyrincones@gmail.com`) tiene `organization_id = NULL`. Con el
RLS nuevo ningún cliente lo verá y los admin sí. Es un ticket de prueba tuyo;
sin impacto.

---

## 4. Lo que ya funciona y no se toca

Cinco tablas **ya aíslan correctamente** por organización:
`ticket_status_history`, `ticket_type_history`, `support_cycle_closures`,
`organization_support_contracts`, `support_contract_targets`.

Verificado: Camilo ve 1456 filas de `ticket_status_history` y Daniel 626 — se
separan bien. **El patrón correcto ya existe en esta base y está probado en
producción.** No hay que inventar nada: se replica.

---

## 5. Por qué la migración 00043 no sirve tal cual

Existe en el repositorio, fue escrita para esto, y **nunca llegó a
producción**. Al ensayarla en transacción revertida falla para **todos**,
admin incluidos:

```
ERROR: 42501: permission denied for function is_staff_agent
```

**Causa: nunca otorga `GRANT EXECUTE` sobre las funciones que crea**, y
`00060_function_grants.sql` tampoco las incluye. Casi con certeza se intentó,
rompió la aplicación y se revirtió.

Además, 00043 solo cubre 2 de las 12 tablas.

---

## 6. Plan de implementación

Tres migraciones. Cada una se ensaya **completa dentro de una transacción
revertida** antes de aplicarse, y se verifica contra la línea base después.

### `00068` — Funciones de acceso, con sus permisos

Crea `is_staff_agent()` y `has_org_access()` **con `GRANT EXECUTE`**, y añade
los grants a `00060_function_grants.sql` para que no vuelvan a faltar.

No modifica ninguna política. Nadie cambia lo que ve.

**Riesgo: ninguno.** Añadir funciones no altera nada existente.

### `00069` — `tickets` y `ticket_followups`

El 95% del volumen expuesto. Es el contenido de 00043, ya ensayado con éxito
una vez añadidos los grants.

**Este es el paso que cambia lo que ven los 4 usuarios cliente.**

### `00070` — Las 10 tablas restantes

Tres tratamientos distintos según el dato:

- **Por organización**: `contacts`, `nps_surveys`, `inbox_conversations`,
  `ai_dashboard_insights`, `organization_users`, `agent_organizations`
- **Solo personal**: `assets`, `slas` — catálogos internos de TDX
- **Por `is_public`**: `kb_articles` — para no romper la base de conocimiento

### Paso 4 — Código

`app/home/reports/tickets/page.tsx:13` consulta tickets sin filtrar por
organización. Con el RLS corregido ya no filtra de más, pero depender solo del
RLS es frágil: se añade el filtro explícito.

Aparte y fuera de este plan: **las páginas `/home` no re-verifican permisos de
módulo** — el menú oculta pero no protege. Merece su propio trabajo.

---

## 7. Análisis de regresión

### Lo que NO se ve afectado (verificado, no supuesto)

| Superficie | Por qué no se afecta |
|---|---|
| **El portal del cliente** | `portal/[token]/kb/page.tsx:31` usa `service_role`, que salta el RLS |
| **El servidor MCP** | `api/mcp/route.ts:313` usa `getSupabaseServerAdminClient()` = `service_role` |
| **Los crons** | Usan `service_role` |
| **La facturación** | `support_cycle_*` son `SECURITY DEFINER`; verificado: 11 valores idénticos |
| **Triggers y datos** | Ninguna migración toca columnas, datos ni triggers |
| **Las 5 tablas correctas** | No se modifican |

### Lo que sí cambia, y cómo se controla

| Riesgo | Control |
|---|---|
| Un admin pierde acceso | Ensayo por usuario antes de aplicar: los 3 deben seguir en 714 |
| Se rompen las escrituras | Ensayado: `UPDATE` como admin funciona |
| Un cliente pierde datos suyos | Ensayo: Podenza 470, Prosuministros 240 exactos |
| La KB desaparece del cliente | Política por `is_public`; verificar los 5 artículos tras aplicar |

### Verificación después de cada paso

```bash
node scripts/mcp/verify-00067.mjs    # facturación y volúmenes
node scripts/mcp/schema-audit.mjs    # columnas inventadas
```

Y la comprobación que decide, por cada uno de los 7 usuarios:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
SELECT count(*) FROM tickets WHERE deleted_at IS NULL;
```

Resultado esperado: 714 / 714 / 714 / 470 / 470 / 240 / 240.

---

## 8. Sobre el "cero riesgo"

No existe el cero riesgo absoluto en un cambio de control de acceso sobre una
base en producción. Lo que sí se puede garantizar, y es lo que este plan hace:

1. **Cada migración se ensaya entera en una transacción revertida** antes de
   aplicarse. Ese método ya encontró dos defectos reales esta sesión: la
   dependencia rota de 00043 y los `GRANT` faltantes.
2. **Se verifica usuario por usuario**, con números exactos esperados, no con
   una impresión general.
3. **Ninguna migración toca datos**: solo políticas y funciones. El rollback
   restaura políticas, no recupera filas, porque no se borra ninguna.
4. **Si algo no cuadra, se revierte** antes de pasar al siguiente paso.

El riesgo que queda es el que no se puede eliminar: los 4 usuarios cliente
**dejarán de ver datos que hoy ven**. Es la corrección, pero si alguno usa hoy
esa visibilidad —por ejemplo Bibiana consultando algo de Prosuministros— lo
notará. Por eso conviene avisarles antes de la ventana.
