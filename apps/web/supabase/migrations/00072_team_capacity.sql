-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00072: CAPACIDAD DEL EQUIPO — FASE 3
-- NovaDesk ITSM — módulo de gestión de proyectos
-- ═══════════════════════════════════════════════════════════════
-- Para qué va
-- -----------
-- El PRD pide cruzar tres números en cada ciclo y mostrarlos como semáforo:
--
--   (a) el cupo de puntos que el cliente contrató   -> 00071, committed_points
--   (b) la capacidad del equipo en horas             -> esto
--   (c) los puntos ya comprometidos                  -> 00071, assigned_points
--
-- Sin (b) el semáforo solo dice si cabe en el contrato, no si cabe en la
-- gente. Un ciclo puede estar dentro del cupo y aun así ser imposible.
--
-- Una trampa de nombres que conviene conocer
-- ------------------------------------------
-- Ya existe `support_plan_band()` con la etiqueta "capacity band", pero eso
-- es la tolerancia comercial del plan contratado (cuándo subir o bajar de
-- tier), nada que ver con horas de personas. Son cosas distintas con un
-- nombre parecido; esta migración no la toca.
--
-- Lo que se reutiliza
-- -------------------
-- Los días festivos ya están: `calendar_holidays` tiene 36 cargados y
-- `calendar.service.ts` los usa para el reloj del SLA. Esta migración los
-- aprovecha en vez de crear un segundo calendario que acabaría
-- desincronizado. Lo que faltaba era lo individual: las vacaciones de cada
-- persona.
--
-- Depende de: 00071 (delivery_cycles), 00068 (funciones RLS),
--             00006 (calendar_holidays)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. agent_time_off — ausencias individuales
-- ---------------------------------------------------------------
-- Los festivos son del equipo y ya están en calendar_holidays. Esto es lo
-- de cada persona: vacaciones, incapacidad, formación.

CREATE TABLE IF NOT EXISTS agent_time_off (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  starts_on   date NOT NULL,
  ends_on     date NOT NULL,

  kind        text NOT NULL DEFAULT 'vacation'
    CHECK (kind IN ('vacation', 'sick', 'training', 'other')),
  notes       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES agents(id) ON DELETE SET NULL,

  CHECK (ends_on >= starts_on)
);

COMMENT ON TABLE agent_time_off IS
  'Ausencias individuales. Los festivos del equipo viven en calendar_holidays y se descuentan aparte: duplicarlos aquí llevaría a dos calendarios que se contradicen.';

CREATE INDEX IF NOT EXISTS idx_time_off_agent
  ON agent_time_off (agent_id, starts_on, ends_on);

ALTER TABLE agent_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_time_off FORCE ROW LEVEL SECURITY;

-- Solo el personal. Las ausencias de los agentes de TDX no son asunto de
-- ningún cliente.
CREATE POLICY time_off_select ON agent_time_off
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

CREATE POLICY time_off_write ON agent_time_off
  FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent())
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- 2. agent_capacity — horas por persona y por ciclo
-- ---------------------------------------------------------------
-- La capacidad se fija por ciclo y no de forma global porque la
-- disponibilidad cambia cada mes: alguien entra a medio tiempo, otro sale de
-- vacaciones, un tercero se reparte entre dos clientes.
--
-- `hours_per_day` es la dedicación a ESTE proyecto, no la jornada. Emma a
-- 4 h/día en Podenza puede estar a 4 h/día en otro sitio.

CREATE TABLE IF NOT EXISTS agent_capacity (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id       uuid NOT NULL REFERENCES delivery_cycles(id) ON DELETE CASCADE,
  agent_id       uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  hours_per_day  numeric(4,2) NOT NULL CHECK (hours_per_day > 0 AND hours_per_day <= 24),

  -- Horas que se van en reuniones, levantamiento o soporte. El PRD lo pide
  -- explícitamente: si no se descuentan, la capacidad miente y el ciclo se
  -- sobrecarga.
  overhead_hours numeric(6,2) NOT NULL DEFAULT 0 CHECK (overhead_hours >= 0),

  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (cycle_id, agent_id)
);

COMMENT ON TABLE agent_capacity IS
  'Dedicación de cada persona a un ciclo, en horas por día. Se fija por ciclo porque la disponibilidad cambia cada mes.';

COMMENT ON COLUMN agent_capacity.hours_per_day IS
  'Horas diarias dedicadas a ESTE ciclo, no la jornada completa: una persona puede repartirse entre varios proyectos.';

COMMENT ON COLUMN agent_capacity.overhead_hours IS
  'Horas del ciclo que no son desarrollo: reuniones, levantamiento, soporte. Se restan de la capacidad disponible.';

CREATE INDEX IF NOT EXISTS idx_capacity_cycle ON agent_capacity (cycle_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_capacity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE agent_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_capacity FORCE ROW LEVEL SECURITY;

CREATE POLICY capacity_select ON agent_capacity
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

CREATE POLICY capacity_write ON agent_capacity
  FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent())
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- 3. working_days_between — días hábiles descontando festivos
-- ---------------------------------------------------------------
-- Cuenta de lunes a viernes y resta los festivos que ya están cargados.
-- Separada de `agent_capacity_status` para poder comprobarla sola: un error
-- aquí desplaza todos los números de capacidad a la vez.

CREATE OR REPLACE FUNCTION working_days_between(
  p_tenant_id uuid,
  p_from      date,
  p_to        date
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::integer
    FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
   WHERE extract(isodow FROM d.day) < 6
     AND NOT EXISTS (
       SELECT 1 FROM calendar_holidays h
        WHERE h.tenant_id = p_tenant_id
          AND h.date = d.day::date
     );
$$;

COMMENT ON FUNCTION working_days_between(uuid, date, date) IS
  'Días hábiles entre dos fechas, inclusive: lunes a viernes menos los festivos de calendar_holidays. Mismo calendario que usa el reloj del SLA.';

GRANT EXECUTE ON FUNCTION working_days_between(uuid, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. agent_capacity_status — la carga de cada persona
-- ---------------------------------------------------------------
-- Las horas asignadas salen de `project_tasks.estimated_hours` de las tareas
-- de esa persona en items comprometidos al ciclo.
--
-- Nota sobre la garantía: el PRD dice que no suma puntos pero sí ocupa
-- horas. Eso sale solo, porque esto cuenta horas de tareas sin mirar el tipo
-- del ticket.

CREATE OR REPLACE FUNCTION agent_capacity_status(p_cycle_id uuid)
RETURNS TABLE (
  agent_id          uuid,
  agent_name        text,
  hours_per_day     numeric,
  working_days      integer,
  days_off          integer,
  gross_hours       numeric,
  overhead_hours    numeric,
  available_hours   numeric,
  assigned_hours    numeric,
  free_hours        numeric,
  utilization_pct   numeric,
  over_allocated    boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cycle delivery_cycles;
BEGIN
  SELECT * INTO v_cycle FROM delivery_cycles WHERE id = p_cycle_id;
  IF v_cycle.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      c.agent_id,
      a.name AS agent_name,
      c.hours_per_day,
      c.overhead_hours,
      working_days_between(c.tenant_id, v_cycle.starts_on, v_cycle.ends_on) AS wd,
      -- Ausencias individuales que caen dentro del ciclo. Se cuentan los
      -- días hábiles del solape, no los naturales: unas vacaciones que
      -- incluyen un fin de semana no restan capacidad por esos días.
      coalesce((
        SELECT sum(working_days_between(
                 t.tenant_id,
                 greatest(t.starts_on, v_cycle.starts_on),
                 least(t.ends_on, v_cycle.ends_on)))
          FROM agent_time_off t
         WHERE t.agent_id = c.agent_id
           AND t.starts_on <= v_cycle.ends_on
           AND t.ends_on   >= v_cycle.starts_on
      ), 0)::integer AS do
    FROM agent_capacity c
    JOIN agents a ON a.id = c.agent_id
    WHERE c.cycle_id = p_cycle_id
  ),
  carga AS (
    SELECT pt.assigned_to AS agent_id,
           coalesce(sum(pt.estimated_hours), 0)::numeric AS horas
      FROM project_tasks pt
      JOIN tickets tk ON tk.project_id = pt.project_id
     WHERE tk.delivery_cycle_id = p_cycle_id
       AND tk.deleted_at IS NULL
       AND pt.status <> 'done'
     GROUP BY pt.assigned_to
  )
  SELECT
    b.agent_id,
    b.agent_name,
    b.hours_per_day,
    b.wd,
    b.do,
    ((b.wd - b.do) * b.hours_per_day)::numeric                       AS gross_hours,
    b.overhead_hours,
    greatest(((b.wd - b.do) * b.hours_per_day) - b.overhead_hours, 0)::numeric AS available_hours,
    coalesce(g.horas, 0)                                             AS assigned_hours,
    (greatest(((b.wd - b.do) * b.hours_per_day) - b.overhead_hours, 0)
       - coalesce(g.horas, 0))::numeric                              AS free_hours,
    CASE
      WHEN greatest(((b.wd - b.do) * b.hours_per_day) - b.overhead_hours, 0) = 0 THEN NULL
      ELSE round(coalesce(g.horas, 0) * 100
           / (((b.wd - b.do) * b.hours_per_day) - b.overhead_hours), 1)
    END                                                              AS utilization_pct,
    (coalesce(g.horas, 0)
       > greatest(((b.wd - b.do) * b.hours_per_day) - b.overhead_hours, 0)) AS over_allocated
  FROM base b
  LEFT JOIN carga g ON g.agent_id = b.agent_id
  ORDER BY b.agent_name;
END;
$fn$;

COMMENT ON FUNCTION agent_capacity_status(uuid) IS
  'Carga por persona en un ciclo: horas disponibles tras descontar festivos, ausencias y overhead, contra las horas asignadas. over_allocated marca la sobre-asignación que el PRD pide ver en rojo.';

GRANT EXECUTE ON FUNCTION agent_capacity_status(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. copy_cycle_capacity — no reconfigurar desde cero
-- ---------------------------------------------------------------
-- El PRD lo pide y es lo que hace Azure DevOps: la plantilla casi nunca
-- cambia de un ciclo al siguiente.

CREATE OR REPLACE FUNCTION copy_cycle_capacity(
  p_from_cycle uuid,
  p_to_cycle   uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count integer;
BEGIN
  -- ON CONFLICT DO NOTHING: si el ciclo destino ya tiene a alguien
  -- configurado, se respeta. Copiar no debe pisar un ajuste hecho a mano.
  INSERT INTO agent_capacity (tenant_id, cycle_id, agent_id, hours_per_day, overhead_hours, notes)
  SELECT c.tenant_id, p_to_cycle, c.agent_id, c.hours_per_day, c.overhead_hours, c.notes
    FROM agent_capacity c
   WHERE c.cycle_id = p_from_cycle
  ON CONFLICT (cycle_id, agent_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION copy_cycle_capacity(uuid, uuid) IS
  'Copia la plantilla de capacidad de un ciclo a otro. No pisa lo que el ciclo destino ya tenga configurado.';

GRANT EXECUTE ON FUNCTION copy_cycle_capacity(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
-- -- 1) los días hábiles cuadran (noviembre 2026: 21 hábiles)
-- SELECT working_days_between(
--   (SELECT id FROM tenants LIMIT 1), '2026-11-01', '2026-11-30');
--
-- -- 2) nada cambió
-- SELECT count(*) FROM tickets WHERE deleted_at IS NULL;   -- 714
--
-- -- 3) facturación y aislamiento intactos
-- --    node scripts/mcp/verify-00067.mjs
-- --    node scripts/mcp/verify-rls.mjs --esperado
--
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS copy_cycle_capacity(uuid, uuid);
--   DROP FUNCTION IF EXISTS agent_capacity_status(uuid);
--   DROP FUNCTION IF EXISTS working_days_between(uuid, date, date);
--   DROP TABLE IF EXISTS agent_capacity;
--   DROP TABLE IF EXISTS agent_time_off;
--   NOTIFY pgrst, 'reload schema';
--
-- No se pierde nada de negocio: ambas tablas nacen vacías aquí.
-- ═══════════════════════════════════════════════════════════════
