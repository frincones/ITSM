-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00067: GESTIÓN DE PROYECTOS — FASE 1
-- NovaDesk ITSM — vincular backlog, proyecto y esfuerzo
-- ═══════════════════════════════════════════════════════════════
-- Para qué va
-- -----------
-- El PRD de gestión de proyectos (15-oct-2026) pide un backlog estimado por
-- tallas y agrupado por proyecto. Las dos mitades ya existen por separado:
-- hay 16 tickets de tipo backlog/desarrollo_pendiente de Podenza y
-- Prosuministros, y hay una tabla `projects` con sus tareas. Lo que no existe
-- es la unión entre ambas, ni una unidad de esfuerzo.
--
-- Esta migración añade esa unión. No crea tablas, no toca enums, y no altera
-- ninguna regla de facturación.
--
-- Por qué `effort_points` y no "créditos"
-- --------------------------------------
-- En esta base "crédito" ya significa otra cosa: `credit_cop` y
-- `credit_tickets` (00057/00058) son el DESCUENTO EN PESOS que se le debe al
-- cliente cuando el cumplimiento de SLA no llega al umbral, y esa palabra ya
-- salió en reportes entregados. El esfuerzo del PRD es una tercera cosa
-- distinta de ese descuento y de `monthly_ticket_quota`, que es un conteo de
-- tickets.
--
-- Tres conceptos con un solo nombre producen reportes que mienten, así que el
-- esfuerzo se llama `effort_points` en la base. La interfaz puede rotularlo
-- "Créditos" de cara al cliente; eso es una etiqueta, no un nombre de columna.
--
-- Qué NO hace esta migración
-- --------------------------
--   * No añade tipos ni estados de ticket. La clasificación del PRD
--     (APLICA / GARANTÍA / BACKLOG ADICIONAL) ya existe como `ticket_type`, y
--     `ticket_type_consumes_quota()` ya decide qué se cobra. Un tipo nuevo
--     entraría por omisión en el lado NO facturable y, peor, reclasificar un
--     `support` hacia él RESTITUIRÍA cuota — un cambio de facturación
--     silencioso. Ver PLAN-PROYECTOS.md §6.2 R1.
--   * No toca `support_cycle_usage()` ni ninguna función de ciclo.
--   * No asigna los 3 proyectos internos de TDX a ninguna organización. Nacieron
--     sin cliente y así se quedan; el módulo arranca con proyectos nuevos.
--
-- Depende de: 00015 (projects), 00021 (organizations), 00043 (has_org_access),
--             00048 (organization_support_contracts)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM: talla de esfuerzo
-- ---------------------------------------------------------------
-- T-shirt sizing, como pide el PRD. Es un tipo propio y no un CHECK para que
-- la lista sea la misma en toda la base y un valor inventado falle en el
-- INSERT, no en una revisión de código.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'effort_size') THEN
    CREATE TYPE effort_size AS ENUM ('S', 'M', 'L', 'XL');
  END IF;
END $$;

COMMENT ON TYPE effort_size IS
  'Talla de esfuerzo estilo T-shirt. Se convierte a effort_points con la tabla vigente al estimar; el resultado se congela en el ticket.';

-- ---------------------------------------------------------------
-- 2. TABLA: effort_conversion — talla → puntos, versionada
-- ---------------------------------------------------------------
-- El PRD pide que recalibrar la tabla no altere lo ya estimado. Por eso la
-- conversión se versiona por fecha y el valor resultante se CONGELA en el
-- ticket (`tickets.effort_points`): cambiar que M valga 5 en vez de 3 afecta
-- a lo que se estime desde entonces, nunca a lo ya facturado.
--
-- Es el mismo principio que `support_cycle_closures` aplica a los ciclos
-- cerrados (00058): la regla se guarda aplicada, no se recalcula después.

CREATE TABLE IF NOT EXISTS effort_conversion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  size          effort_size NOT NULL,
  points        integer NOT NULL CHECK (points > 0),
  -- Vigencia abierta: NULL en effective_to = la fila vigente hoy.
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE effort_conversion IS
  'Tabla de conversión talla → puntos de esfuerzo, versionada por vigencia. El valor se congela en tickets.effort_points al estimar, así que recalibrarla no altera el histórico.';

-- Una sola conversión vigente por talla y tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_effort_conversion_current
  ON effort_conversion (tenant_id, size)
  WHERE effective_to IS NULL;

ALTER TABLE effort_conversion ENABLE ROW LEVEL SECURITY;
ALTER TABLE effort_conversion FORCE ROW LEVEL SECURITY;

-- Lectura para todo el personal del tenant: necesitan ver la escala para
-- estimar. Escritura solo admin: cambiar la escala cambia lo que se factura.
CREATE POLICY effort_conversion_select ON effort_conversion
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY effort_conversion_write ON effort_conversion
  FOR ALL TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  )
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  );

-- Escala inicial, la del PRD (S=1, M=3, L=8, XL=13 — Fibonacci).
-- Se siembra por tenant existente; un tenant nuevo la define al configurarse.
INSERT INTO effort_conversion (tenant_id, size, points)
SELECT t.id, v.size::effort_size, v.points
FROM tenants t
CROSS JOIN (VALUES ('S', 1), ('M', 3), ('L', 8), ('XL', 13)) AS v(size, points)
WHERE NOT EXISTS (
  SELECT 1 FROM effort_conversion ec
  WHERE ec.tenant_id = t.id AND ec.size = v.size::effort_size AND ec.effective_to IS NULL
);

-- ---------------------------------------------------------------
-- 3. COLUMNAS EN tickets
-- ---------------------------------------------------------------
-- Las tres son nullable y sin default: un ticket de soporte normal no tiene
-- proyecto ni talla, y debe seguir sin tenerlos. Nada de lo que ya existe
-- cambia de comportamiento.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS project_id    uuid
    REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS effort_size   effort_size,
  ADD COLUMN IF NOT EXISTS effort_points integer
    CHECK (effort_points IS NULL OR effort_points >= 0);

COMMENT ON COLUMN tickets.project_id IS
  'Proyecto de entrega al que pertenece este item. NULL para el soporte corriente, que no vive en un proyecto. ON DELETE SET NULL: borrar un proyecto no debe borrar el histórico de tickets.';

COMMENT ON COLUMN tickets.effort_size IS
  'Talla estimada (S/M/L/XL). NULL mientras no se haya estimado.';

COMMENT ON COLUMN tickets.effort_points IS
  'Puntos de esfuerzo, CONGELADOS al estimar desde la effort_conversion vigente. No se recalculan: recalibrar la escala no debe alterar lo ya comprometido. NO confundir con credit_cop / credit_tickets, que son el descuento por incumplir SLA.';

-- Índice parcial: solo las filas que pertenecen a un proyecto. El backlog es
-- una fracción de los 714 tickets, así que un índice completo sería casi todo
-- NULL.
CREATE INDEX IF NOT EXISTS idx_tickets_project
  ON tickets (project_id, status)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 4. COLUMNA EN projects: el contrato que lo gobierna
-- ---------------------------------------------------------------
-- Un proyecto de entrega pertenece a un cliente y ese cliente tiene un
-- contrato con su cupo y su día de corte. Enlazarlo aquí evita tener que
-- adivinar el contrato por organización cuando haya más de uno vigente.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contract_id uuid
    REFERENCES organization_support_contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN projects.contract_id IS
  'Contrato de soporte que gobierna el cupo y el día de corte de ciclo de este proyecto. NULL en los proyectos internos de TDX, que no tienen cliente.';

-- ---------------------------------------------------------------
-- 5. RLS DE projects — cerrar el hueco que 00043 cerró en tickets
-- ---------------------------------------------------------------
-- Esto NO es parte del módulo nuevo: es un defecto que ya existe.
--
-- 00043 endureció `tickets` porque "un usuario de la organización A podía
-- consultar Supabase directamente y leer todos los tickets de la organización
-- B dentro del mismo tenant". `projects` tiene exactamente ese hueco: sus
-- políticas solo comprueban `tenant_id`, y `projects.organization_id` existe
-- desde 00021 pero ninguna política lo lee.
--
-- Hoy el riesgo es bajo porque los 3 proyectos vivos son internos de TDX y no
-- tienen organización. Deja de serlo en cuanto exista el primer proyecto de
-- un cliente — que es justo lo que habilita esta migración. Por eso se corrige
-- aquí y no después: la fase que crea proyectos de cliente no puede ser la
-- misma que los deje expuestos.
--
-- Un proyecto sin organización (interno) solo lo ve el personal.

DROP POLICY IF EXISTS projects_select ON projects;
CREATE POLICY projects_select ON projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

-- La escritura sigue siendo solo del personal: un cliente nunca crea ni edita
-- un proyecto, ni siquiera el suyo. Propone items, que es otra cosa (Fase 4).
DROP POLICY IF EXISTS projects_insert ON projects;
CREATE POLICY projects_insert ON projects
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS projects_update ON projects;
CREATE POLICY projects_update ON projects
  FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS projects_delete ON projects;
CREATE POLICY projects_delete ON projects
  FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- project_tasks hereda el alcance de su proyecto. Mismo razonamiento: la
-- tarea de un proyecto de cliente no debe ser legible por otro cliente.
DROP POLICY IF EXISTS project_tasks_select ON project_tasks;
CREATE POLICY project_tasks_select ON project_tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_tasks.project_id
        AND (is_staff_agent() OR has_org_access(p.organization_id))
    )
  );

DROP POLICY IF EXISTS project_tasks_insert ON project_tasks;
CREATE POLICY project_tasks_insert ON project_tasks
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS project_tasks_update ON project_tasks;
CREATE POLICY project_tasks_update ON project_tasks
  FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS project_tasks_delete ON project_tasks;
CREATE POLICY project_tasks_delete ON project_tasks
  FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- 6. PostgREST
-- ---------------------------------------------------------------
-- Sin esto, la tabla y las columnas nuevas devuelven 400 hasta que PostgREST
-- recargue por su cuenta, y `gen-types.mjs` no las vería.

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN (correr después de aplicar)
-- ═══════════════════════════════════════════════════════════════
-- -- 1) columnas nuevas, todas nullable y vacías
-- SELECT count(*) FILTER (WHERE project_id IS NOT NULL)    AS con_proyecto,
--        count(*) FILTER (WHERE effort_size IS NOT NULL)   AS con_talla,
--        count(*) AS total
--   FROM tickets WHERE deleted_at IS NULL;
-- -- esperado: 0, 0, 714 — nada cambió de valor
--
-- -- 2) la escala quedó sembrada
-- SELECT size, points FROM effort_conversion WHERE effective_to IS NULL ORDER BY points;
-- -- esperado: S=1, M=3, L=8, XL=13
--
-- -- 3) LA FACTURACIÓN NO SE MOVIÓ — lo más importante
-- SELECT * FROM support_cycle_usage(
--   (SELECT id FROM organization_support_contracts LIMIT 1));
-- -- esperado: mismos quota/consumed/remaining que ANTES de la migración.
-- --           Anotar los valores antes de aplicar para poder comparar.
--
-- -- 4) un cliente no ve proyectos de otra organización
-- --    (correr autenticado como usuario de portal, no con service_role)
-- SELECT count(*) FROM projects;
-- -- esperado: solo los de su organización; 0 si no tiene proyectos
--
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   -- Restaurar las políticas tenant-only de 00015 (devuelve el hueco de RLS)
--   DROP POLICY IF EXISTS projects_select ON projects;
--   CREATE POLICY projects_select ON projects FOR SELECT TO authenticated
--     USING (tenant_id = get_current_tenant_id());
--   -- ...ídem insert/update/delete y las 4 de project_tasks, según 00015:45-98
--
--   DROP INDEX IF EXISTS idx_tickets_project;
--   ALTER TABLE projects DROP COLUMN IF EXISTS contract_id;
--   ALTER TABLE tickets
--     DROP COLUMN IF EXISTS effort_points,
--     DROP COLUMN IF EXISTS effort_size,
--     DROP COLUMN IF EXISTS project_id;
--   DROP TABLE IF EXISTS effort_conversion;
--   DROP TYPE IF EXISTS effort_size;
--   NOTIFY pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════
