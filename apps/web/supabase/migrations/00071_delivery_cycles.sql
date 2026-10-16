-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00071: CICLOS DE ENTREGA — FASE 2
-- NovaDesk ITSM — módulo de gestión de proyectos
-- ═══════════════════════════════════════════════════════════════
-- El problema que resuelve
-- ------------------------
-- Hoy la pertenencia de un ticket a un ciclo se DERIVA de `created_at`:
-- `support_cycle_usage()` cuenta los tickets creados entre `cycle_start` y
-- `cycle_end`. Eso funciona para facturar —lo creado en el mes se cobra en
-- el mes— pero hace imposible lo que pide el PRD:
--
--   "quiero mover items entre el backlog general y el ciclo"
--   "si se agrega un item a un ciclo lleno, obligar a sacar otro"
--   "lo no hecho regresa al backlog o al siguiente ciclo"
--
-- Un item no se puede mover a otro ciclo sin falsear su fecha de creación.
-- Esta migración da pertenencia EXPLÍCITA: una columna que se cambia a mano.
--
-- Dos ciclos distintos, deliberadamente
-- -------------------------------------
-- `support_cycle_for()` sigue siendo el ciclo de FACTURACIÓN: anclado al
-- contrato, con corte el día 22, y no se toca. Lo nuevo es el ciclo de
-- ENTREGA: lo que el equipo se compromete a entregar, que puede no coincidir
-- con el mes que se factura.
--
-- Por eso la tabla se llama `delivery_cycles` y no `cycles`: tener dos cosas
-- llamadas "ciclo" en la misma base es cómo se acaba facturando por el
-- calendario equivocado. El nombre dice cuál es cuál.
--
-- Nada de esto altera la facturación. `support_cycle_usage()` sigue contando
-- por `created_at` y devuelve los mismos números.
--
-- Depende de: 00015 (projects), 00067 (effort_points), 00068 (funciones RLS)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLA: delivery_cycles
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delivery_cycles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Número dentro del proyecto: "Ciclo 1", "Ciclo 2"... como en el PRD.
  cycle_number     integer NOT NULL CHECK (cycle_number > 0),
  name             text,

  starts_on        date NOT NULL,
  ends_on          date NOT NULL,

  -- Lo que el contrato compromete para este ciclo, en puntos de esfuerzo.
  -- NO son los "créditos" de `credit_cop`, que son el descuento por
  -- incumplir el SLA (ver 00067).
  committed_points integer CHECK (committed_points IS NULL OR committed_points >= 0),

  -- planned  — se está armando, se puede refinar
  -- active   — en curso; el PRD pide que no se refine
  -- closed   — cerrado, inamovible
  status           text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'closed')),

  -- Se sella al cerrar, igual que `support_cycle_closures` congela la
  -- facturación: lo entregado en un ciclo cerrado no se recalcula después.
  closed_at        timestamptz,
  closed_by        uuid REFERENCES agents(id) ON DELETE SET NULL,
  delivered_points integer,

  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_on >= starts_on),
  -- Un ciclo cerrado tiene que saber qué entregó.
  CHECK (status <> 'closed' OR (closed_at IS NOT NULL AND delivered_points IS NOT NULL)),
  UNIQUE (project_id, cycle_number)
);

COMMENT ON TABLE delivery_cycles IS
  'Ciclo de ENTREGA de un proyecto: lo que el equipo se compromete a entregar. Distinto del ciclo de FACTURACIÓN de support_cycle_for(), que se ancla al contrato y no se toca aquí.';

COMMENT ON COLUMN delivery_cycles.committed_points IS
  'Puntos de esfuerzo comprometidos. NO confundir con credit_cop/credit_tickets, que son el descuento por incumplir SLA.';

COMMENT ON COLUMN delivery_cycles.delivered_points IS
  'Puntos realmente entregados, sellados al cerrar. La velocidad se mide con esto, no con lo comprometido: comprometer no es entregar.';

CREATE INDEX IF NOT EXISTS idx_delivery_cycles_project
  ON delivery_cycles (project_id, cycle_number);
CREATE INDEX IF NOT EXISTS idx_delivery_cycles_active
  ON delivery_cycles (tenant_id, status) WHERE status <> 'closed';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON delivery_cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE delivery_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_cycles FORCE ROW LEVEL SECURITY;

-- Un cliente ve los ciclos de sus propios proyectos; el personal, todos.
-- Hereda el alcance del proyecto en vez de duplicar la regla.
CREATE POLICY delivery_cycles_select ON delivery_cycles
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = delivery_cycles.project_id
        AND (is_staff_agent() OR has_org_access(p.organization_id))
    )
  );

-- Planificar es del equipo: un cliente propone, no compromete.
CREATE POLICY delivery_cycles_write ON delivery_cycles
  FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent())
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- 2. PERTENENCIA: tickets.delivery_cycle_id
-- ---------------------------------------------------------------
-- La columna que resuelve el bloqueador. Nullable: un item del backlog no
-- pertenece a ningún ciclo hasta que alguien lo compromete.
--
-- ON DELETE SET NULL: borrar un ciclo devuelve sus items al backlog, nunca
-- los borra. Es criterio de aceptación del PRD ("un item que sale de un
-- ciclo regresa al backlog general").

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS delivery_cycle_id uuid
    REFERENCES delivery_cycles(id) ON DELETE SET NULL;

COMMENT ON COLUMN tickets.delivery_cycle_id IS
  'Ciclo de entrega al que está comprometido este item. NULL = en el backlog general. No afecta a la facturación: support_cycle_usage() sigue contando por created_at.';

CREATE INDEX IF NOT EXISTS idx_tickets_delivery_cycle
  ON tickets (delivery_cycle_id)
  WHERE delivery_cycle_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 3. HISTORIAL DE REFINAMIENTO
-- ---------------------------------------------------------------
-- El PRD pide registro de "qué entró, qué salió, quién y cuándo".
--
-- Sigue el patrón de `ticket_type_history` (00055): lo escribe un trigger,
-- nunca el código de aplicación, para que quede constancia venga el cambio
-- de la interfaz, del MCP o de SQL directo. Y congela los puntos del momento
-- en vez de recalcularlos: un ciclo cerrado debe seguir mostrando la
-- estimación que se usó entonces, no la de hoy.

CREATE TABLE IF NOT EXISTS delivery_cycle_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  from_cycle_id   uuid REFERENCES delivery_cycles(id) ON DELETE SET NULL,
  to_cycle_id     uuid REFERENCES delivery_cycles(id) ON DELETE SET NULL,

  -- Los puntos que tenía el item en el momento del movimiento.
  effort_points   integer,

  changed_at      timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE delivery_cycle_history IS
  'Registro de altas y bajas en los ciclos de entrega. Lo escriben los triggers, nunca el código, así que recoge los cambios vengan de donde vengan. Los puntos se congelan en el momento del movimiento.';

CREATE INDEX IF NOT EXISTS idx_cycle_history_ticket
  ON delivery_cycle_history (ticket_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cycle_history_cycle
  ON delivery_cycle_history (to_cycle_id, changed_at DESC)
  WHERE to_cycle_id IS NOT NULL;

ALTER TABLE delivery_cycle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_cycle_history FORCE ROW LEVEL SECURITY;

-- Solo lectura desde la aplicación: lo escribe el trigger, que corre como
-- SECURITY DEFINER y no pasa por aquí.
CREATE POLICY cycle_history_select ON delivery_cycle_history
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = delivery_cycle_history.ticket_id
        AND (is_staff_agent() OR has_org_access(t.organization_id))
    )
  );

-- ---------------------------------------------------------------
-- 4. TRIGGER: registrar cada movimiento
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_delivery_cycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agent_id uuid;
BEGIN
  SELECT id INTO v_agent_id FROM agents WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO delivery_cycle_history (
    tenant_id, ticket_id, from_cycle_id, to_cycle_id,
    effort_points, changed_by_user_id, changed_by_agent_id
  ) VALUES (
    NEW.tenant_id, NEW.id, OLD.delivery_cycle_id, NEW.delivery_cycle_id,
    NEW.effort_points, auth.uid(), v_agent_id
  );

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_delivery_cycle_change ON tickets;
CREATE TRIGGER trg_log_delivery_cycle_change
  AFTER UPDATE OF delivery_cycle_id ON tickets
  FOR EACH ROW
  WHEN (OLD.delivery_cycle_id IS DISTINCT FROM NEW.delivery_cycle_id)
  EXECUTE FUNCTION log_delivery_cycle_change();

COMMENT ON FUNCTION log_delivery_cycle_change() IS
  'Registra cada alta o baja de un item en un ciclo de entrega. Solo dispara cuando delivery_cycle_id cambia de verdad, así que una actualización que no toque el ciclo no ensucia el historial.';

-- ---------------------------------------------------------------
-- 5. FUNCIÓN: estado de un ciclo
-- ---------------------------------------------------------------
-- El semáforo que pide el PRD: comprometido contra capacidad.
--
-- Lo que NO hace: compararse con `monthly_ticket_quota`. Ese cupo cuenta
-- TICKETS y esto cuenta PUNTOS; cruzarlos daría un porcentaje sin
-- significado. Son dos medidas distintas de dos cosas distintas.

CREATE OR REPLACE FUNCTION delivery_cycle_status(p_cycle_id uuid)
RETURNS TABLE (
  cycle_id          uuid,
  cycle_number      integer,
  status            text,
  committed_points  integer,
  assigned_points   integer,
  delivered_points  integer,
  pending_points    integer,
  items_total       integer,
  items_done        integer,
  items_unestimated integer,
  over_commitment   boolean
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
  WITH items AS (
    SELECT t.status::text AS st, t.effort_points
      FROM tickets t
     WHERE t.delivery_cycle_id = p_cycle_id
       AND t.deleted_at IS NULL
  )
  SELECT
    v_cycle.id,
    v_cycle.cycle_number,
    v_cycle.status,
    v_cycle.committed_points,
    coalesce(sum(i.effort_points), 0)::integer,
    -- Entregado = lo que llegó a resolved/closed. Un item en progreso no
    -- cuenta: comprometer no es entregar.
    coalesce(sum(i.effort_points) FILTER (WHERE i.st IN ('resolved','closed')), 0)::integer,
    coalesce(sum(i.effort_points) FILTER (WHERE i.st NOT IN ('resolved','closed','cancelled')), 0)::integer,
    count(*)::integer,
    count(*) FILTER (WHERE i.st IN ('resolved','closed'))::integer,
    count(*) FILTER (WHERE i.effort_points IS NULL)::integer,
    -- El semáforo: lo asignado supera lo comprometido.
    (v_cycle.committed_points IS NOT NULL
      AND coalesce(sum(i.effort_points), 0) > v_cycle.committed_points)
  FROM items i;
END;
$fn$;

COMMENT ON FUNCTION delivery_cycle_status(uuid) IS
  'Estado de un ciclo de entrega: comprometido, asignado, entregado y pendiente, en puntos de esfuerzo. over_commitment es el semáforo del PRD. No se compara con monthly_ticket_quota, que cuenta tickets y no puntos.';

GRANT EXECUTE ON FUNCTION delivery_cycle_status(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
-- -- 1) nada cambió en los tickets
-- SELECT count(*) AS total, count(delivery_cycle_id) AS en_ciclo
--   FROM tickets WHERE deleted_at IS NULL;
-- -- esperado: 714, 0
--
-- -- 2) LA FACTURACIÓN NO SE MOVIÓ
-- SELECT quota, consumed, remaining FROM support_cycle_usage(
--   (SELECT id FROM organization_support_contracts LIMIT 1));
-- -- esperado: 30, 15, 15
--
-- -- 3) el aislamiento sigue bien
-- --    node scripts/mcp/verify-rls.mjs --esperado
--
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP TRIGGER IF EXISTS trg_log_delivery_cycle_change ON tickets;
--   DROP FUNCTION IF EXISTS log_delivery_cycle_change();
--   DROP FUNCTION IF EXISTS delivery_cycle_status(uuid);
--   DROP INDEX IF EXISTS idx_tickets_delivery_cycle;
--   ALTER TABLE tickets DROP COLUMN IF EXISTS delivery_cycle_id;
--   DROP TABLE IF EXISTS delivery_cycle_history;
--   DROP TABLE IF EXISTS delivery_cycles;
--   NOTIFY pgrst, 'reload schema';
--
-- No se pierde nada de negocio: todo lo que borra nació vacío aquí.
-- ═══════════════════════════════════════════════════════════════
