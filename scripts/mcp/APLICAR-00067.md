# Aplicar 00067 — análisis de impacto y procedimiento

Estado verificado contra producción el 15-oct-2026, **en solo lectura**.

> **No puedo aplicarla yo.** Desde aquí solo tengo acceso REST con
> `service_role`, que ejecuta funciones existentes pero no puede correr DDL
> (`CREATE TABLE`, `ALTER TABLE`). La migración se pega en el SQL Editor.
> Lo que sí dejo es la verificación, para que comprobar sea mecánico.

---

## 1. Auditoría de la migración

Leída línea por línea buscando cualquier cosa que toque datos existentes:

| Operación | Cuántas | Sobre qué |
|---|---|---|
| `UPDATE` | **0** | — |
| `DELETE` | **0** | — |
| `TRUNCATE` | **0** | — |
| `ALTER COLUMN` | **0** | — |
| `DROP TABLE` / `DROP COLUMN` | **0** | — |
| `INSERT` | 1 | `effort_conversion` (tabla nueva, vacía) → 4 filas |
| `DROP POLICY` | 8 | Políticas que se recrean acto seguido |
| `ADD COLUMN` | 4 | Todas nullable, sin default |

**Ninguna fila existente cambia de valor.** Las 4 columnas nuevas nacen NULL
en los 714 tickets y los 3 proyectos.

---

## 2. El único cambio de comportamiento real

La migración **restringe** el RLS de `projects` y `project_tasks`. Hay que
entender a quién afecta antes de aplicarla.

### Quién mantiene su acceso

| Quién | Hoy | Después |
|---|---|---|
| Admin NovaDesk, Freddy, Emma (`admin`) | ven todo | **ven todo** — `is_staff_agent()` |
| Camilo, Bibiana, Daniel, Andrés (`readonly`) | ven los 3 proyectos internos | **ven 0** |

### Por qué eso es la corrección, no un daño

Los 3 proyectos son infraestructura interna de TDX:

```
Office Network Upgrade     [in_progress]
ITSM Platform Migration    [planning]
Security Audit Q2          [completed]
```

Hoy Camilo (Podenza) y Daniel (Prosuministros) pueden leer la auditoría de
seguridad interna de TDX. Esa es exactamente la fuga que 00043 cerró en
`tickets` y que `projects` todavía tiene.

### Qué NO pierde nadie

- **Las 6 `project_tasks`** son todas de proyectos internos. Ningún cliente
  pierde tareas propias.
- **Los tickets no se tocan**: Podenza 470, Prosuministros 240, TDX 3.
  El RLS de `tickets` no se modifica en esta migración.

### Un efecto cosmético, anotado para Fase 2

`projects-client.tsx:162` sustituye la lista por `DEMO_PROJECTS` cuando el
servidor devuelve 0 filas. Un usuario `readonly` que abra `/home/projects`
verá 4 proyectos ficticios en vez de una lista vacía. No se rompe nada, pero
es confuso y hay que quitarlo. No bloquea esta migración.

---

## 3. Línea base — ANTES de aplicar

Capturada en producción. Es contra esto que se compara después:

```json
{
  "tickets_total": 714,
  "por_tipo": { "support": 298, "warranty": 323, "request": 34,
                "desarrollo_pendiente": 2, "incident": 43, "backlog": 14 },
  "sla_applies_true": 15,
  "projects": 3, "project_tasks": 6, "project_members": 0,
  "organizations": 4, "organization_users": 5,
  "organization_support_contracts": 1,
  "ciclo": { "cycle_label": "22-Sep-2026 → 21-Oct-2026",
             "quota": 30, "consumed": 15, "remaining": 15,
             "overage": 0, "pct_used": 50.0 },
  "cumplimiento": { "measurable": 15, "met": 15, "breached": 0,
                    "compliance_pct": 100.0,
                    "credit_tickets": 0, "credit_cop": 0.0 }
}
```

---

## 4. Aplicar

**SQL Editor del dashboard** (Database → SQL Editor):

1. Pegar el contenido completo de
   `apps/web/supabase/migrations/00067_project_delivery_phase1.sql`
2. Run

Es una transacción implícita: si algo falla, Postgres revierte todo.

No usar `supabase db push`: aplicaría también migraciones que ya corrieron
pero puede que no estén registradas en la CLI.

---

## 5. Verificar — después de aplicar

```sql
-- 1) nada cambió de valor: las columnas nuevas nacen vacías
SELECT count(*) AS total,
       count(project_id)    AS con_proyecto,
       count(effort_size)   AS con_talla,
       count(effort_points) AS con_puntos
  FROM tickets WHERE deleted_at IS NULL;
-- esperado: 714, 0, 0, 0

-- 2) la escala quedó sembrada
SELECT size, points FROM effort_conversion WHERE effective_to IS NULL ORDER BY points;
-- esperado: S=1, M=3, L=8, XL=13  (4 filas)

-- 3) LA FACTURACIÓN NO SE MOVIÓ — la comprobación que importa
SELECT cycle_label, quota, consumed, remaining, overage, pct_used
  FROM support_cycle_usage((SELECT id FROM organization_support_contracts LIMIT 1));
-- esperado EXACTO: 22-Sep-2026 → 21-Oct-2026 | 30 | 15 | 15 | 0 | 50.0

SELECT measurable, met, breached, compliance_pct, credit_tickets, credit_cop
  FROM support_cycle_compliance((SELECT id FROM organization_support_contracts LIMIT 1));
-- esperado EXACTO: 15 | 15 | 0 | 100.0 | 0 | 0.00

-- 4) el personal sigue viendo los proyectos
SELECT count(*) FROM projects;   -- como admin: 3

-- 5) las tablas existentes intactas
SELECT (SELECT count(*) FROM tickets WHERE deleted_at IS NULL) AS tickets,
       (SELECT count(*) FROM projects)      AS projects,
       (SELECT count(*) FROM project_tasks) AS tareas;
-- esperado: 714, 3, 6
```

**Si la consulta 3 devuelve números distintos, revertir.** Es la señal de que
algo tocó la facturación, y ningún cambio de este módulo debería hacerlo.

---

## 6. Después de verificar — cerrar el circuito de tipos

Mientras no se haga, `database.types.ts` no conoce las columnas nuevas y el
código las accede con un cast:

```bash
set -a; . apps/web/.env.local; set +a
export SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"
node scripts/mcp/gen-types.mjs > packages/supabase/src/database.types.ts
node scripts/mcp/schema-audit.mjs       # debe seguir limpio
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"   # 427
```

Luego quitar el alias `UntypedQuery` y sus usos en
`apps/web/lib/domain/delivery.domain.ts`, que existe solo mientras los tipos
no conocen las columnas.

---

## 7. Rollback

```sql
-- Restaurar las políticas tenant-only de 00015 (devuelve el hueco de RLS)
DROP POLICY IF EXISTS projects_select ON projects;
CREATE POLICY projects_select ON projects FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
-- ...ídem insert/update/delete y las 4 de project_tasks, según 00015:45-98

DROP INDEX IF EXISTS idx_tickets_project;
ALTER TABLE projects DROP COLUMN IF EXISTS contract_id;
ALTER TABLE tickets
  DROP COLUMN IF EXISTS effort_points,
  DROP COLUMN IF EXISTS effort_size,
  DROP COLUMN IF EXISTS project_id;
DROP TABLE IF EXISTS effort_conversion;
DROP TYPE IF EXISTS effort_size;
NOTIFY pgrst, 'reload schema';
```

Nada del rollback pierde datos de negocio: las columnas y la tabla que borra
nacieron vacías en esta migración.
