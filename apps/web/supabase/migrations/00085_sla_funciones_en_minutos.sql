-- ---------------------------------------------------------------------------
-- 00085 · Las funciones del reloj, en minutos hábiles
-- ---------------------------------------------------------------------------
-- 00084 creó el calendario, la función de minutos y las columnas. Aquí las
-- funciones empiezan a usarlas.
--
-- LAS SALIDAS SE RENOMBRAN A PROPÓSITO: net_days → net_minutes, tdx_days →
-- tdx_minutes… Cambiar solo la escala y dejar el nombre dejaría que cualquier
-- consumidor sin migrar siguiera compilando y mostrara minutos bajo una
-- etiqueta que dice «días». Renombrando, lo que no se migre falla en
-- TypeScript, que es donde se quiere que falle.
--
-- Una jornada son 480 minutos (8 horas efectivas, almuerzo descontado).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. El trigger escribe minutos
-- ---------------------------------------------------------------------------
-- Sigue escribiendo también las columnas en días mientras el código viejo
-- conviva con el nuevo. Son dos escrituras baratas y evitan una ventana en la
-- que una pantalla sin migrar mostraría ceros.

CREATE OR REPLACE FUNCTION log_ticket_phase_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_open    ticket_phase_log;
  v_owner   text;
  v_target  numeric;
  v_size    effort_size;
BEGIN
  -- Cerrar el tramo anterior con sus días Y sus minutos.
  SELECT * INTO v_open
    FROM ticket_phase_log
   WHERE ticket_id = NEW.id AND exited_at IS NULL
   ORDER BY entered_at DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE ticket_phase_log
       SET exited_at = now(),
           business_days = working_days_between(
             NEW.tenant_id,
             (v_open.entered_at AT TIME ZONE 'America/Bogota')::date,
             (now() AT TIME ZONE 'America/Bogota')::date
           ),
           business_minutes = project_business_minutes(
             NEW.tenant_id, v_open.entered_at, now()
           )
     WHERE id = v_open.id;
  END IF;

  IF NEW.requirement_phase IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.owner INTO v_owner
    FROM delivery_phases p
   WHERE p.tenant_id = NEW.tenant_id AND p.phase = NEW.requirement_phase;
  v_owner := coalesce(v_owner, 'ninguno');

  v_size := NEW.effort_size;
  v_target := phase_target_days(
    NEW.tenant_id, NEW.organization_id, NEW.requirement_phase, v_size
  );

  INSERT INTO ticket_phase_log (
    tenant_id, ticket_id, phase, owner,
    target_days, target_minutes, effort_size, entered_at
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.requirement_phase, v_owner,
    v_target, v_target * 480, v_size, now()
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. ticket_phase_sla devuelve minutos
-- ---------------------------------------------------------------------------
-- Hay que borrarla antes: CREATE OR REPLACE no puede cambiar los nombres de
-- las columnas que devuelve.

DROP FUNCTION IF EXISTS ticket_phase_sla(uuid);

CREATE FUNCTION ticket_phase_sla(p_ticket_id uuid)
RETURNS TABLE (
  phase            requirement_phase,
  owner            text,
  entered_at       timestamptz,
  exited_at        timestamptz,
  is_open          boolean,
  business_minutes integer,
  paused_minutes   integer,
  net_minutes      integer,
  target_minutes   numeric,
  over_minutes     integer,
  breached         boolean,
  generates_credit boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH tramos AS (
    SELECT
      l.phase,
      l.owner,
      l.entered_at,
      l.exited_at,
      (l.exited_at IS NULL) AS is_open,
      -- Un tramo abierto se mide hasta ahora: el reloj sigue corriendo.
      -- Uno cerrado usa los minutos congelados al cerrarlo.
      coalesce(
        l.business_minutes,
        project_business_minutes(l.tenant_id, l.entered_at, now())
      ) AS brutos,
      l.paused_minutes,
      l.target_minutes,
      coalesce(p.generates_credit, false) AS generates_credit
    FROM ticket_phase_log l
    LEFT JOIN delivery_phases p
           ON p.tenant_id = l.tenant_id AND p.phase = l.phase
   WHERE l.ticket_id = p_ticket_id
  )
  SELECT
    t.phase,
    t.owner,
    t.entered_at,
    t.exited_at,
    t.is_open,
    t.brutos,
    t.paused_minutes,
    -- Lo que espera el cliente no se le imputa a TDX: es la cláusula del
    -- Anexo C, y por eso se descuenta antes de comparar con el plazo.
    greatest(t.brutos - t.paused_minutes, 0) AS net_minutes,
    t.target_minutes,
    CASE WHEN t.target_minutes IS NULL THEN NULL
         ELSE greatest(
           (greatest(t.brutos - t.paused_minutes, 0) - t.target_minutes)::integer, 0)
    END,
    CASE WHEN t.target_minutes IS NULL THEN NULL
         ELSE greatest(t.brutos - t.paused_minutes, 0) > t.target_minutes
    END,
    t.generates_credit
  FROM tramos t
  ORDER BY t.entered_at;
$$;

COMMENT ON FUNCTION ticket_phase_sla IS
  'Los tramos de un requerimiento en MINUTOS hábiles del calendario de '
  'proyectos. Una jornada son 480. net_minutes descuenta lo que estuvo en '
  'espera del cliente, que es lo que se compara con el plazo.';

-- ---------------------------------------------------------------------------
-- 3. requirement_delay suma minutos
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS requirement_delay(uuid);

CREATE FUNCTION requirement_delay(p_ticket_id uuid)
RETURNS TABLE (
  tdx_minutes     integer,
  cliente_minutes integer,
  tercero_minutes integer,
  tdx_over        integer,
  cliente_over    integer,
  exposed_over    integer,
  current_phase   requirement_phase,
  current_owner   text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT * FROM ticket_phase_sla(p_ticket_id))
  SELECT
    coalesce(sum(net_minutes)  FILTER (WHERE owner = 'tdx'), 0)::integer,
    coalesce(sum(net_minutes)  FILTER (WHERE owner = 'cliente'), 0)::integer,
    coalesce(sum(net_minutes)  FILTER (WHERE owner = 'tercero'), 0)::integer,
    coalesce(sum(over_minutes) FILTER (WHERE owner = 'tdx'), 0)::integer,
    coalesce(sum(over_minutes) FILTER (WHERE owner = 'cliente'), 0)::integer,
    -- Lo único que cuesta dinero: el atraso de TDX en una fase que genera
    -- crédito. El resto es información, no descuento.
    coalesce(
      sum(over_minutes) FILTER (WHERE owner = 'tdx' AND generates_credit), 0
    )::integer,
    -- La fase en curso y su dueño: los consume el tablero para pintar de
    -- quién es el reloj ahora mismo.
    (SELECT phase FROM s WHERE is_open ORDER BY entered_at DESC LIMIT 1),
    (SELECT owner FROM s WHERE is_open ORDER BY entered_at DESC LIMIT 1)
  FROM s;
$$;

COMMENT ON FUNCTION requirement_delay IS
  'El reloj de un requerimiento en MINUTOS hábiles, repartido por responsable. '
  'exposed_over es el atraso de TDX en fases que generan crédito.';

GRANT EXECUTE ON FUNCTION ticket_phase_sla(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION requirement_delay(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Las que consumen requirement_delay
-- ---------------------------------------------------------------------------
-- Al renombrar sus columnas, estas dejan de compilar. Es deliberado: así se
-- sabe exactamente quién la consumía.

DROP FUNCTION IF EXISTS cycle_sla_breaches(uuid);

CREATE FUNCTION cycle_sla_breaches(p_cycle_id uuid)
RETURNS TABLE (
  ticket_id       uuid,
  ticket_number   text,
  title           text,
  effort_size     effort_size,
  effort_points   integer,
  status          ticket_status,
  current_phase   requirement_phase,
  current_owner   text,
  tdx_minutes     integer,
  cliente_minutes integer,
  tercero_minutes integer,
  tdx_over        integer,
  cliente_over    integer,
  exposed_over    integer,
  is_delivered    boolean,
  member_count    integer,
  members_done    integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    t.id, t.ticket_number, t.title, t.effort_size, t.effort_points, t.status,
    d.current_phase, d.current_owner,
    d.tdx_minutes, d.cliente_minutes, d.tercero_minutes,
    d.tdx_over, d.cliente_over, d.exposed_over,
    (t.requirement_phase = 'entregado') AS is_delivered,
    (SELECT count(*)::integer FROM requirement_members m WHERE m.requirement_id = t.id),
    (SELECT count(*)::integer FROM requirement_members m
      WHERE m.requirement_id = t.id AND m.member_done)
  FROM tickets t
  CROSS JOIN LATERAL requirement_delay(t.id) d
 WHERE t.delivery_cycle_id = p_cycle_id
   AND t.deleted_at IS NULL
   AND t.status NOT IN ('proposed', 'cancelled')
   -- Los miembros no son entregables: el plazo es del padre.
   AND NOT EXISTS (
     SELECT 1 FROM ticket_relations r
      WHERE r.related_ticket_id = t.id AND r.relation_type = 'child'
   )
 ORDER BY d.exposed_over DESC, d.tdx_over DESC, t.ticket_number;
$$;

GRANT EXECUTE ON FUNCTION cycle_sla_breaches(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Las esperas, en minutos
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS open_phase_waits(uuid, uuid);

CREATE FUNCTION open_phase_waits(
  p_organization_id uuid DEFAULT NULL,
  p_project_id      uuid DEFAULT NULL
)
RETURNS TABLE (
  wait_id          uuid,
  ticket_id        uuid,
  ticket_number    text,
  ticket_title     text,
  organization_id  uuid,
  phase            requirement_phase,
  what             text,
  owed_by          text,
  owed_by_name     text,
  reason           sla_pause_reason,
  pauses_clock     boolean,
  requested_at     timestamptz,
  waiting_minutes  integer,
  target_minutes   numeric,
  over_minutes     integer,
  turn_number      smallint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    w.id, t.id, t.ticket_number, t.title, t.organization_id,
    w.phase, w.what, w.owed_by, w.owed_by_name, w.reason, w.pauses_clock,
    w.requested_at,
    project_business_minutes(w.tenant_id, w.requested_at, now()) AS waiting_minutes,
    w.target_minutes,
    CASE WHEN w.target_minutes IS NULL THEN NULL
         ELSE greatest(
           (project_business_minutes(w.tenant_id, w.requested_at, now())
            - w.target_minutes)::integer, 0)
    END AS over_minutes,
    w.turn_number
  FROM phase_waits w
  JOIN tickets t ON t.id = w.ticket_id
 WHERE w.received_at IS NULL
   AND t.deleted_at IS NULL
   AND (p_organization_id IS NULL OR t.organization_id = p_organization_id)
   AND (p_project_id IS NULL OR t.project_id = p_project_id)
 -- Lo que lleva más tiempo esperando, primero.
 ORDER BY w.requested_at;
$$;

GRANT EXECUTE ON FUNCTION open_phase_waits(uuid, uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS organization_delay_summary(uuid);

CREATE FUNCTION organization_delay_summary(p_organization_id uuid)
RETURNS TABLE (
  open_requirements   integer,
  tdx_delay_minutes   integer,
  client_delay_minutes integer,
  third_party_minutes integer,
  exposed_credits     integer,
  items_at_risk       integer,
  open_waits          integer,
  oldest_wait_minutes integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT count(*)::integer AS n, max(waiting_minutes)::integer AS mx
      FROM open_phase_waits(p_organization_id)
  )
  SELECT
    (SELECT count(*)::integer FROM req),
    (SELECT coalesce(sum(tdx_minutes), 0)::integer FROM req),
    (SELECT coalesce(sum(cliente_minutes), 0)::integer FROM req),
    (SELECT coalesce(sum(tercero_minutes), 0)::integer FROM req),
    (SELECT coalesce(sum(effort_points) FILTER (WHERE exposed_over > 0), 0)::integer FROM req),
    (SELECT count(*) FILTER (WHERE exposed_over > 0)::integer FROM req),
    (SELECT n FROM w),
    (SELECT coalesce(mx, 0) FROM w);
$$;

GRANT EXECUTE ON FUNCTION organization_delay_summary(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Cerrar una espera descuenta minutos
-- ---------------------------------------------------------------------------
-- El tope por la duración del tramo se conserva: una espera registrada con
-- fecha anterior a la entrada en la fase no puede descontar más de lo que el
-- tramo duró.

CREATE OR REPLACE FUNCTION close_phase_wait(p_wait_id uuid, p_note text DEFAULT NULL::text, p_received_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_open_return_wait text DEFAULT NULL::text, p_actor_agent_id uuid DEFAULT NULL::uuid)
 RETURNS phase_waits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_wait  phase_waits;
  v_agent agents;
  v_when  timestamptz;
  v_days  integer;  -- minutos hábiles, pese al nombre heredado
  v_log   ticket_phase_log;
  v_tramo_dias integer;
BEGIN
  SELECT * INTO v_wait FROM phase_waits WHERE id = p_wait_id;
  IF v_wait.id IS NULL THEN
    RAISE EXCEPTION 'La espera % no existe', p_wait_id;
  END IF;
  IF v_wait.received_at IS NOT NULL THEN
    RAISE EXCEPTION 'La espera % ya se cerró el %', p_wait_id, v_wait.received_at;
  END IF;

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
    RAISE EXCEPTION 'Solo el equipo puede cerrar una espera';
  END IF;

  -- Se admite una fecha pasada porque el PM suele registrar la llegada
  -- después de que ocurrió. Nunca antes de pedirlo ni en el futuro.
  v_when := coalesce(p_received_at, now());
  IF v_when < v_wait.requested_at THEN
    RAISE EXCEPTION 'La respuesta no puede llegar antes de pedirse (% < %)', v_when, v_wait.requested_at;
  END IF;
  IF v_when > now() THEN
    v_when := now();
  END IF;

  v_days := project_business_minutes(
    v_wait.tenant_id, v_wait.requested_at, v_when
  );

  UPDATE phase_waits
     SET received_at = v_when,
         business_minutes = v_days,
         received_note = p_note
   WHERE id = p_wait_id
  RETURNING * INTO v_wait;

  -- Acumular los días en el tramo de fase, solo si la espera pausa. Es lo
  -- que hace que ticket_phase_sla reste esos minutos del reloj: la extensión
  -- del contrato, medida en horas hábiles.
  IF v_wait.pauses_clock AND v_wait.phase_log_id IS NOT NULL THEN
    -- ACOTADO A LA DURACIÓN DEL TRAMO. Una espera puede registrarse con
    -- fecha anterior a la entrada en la fase: el PM apunta el lunes algo
    -- que pidió la semana pasada, o la espera arrancó en la fase previa.
    -- Sin este tope, paused_days podría superar los días del propio tramo
    -- y quedar un dato incoherente ("se pausaron 6 días dentro de un tramo
    -- de 1"). ticket_phase_sla lo taparía con greatest(…, 0), pero el dato
    -- almacenado seguiría siendo falso, y es el que se audita.
    --
    -- Nunca se descuenta más de lo que el tramo duró, así que el reloj no
    -- puede quedar en negativo ni regalar días que no existieron.
    SELECT * INTO v_log FROM ticket_phase_log WHERE id = v_wait.phase_log_id;

    v_tramo_dias := project_business_minutes(
      v_log.tenant_id, v_log.entered_at, coalesce(v_log.exited_at, now())
    );

    UPDATE ticket_phase_log
       SET paused_minutes = least(paused_minutes + v_days, v_tramo_dias)
     WHERE id = v_wait.phase_log_id;
  END IF;

  -- El turno de vuelta: se cierra el del cliente y se abre el nuestro.
  IF p_open_return_wait IS NOT NULL AND btrim(p_open_return_wait) <> '' THEN
    PERFORM open_phase_wait(
      v_wait.ticket_id,
      btrim(p_open_return_wait),
      CASE WHEN v_wait.owed_by = 'tdx' THEN 'cliente' ELSE 'tdx' END,
      v_wait.reason,
      NULL,
      v_wait.target_minutes,
      v_wait.id,
      v_agent.id
    );
  END IF;

  RETURN v_wait;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. El cumplimiento del ciclo suma minutos
-- ---------------------------------------------------------------------------
-- Solo cambian los tres sum() y los nombres de salida. El cálculo del
-- descuento NO se toca: sigue siendo por créditos expuestos, no por tiempo.

DROP FUNCTION IF EXISTS cycle_delivery_compliance(uuid);

CREATE FUNCTION cycle_delivery_compliance(p_cycle_id uuid)
 RETURNS TABLE(cycle_id uuid, cycle_number integer, cycle_label text, is_closed boolean, organization_id uuid, plan_name text, plan_credits integer, plan_fee_cop numeric, credit_value_cop numeric, committed_credits integer, delivered_credits integer, pending_credits integer, items_total integer, items_delivered integer, delivery_pct numeric, below_threshold boolean, retention_threshold numeric, breached_items integer, exposed_credits integer, discount_cop numeric, discount_capped boolean, tdx_delay_minutes integer, client_delay_minutes integer, third_party_minutes integer, basis text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    coalesce(sum(b.tdx_minutes), 0)::integer,
    coalesce(sum(b.cliente_minutes), 0)::integer,
    coalesce(sum(b.tercero_minutes), 0)::integer
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
$function$;

GRANT EXECUTE ON FUNCTION close_phase_wait(uuid, text, timestamptz, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cycle_delivery_compliance(uuid) TO authenticated, service_role;
