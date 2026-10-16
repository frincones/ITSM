-- ═══════════════════════════════════════════════════════════════
-- 00075 · delivery_cycle_status: los cancelados salen del denominador
-- ═══════════════════════════════════════════════════════════════
--
-- CORRIGE UN DEFECTO DE 00074, no añade funcionalidad.
--
-- En 00074 los dos agregados por ítem usan predicados distintos:
--
--   count(*)                                              -- items_total
--   count(*) FILTER (WHERE st IN ('resolved','closed'))    -- items_done
--
-- Un ítem cancelado está en items_total y no está en items_done, así que
-- items_done / items_total reporta MENOS cumplimiento del real. En puntos sí
-- era consistente: 'cancelled' ya quedaba fuera de delivered_points y fuera
-- de pending_points.
--
-- Importa porque close_delivery_cycle() congela el resultado al cerrar el
-- ciclo (lib/domain/delivery.domain.ts) y el portal del cliente lee ese
-- número (lib/services/portal-delivery.service.ts). Un ciclo cerrado con un
-- ítem cancelado quedaría con el porcentaje equivocado para siempre.
--
-- ───────────────────────────────────────────────────────────────
-- POR QUÉ ES SEGURO HOY
-- ───────────────────────────────────────────────────────────────
-- Medido en producción el 16-oct-2026:
--
--   delivery_cycles                    0 filas
--   tickets con delivery_cycle_id      0
--   tickets en estado 'proposed'       0
--
-- No hay un solo ciclo que recalcular. Es el momento más barato para
-- corregirlo; cada ciclo que se cierre con el defecto es un número
-- congelado que habría que explicar después.
--
-- ───────────────────────────────────────────────────────────────
-- QUÉ NO TOCA
-- ───────────────────────────────────────────────────────────────
-- Nada del SLA de soporte. Esta función es del módulo de proyectos
-- (00071/00074) y no la lee ninguna de las de Emma (00047-00063):
-- support_cycle_usage, support_cycle_compliance y stamp_ticket_sla filtran
-- por TIPO de ticket y no conocen delivery_cycles.
--
-- Verificar antes y después:
--   node scripts/mcp/baseline-soporte.mjs --esperado
-- ═══════════════════════════════════════════════════════════════

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
       -- Lo cancelado tampoco: se sacó del alcance del ciclo de común
       -- acuerdo, así que no es trabajo incumplido. Antes entraba en
       -- items_total sin poder entrar nunca en items_done, lo que subestima
       -- el cumplimiento. Los puntos ya lo excluían de ambos lados.
       AND t.status <> 'cancelled'
  )
  SELECT
    v_cycle.id,
    v_cycle.cycle_number,
    v_cycle.status,
    v_cycle.committed_points,
    coalesce(sum(i.effort_points), 0)::integer,
    coalesce(sum(i.effort_points) FILTER (WHERE i.st IN ('resolved','closed')), 0)::integer,
    -- Ya no hace falta excluir 'cancelled' aquí: no llega a este punto.
    coalesce(sum(i.effort_points) FILTER (WHERE i.st NOT IN ('resolved','closed')), 0)::integer,
    count(*)::integer,
    count(*) FILTER (WHERE i.st IN ('resolved','closed'))::integer,
    count(*) FILTER (WHERE i.effort_points IS NULL)::integer,
    (v_cycle.committed_points IS NOT NULL
      AND coalesce(sum(i.effort_points), 0) > v_cycle.committed_points)
  FROM items i;
END;
$fn$;

GRANT EXECUTE ON FUNCTION delivery_cycle_status(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION delivery_cycle_status(uuid) IS
  'Avance de un ciclo de entrega. Excluye lo propuesto (sin comprometer) y lo cancelado (fuera de alcance) de ambos lados del cálculo, para que items_done/items_total y los puntos digan lo mismo.';

NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────────────────
-- ROLLBACK
-- ───────────────────────────────────────────────────────────────
-- Reaplicar la definición de 00074_portal_intake.sql (sección 1). No hay
-- datos que restaurar: la función solo lee.
