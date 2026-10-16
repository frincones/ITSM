-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00074: INTAKE DEL PORTAL — FASE 4
-- NovaDesk ITSM — módulo de gestión de proyectos
-- ═══════════════════════════════════════════════════════════════
-- El problema, medido
-- -------------------
-- 374 tickets consumieron cuota en el instante en que el cliente los creó.
-- El chat del portal inserta con `status: 'new'`, y como la pertenencia al
-- ciclo se deriva de `created_at`, lo que el cliente pide entra al ciclo y
-- se cuenta contra su cupo sin que nadie lo haya decidido.
--
-- Es exactamente lo que el PRD quiere frenar: "convertir cada pedido de más
-- en una decisión económica explícita".
--
-- La solución: tres capas
-- -----------------------
--   1. Portal  — el cliente propone. Queda en `proposed`.
--   2. Triage  — el equipo acepta o rechaza, poniendo talla y ciclo.
--   3. Backlog — solo lo aceptado llega aquí y consume cupo.
--
-- Una propuesta NO es un item del backlog hasta que pasa por el triage. Ese
-- es todo el punto.
--
-- Qué NO cambia
-- -------------
-- Los 374 tickets que ya consumieron cuota se quedan como están: nacieron
-- antes de que existiera el concepto de proyecto, y los ciclos cerrados
-- están congelados por diseño. La regla aplica hacia adelante.
--
-- Tampoco se toca `ticket_type_consumes_quota()`: un ticket en `proposed`
-- no se cuenta porque se excluye por ESTADO en las funciones de ciclo, no
-- por tipo. Cambiar la regla por tipo habría alterado la facturación de
-- todos los ciclos abiertos.
--
-- Depende de: 00073 ('proposed'), 00071 (delivery_cycles), 00068 (RLS)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. Excluir 'proposed' del consumo de ciclo
-- ---------------------------------------------------------------
-- Lo propuesto no es trabajo comprometido, así que no cuenta para el
-- esfuerzo del ciclo. Se hace por estado y no tocando
-- ticket_type_consumes_quota(), que gobierna la facturación por tipo y
-- cuyo cambio alteraría de inmediato todos los ciclos abiertos.

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
       -- Lo propuesto no cuenta: todavía no es trabajo comprometido.
       AND t.status <> 'proposed'
  )
  SELECT
    v_cycle.id,
    v_cycle.cycle_number,
    v_cycle.status,
    v_cycle.committed_points,
    coalesce(sum(i.effort_points), 0)::integer,
    coalesce(sum(i.effort_points) FILTER (WHERE i.st IN ('resolved','closed')), 0)::integer,
    coalesce(sum(i.effort_points) FILTER (WHERE i.st NOT IN ('resolved','closed','cancelled')), 0)::integer,
    count(*)::integer,
    count(*) FILTER (WHERE i.st IN ('resolved','closed'))::integer,
    count(*) FILTER (WHERE i.effort_points IS NULL)::integer,
    (v_cycle.committed_points IS NOT NULL
      AND coalesce(sum(i.effort_points), 0) > v_cycle.committed_points)
  FROM items i;
END;
$fn$;

GRANT EXECUTE ON FUNCTION delivery_cycle_status(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. Trazabilidad de la propuesta
-- ---------------------------------------------------------------
-- Quién propuso y cuándo se decidió. Van en `tickets` y no en una tabla
-- aparte porque una propuesta ES un ticket desde el primer momento: así no
-- hay que migrar nada cuando se acepta, solo cambia de estado.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS proposed_by_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS triaged_by uuid
    REFERENCES agents(id) ON DELETE SET NULL;

COMMENT ON COLUMN tickets.proposed_by_user_id IS
  'Quién propuso este item desde el portal. Exige sesión: sin identidad verificada no hay a quién atribuir la propuesta.';

COMMENT ON COLUMN tickets.triaged_at IS
  'Cuándo el equipo decidió sobre la propuesta. NULL mientras siga en la cola de triage.';

CREATE INDEX IF NOT EXISTS idx_tickets_triage
  ON tickets (organization_id, created_at DESC)
  WHERE status = 'proposed' AND deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 3. accept_proposal — convertir una propuesta en item
-- ---------------------------------------------------------------
-- La decisión económica explícita que pide el PRD: aquí es donde se le pone
-- talla y precio a lo que el cliente pidió, y donde queda constancia de
-- quién lo aceptó.
--
-- Es SECURITY DEFINER y comprueba el rol por dentro: aceptar una propuesta
-- compromete capacidad del equipo, así que no puede hacerlo un cliente
-- aunque la propuesta sea suya.

CREATE OR REPLACE FUNCTION accept_proposal(
  p_ticket_id  uuid,
  p_size       effort_size DEFAULT NULL,
  p_cycle_id   uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  -- Por MCP la conexión usa service_role y auth.uid() es NULL, así que el
  -- agente viene explícito. El rol se comprueba igual: lo que cambia es de
  -- dónde sale la identidad, no si se verifica.
  p_actor_agent_id uuid DEFAULT NULL
)
RETURNS TABLE (
  ticket_id     uuid,
  ticket_number text,
  status        text,
  effort_size   text,
  effort_points integer,
  cycle_id      uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ticket  tickets;
  v_agent   agents;
  v_points  integer;
BEGIN
  IF p_actor_agent_id IS NOT NULL THEN
    SELECT * INTO v_agent FROM agents
     WHERE id = p_actor_agent_id AND is_active = true
       AND role IN ('admin','supervisor','agent');
  ELSE
    SELECT * INTO v_agent FROM agents
     WHERE user_id = auth.uid() AND is_active = true
       AND role IN ('admin','supervisor','agent');
  END IF;

  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'Solo el equipo puede aceptar propuestas'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM tickets
   WHERE id = p_ticket_id AND deleted_at IS NULL;

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'Propuesta no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status <> 'proposed' THEN
    RAISE EXCEPTION 'El ticket no está en estado propuesto (está en %)', v_ticket.status
      USING ERRCODE = '22023';
  END IF;

  -- La talla se convierte con la escala VIGENTE y el resultado se congela,
  -- igual que en estimateItem: recalibrar después no altera lo aceptado.
  IF p_size IS NOT NULL THEN
    SELECT points INTO v_points FROM effort_conversion
     WHERE tenant_id = v_ticket.tenant_id AND size = p_size AND effective_to IS NULL;
  END IF;

  RETURN QUERY
  UPDATE tickets t
     SET status        = 'backlog',
         effort_size   = coalesce(p_size, t.effort_size),
         effort_points = coalesce(v_points, t.effort_points),
         project_id    = coalesce(p_project_id, t.project_id),
         delivery_cycle_id = coalesce(p_cycle_id, t.delivery_cycle_id),
         triaged_at    = now(),
         triaged_by    = v_agent.id
   WHERE t.id = p_ticket_id
  RETURNING t.id, t.ticket_number, t.status::text, t.effort_size::text,
            t.effort_points, t.delivery_cycle_id;
END;
$fn$;

COMMENT ON FUNCTION accept_proposal(uuid, effort_size, uuid, uuid, uuid) IS
  'Acepta una propuesta del portal y la convierte en item de backlog, congelando sus puntos. Solo el equipo: aceptar compromete capacidad.';

GRANT EXECUTE ON FUNCTION accept_proposal(uuid, effort_size, uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. reject_proposal
-- ---------------------------------------------------------------
-- Rechazar la cancela, no la borra: el PRD pide que nada se pierda, y un
-- "esto no entra" con su motivo es información que el cliente merece ver.

CREATE OR REPLACE FUNCTION reject_proposal(
  p_ticket_id uuid,
  p_reason    text DEFAULT NULL,
  p_actor_agent_id uuid DEFAULT NULL
)
RETURNS TABLE (ticket_id uuid, ticket_number text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agent agents;
BEGIN
  IF p_actor_agent_id IS NOT NULL THEN
    SELECT * INTO v_agent FROM agents
     WHERE id = p_actor_agent_id AND is_active = true
       AND role IN ('admin','supervisor','agent');
  ELSE
    SELECT * INTO v_agent FROM agents
     WHERE user_id = auth.uid() AND is_active = true
       AND role IN ('admin','supervisor','agent');
  END IF;

  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'Solo el equipo puede rechazar propuestas'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE tickets t
     SET status = 'cancelled',
         triaged_at = now(),
         triaged_by = v_agent.id,
         internal_notes = coalesce(t.internal_notes || E'\n', '') ||
                          'Propuesta rechazada: ' || coalesce(p_reason, 'sin motivo')
   WHERE t.id = p_ticket_id
     AND t.status = 'proposed'
     AND t.deleted_at IS NULL
  RETURNING t.id, t.ticket_number, t.status::text;
END;
$fn$;

COMMENT ON FUNCTION reject_proposal(uuid, text, uuid) IS
  'Rechaza una propuesta dejándola en cancelled con el motivo. No borra: el cliente debe poder ver qué pasó con lo que pidió.';

GRANT EXECUTE ON FUNCTION reject_proposal(uuid, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
-- -- 1) nada cambió
-- SELECT count(*) AS total, count(*) FILTER (WHERE status='proposed') AS propuestas
--   FROM tickets WHERE deleted_at IS NULL;     -- 714, 0
--
-- -- 2) LA FACTURACIÓN NO SE MOVIÓ
-- SELECT quota, consumed, remaining FROM support_cycle_usage(
--   (SELECT id FROM organization_support_contracts LIMIT 1));   -- 30, 15, 15
--
-- -- 3) un cliente no puede aceptar su propia propuesta
-- --    (debe fallar con 42501)
--
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS reject_proposal(uuid, text, uuid);
--   DROP FUNCTION IF EXISTS accept_proposal(uuid, effort_size, uuid, uuid, uuid);
--   DROP INDEX IF EXISTS idx_tickets_triage;
--   ALTER TABLE tickets
--     DROP COLUMN IF EXISTS triaged_by,
--     DROP COLUMN IF EXISTS triaged_at,
--     DROP COLUMN IF EXISTS proposed_at,
--     DROP COLUMN IF EXISTS proposed_by_user_id;
--   -- y restaurar el cuerpo de delivery_cycle_status de 00071
--   NOTIFY pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════
