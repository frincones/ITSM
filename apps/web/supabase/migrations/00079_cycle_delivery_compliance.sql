-- ═══════════════════════════════════════════════════════════════
-- 00079 · Cumplimiento del ciclo y descuento (Fase D)
-- ═══════════════════════════════════════════════════════════════
--
-- La pieza que convierte los tramos de fase en una cifra de dinero.
-- Implementa el remedio económico del Anexo C:
--
--   ≥ 50% y < 100% entregado  ->  se factura con descuento del valor no
--                                 entregado
--   < 50% entregado           ->  PODENZA puede retener el pago del ciclo
--
-- Y la fórmula del descuento:
--
--   (valor mensual ÷ créditos del plan) × créditos del ítem incumplido
--
-- con el tope de que el descuento de un ciclo nunca excede el valor del
-- ciclo.
--
-- ───────────────────────────────────────────────────────────────
-- LAS DOS REGLAS QUE GOBIERNAN TODO
-- ───────────────────────────────────────────────────────────────
-- 1. "El reloj de la Fase 3 no arranca hasta que las fases 1 y 2 estén
--     completas." -> ya resuelto por el modelo de tramos: la fase de
--     desarrollo tiene su propio tramo, que empieza cuando el ítem entra en
--     ella. Lo que pasó antes está en otros tramos, con otro responsable.
--
-- 2. "Los atrasos de PODENZA, de terceros o por fuerza mayor extienden el
--     plazo de TDX día por día, sin penalización." -> ya resuelto por
--     paused_days (00078): net_days descuenta las esperas, y solo net_days
--     se compara con el plazo.
--
-- Por eso esta migración solo SUMA lo que las anteriores ya midieron. No
-- vuelve a interpretar el contrato: lee requirement_delay() y aplica la
-- fórmula.
--
-- ───────────────────────────────────────────────────────────────
-- SOLO EL ATRASO DE TDX CUESTA DINERO
-- ───────────────────────────────────────────────────────────────
-- `exposed_over` de requirement_delay() (00077) ya filtra por dos
-- condiciones a la vez: owner = 'tdx' Y la fase marcada generates_credit en
-- el catálogo, que hoy es solo 'desarrollo'.
--
-- Un ítem que se atrasó 11 días esperando al cliente y 2 por culpa nuestra
-- expone 2, no 13. Esa es la mitad de la historia que el equipo quería
-- poder defender.
--
-- ───────────────────────────────────────────────────────────────
-- QUÉ NO TOCA
-- ───────────────────────────────────────────────────────────────
-- No se modifica support_cycle_compliance() ni ninguna función de
-- 00047-00063. Esa mide el SLA de RESPUESTA de soporte y su crédito ya se
-- factura; esta mide el SLA de ENTREGA por fases. Dos funciones separadas
-- que nadie confunda, no una que haga las dos cosas.
--
-- Nombres deliberadamente distintos para que no se mezclen al leer código:
--   support_cycle_compliance   -> soporte, por ticket, SLA de respuesta
--   cycle_delivery_compliance  -> proyectos, por crédito, SLA de fases
--
-- Verificar antes y después:
--   node scripts/mcp/baseline-soporte.mjs --esperado
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. FUNCIÓN: el plan de entrega vigente de una organización
-- ---------------------------------------------------------------
-- Resuelve la vigencia de billing_plans (00076). Devuelve la fila completa
-- o nada: sin plan no hay descuento que calcular, y es mejor decirlo que
-- inventarse un valor por crédito.

CREATE OR REPLACE FUNCTION billing_plan_at(
  p_organization_id uuid,
  p_at              date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS billing_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT *
    FROM billing_plans
   WHERE organization_id = p_organization_id
     AND effective_from <= p_at
     AND (effective_to IS NULL OR effective_to >= p_at)
   ORDER BY effective_from DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION billing_plan_at(uuid, date) IS
  'El plan de entrega por créditos vigente en una fecha. Mismo patrón que support_contract_at (00048): la vigencia se resuelve por fecha, así que el cambio Enterprise -> Growth no recalcula los ciclos ya medidos.';

GRANT EXECUTE ON FUNCTION billing_plan_at(uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. FUNCIÓN: qué rompió plazo en un ciclo, y de quién es
-- ---------------------------------------------------------------
-- El detalle que alimenta la tabla de la pantalla interna: un renglón por
-- ítem del ciclo con su atraso separado por responsable.

CREATE OR REPLACE FUNCTION cycle_sla_breaches(p_cycle_id uuid)
RETURNS TABLE (
  ticket_id      uuid,
  ticket_number  text,
  title          text,
  effort_size    effort_size,
  effort_points  integer,
  status         ticket_status,
  current_phase  requirement_phase,
  current_owner  text,
  tdx_days       integer,
  cliente_days   integer,
  tercero_days   integer,
  tdx_over       integer,
  cliente_over   integer,
  exposed_over   integer,
  is_delivered   boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.ticket_number,
    t.title,
    t.effort_size,
    t.effort_points,
    t.status,
    d.current_phase,
    d.current_owner,
    d.tdx_days,
    d.cliente_days,
    d.tercero_days,
    d.tdx_over,
    d.cliente_over,
    d.exposed_over,
    -- Entregado según la FASE, no según el estado del ticket: el contrato
    -- habla de fases. Un ítem en fase 'entregado' está entregado aunque su
    -- ticket siga abierto por un detalle administrativo.
    (t.requirement_phase = 'entregado') AS is_delivered
  FROM tickets t
  CROSS JOIN LATERAL requirement_delay(t.id) d
 WHERE t.delivery_cycle_id = p_cycle_id
   AND t.deleted_at IS NULL
   -- Lo propuesto no es trabajo comprometido, y lo cancelado salió del
   -- alcance. Mismo criterio que delivery_cycle_status tras 00075.
   AND t.status NOT IN ('proposed', 'cancelled')
 ORDER BY d.exposed_over DESC, d.tdx_over DESC, t.ticket_number;
$$;

COMMENT ON FUNCTION cycle_sla_breaches(uuid) IS
  'Un renglón por ítem del ciclo con su atraso separado por responsable, ordenado por lo que más expone. exposed_over es lo único que puede costar dinero: atraso de TDX en una fase que genera descuento.';

GRANT EXECUTE ON FUNCTION cycle_sla_breaches(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. FUNCIÓN: el cumplimiento del ciclo y el descuento
-- ---------------------------------------------------------------
-- LA función. La leen la pantalla interna y el portal del cliente, para que
-- los números no puedan discrepar: un solo cálculo, dos lectores.

CREATE OR REPLACE FUNCTION cycle_delivery_compliance(p_cycle_id uuid)
RETURNS TABLE (
  cycle_id            uuid,
  cycle_number        integer,
  cycle_label         text,
  is_closed           boolean,
  organization_id     uuid,

  plan_name           text,
  plan_credits        integer,
  plan_fee_cop        numeric,
  credit_value_cop    numeric,   -- valor mensual ÷ créditos del plan

  committed_credits   integer,   -- lo comprometido para el ciclo
  delivered_credits   integer,   -- lo que llegó a fase 'entregado'
  pending_credits     integer,
  items_total         integer,
  items_delivered     integer,

  delivery_pct        numeric,   -- NULL si no hay nada comprometido
  below_threshold     boolean,   -- por debajo del umbral del Anexo C
  retention_threshold numeric,

  breached_items      integer,   -- ítems con atraso imputable a TDX
  exposed_credits     integer,   -- créditos de esos ítems
  discount_cop        numeric,   -- el descuento, ya topado
  discount_capped     boolean,   -- si el tope lo recortó

  tdx_delay_days      integer,
  client_delay_days   integer,
  third_party_days    integer,
  basis               text       -- en una frase, de dónde sale la cifra
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cycle   delivery_cycles;
  v_org     uuid;
  v_plan    billing_plans;
  v_unit    numeric;
  v_commit  integer;
  v_deliv   integer := 0;
  v_pend    integer := 0;
  v_items   integer := 0;
  v_done    integer := 0;
  v_breach  integer := 0;
  v_exposed integer := 0;
  v_tdx     integer := 0;
  v_cli     integer := 0;
  v_ter     integer := 0;
  v_pct     numeric;
  v_disc    numeric := 0;
  v_capped  boolean := false;
  v_below   boolean := false;
  v_thresh  numeric;
  v_basis   text;
  v_label   text;
BEGIN
  SELECT * INTO v_cycle FROM delivery_cycles WHERE id = p_cycle_id;
  IF v_cycle.id IS NULL THEN RETURN; END IF;

  SELECT p.organization_id INTO v_org FROM projects p WHERE p.id = v_cycle.project_id;

  -- El plan vigente al CIERRE del ciclo, no hoy: un ciclo de octubre se
  -- mide con el plan que regía en octubre, aunque hoy sea otro. Es lo que
  -- hace que el cambio Enterprise -> Growth no reescriba el pasado.
  v_plan := billing_plan_at(v_org, v_cycle.ends_on);

  v_label := coalesce(
    v_cycle.name,
    'Ciclo ' || v_cycle.cycle_number
  ) || ' (' || to_char(v_cycle.starts_on, 'DD-Mon-YYYY')
            || ' → ' || to_char(v_cycle.ends_on, 'DD-Mon-YYYY') || ')';

  -- Agregar el detalle de cycle_sla_breaches: una sola pasada.
  SELECT
    count(*)::integer,
    coalesce(sum(b.effort_points) FILTER (WHERE b.is_delivered), 0)::integer,
    coalesce(sum(b.effort_points) FILTER (WHERE NOT b.is_delivered), 0)::integer,
    count(*) FILTER (WHERE b.is_delivered)::integer,
    count(*) FILTER (WHERE b.exposed_over > 0)::integer,
    coalesce(sum(b.effort_points) FILTER (WHERE b.exposed_over > 0), 0)::integer,
    coalesce(sum(b.tdx_days), 0)::integer,
    coalesce(sum(b.cliente_days), 0)::integer,
    coalesce(sum(b.tercero_days), 0)::integer
  INTO v_items, v_deliv, v_pend, v_done, v_breach, v_exposed, v_tdx, v_cli, v_ter
  FROM cycle_sla_breaches(p_cycle_id) b;

  -- Lo comprometido: lo pactado al planificar si existe; si no, lo que
  -- realmente se metió en el ciclo. Sin compromiso declarado no se puede
  -- hablar de incumplimiento, así que el porcentaje queda NULL.
  v_commit := v_cycle.committed_points;

  IF v_commit IS NOT NULL AND v_commit > 0 THEN
    v_pct := round((v_deliv::numeric / v_commit) * 100, 1);
  ELSE
    v_pct := NULL;
  END IF;

  v_thresh := coalesce(v_plan.retention_threshold_pct, 50);
  v_below  := (v_pct IS NOT NULL AND v_pct < v_thresh);

  -- El descuento. Sin plan no se calcula: decirlo es más honesto que
  -- inventarse un valor por crédito.
  IF v_plan.id IS NULL THEN
    v_unit := NULL;
    v_disc := NULL;
    v_basis := 'Sin plan de entrega vigente para la organización: no se puede calcular el descuento. Cargar el plan en billing_plans.';
  ELSE
    v_unit := round(v_plan.monthly_fee_cop / v_plan.monthly_credits, 2);
    v_disc := round(v_unit * v_exposed, 2);

    -- El tope del contrato: el descuento de un ciclo nunca excede el valor
    -- del ciclo.
    IF v_disc > v_plan.monthly_fee_cop THEN
      v_disc := v_plan.monthly_fee_cop;
      v_capped := true;
    END IF;

    v_basis := CASE
      WHEN v_exposed = 0 AND v_pct IS NULL THEN
        'Sin compromiso declarado para el ciclo y sin atraso imputable a TDX.'
      WHEN v_exposed = 0 THEN
        format('Entregado %s%% de lo comprometido, sin atraso imputable a TDX. Sin descuento.', v_pct)
      ELSE
        format('%s crédito(s) con atraso imputable a TDX × %s por crédito%s.',
               v_exposed,
               to_char(v_unit, 'FM999G999G999D00'),
               CASE WHEN v_capped THEN ', topado al valor del ciclo' ELSE '' END)
    END;

    IF v_below THEN
      v_basis := v_basis || format(' Por debajo del umbral del %s%%: el cliente puede retener el pago del ciclo.', v_thresh);
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_cycle.id,
    v_cycle.cycle_number,
    v_label,
    (v_cycle.status = 'closed'),
    v_org,
    v_plan.plan_name,
    v_plan.monthly_credits,
    v_plan.monthly_fee_cop,
    v_unit,
    v_commit,
    v_deliv,
    v_pend,
    v_items,
    v_done,
    v_pct,
    v_below,
    v_thresh,
    v_breach,
    v_exposed,
    v_disc,
    v_capped,
    v_tdx,
    v_cli,
    v_ter,
    v_basis;
END;
$fn$;

COMMENT ON FUNCTION cycle_delivery_compliance(uuid) IS
  'Cumplimiento de entrega de un ciclo y el descuento del Anexo C. Solo el atraso imputable a TDX en fases que generan crédito entra en el cálculo: los atrasos del cliente ya se descontaron vía paused_days. La leen la pantalla interna y el portal, para que los números del cliente no puedan discrepar de los nuestros.';

GRANT EXECUTE ON FUNCTION cycle_delivery_compliance(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. FUNCIÓN: el resumen de atrasos de una organización
-- ---------------------------------------------------------------
-- Las tarjetas de arriba de las dos pantallas: cuántos días lleva cada
-- parte y qué está expuesto, sin tener que recorrer ciclo por ciclo.

CREATE OR REPLACE FUNCTION organization_delay_summary(
  p_organization_id uuid
)
RETURNS TABLE (
  open_requirements   integer,
  tdx_delay_days      integer,
  client_delay_days   integer,
  third_party_days    integer,
  exposed_credits     integer,
  items_at_risk       integer,
  open_waits          integer,
  oldest_wait_days    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH req AS (
    SELECT t.id, t.effort_points, d.*
      FROM tickets t
      CROSS JOIN LATERAL requirement_delay(t.id) d
     WHERE t.organization_id = p_organization_id
       AND t.deleted_at IS NULL
       AND t.requirement_phase IS NOT NULL
       AND t.requirement_phase NOT IN ('entregado', 'descartado')
  ),
  w AS (
    SELECT count(*)::integer AS n, max(waiting_days)::integer AS mx
      FROM open_phase_waits(p_organization_id)
  )
  SELECT
    (SELECT count(*)::integer FROM req),
    (SELECT coalesce(sum(tdx_days), 0)::integer FROM req),
    (SELECT coalesce(sum(cliente_days), 0)::integer FROM req),
    (SELECT coalesce(sum(tercero_days), 0)::integer FROM req),
    (SELECT coalesce(sum(effort_points) FILTER (WHERE exposed_over > 0), 0)::integer FROM req),
    (SELECT count(*) FILTER (WHERE exposed_over > 0)::integer FROM req),
    (SELECT n FROM w),
    (SELECT coalesce(mx, 0) FROM w);
$$;

COMMENT ON FUNCTION organization_delay_summary(uuid) IS
  'Las cifras de cabecera de las dos pantallas: días de atraso por responsable, créditos expuestos y esperas abiertas de una organización. Cuenta solo requerimientos vivos: lo entregado y lo descartado ya no consumen reloj.';

GRANT EXECUTE ON FUNCTION organization_delay_summary(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────────────────
-- NOTA SOBRE EL CONGELADO AL CERRAR
-- ───────────────────────────────────────────────────────────────
-- closeCycle() (lib/domain/delivery.domain.ts) ya congela delivered_points
-- en la fila del ciclo. Esta función recalcula en vivo, lo que es correcto
-- mientras el ciclo está abierto.
--
-- Para un ciclo cerrado conviene que el número no se mueva nunca más, como
-- hace support_cycle_closures (00058) con los de soporte. Eso es trabajo de
-- la fase G, cuando se decida el plan de Podenza: congelar hoy una cifra
-- calculada sin plan vigente guardaría un NULL para siempre.
--
-- ───────────────────────────────────────────────────────────────
-- ROLLBACK
-- ───────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS organization_delay_summary(uuid);
-- DROP FUNCTION IF EXISTS cycle_delivery_compliance(uuid);
-- DROP FUNCTION IF EXISTS cycle_sla_breaches(uuid);
-- DROP FUNCTION IF EXISTS billing_plan_at(uuid, date);
--
-- Solo lectura: ninguna escribe. Revertir no pierde datos.
