-- ---------------------------------------------------------------------------
-- 00086 · Abrir una espera, en minutos
-- ---------------------------------------------------------------------------
-- El parámetro pasa a llamarse p_target_minutes y su valor por defecto de
-- 1 (un día) pasa a 480 (una jornada). Sin esto, toda espera abierta sin
-- plazo explícito nacería con un minuto de plazo y saldría incumplida en la
-- bandeja del PM y en el portal del cliente.
--
-- Se borra primero porque cambia el nombre de un parámetro.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS open_phase_wait(uuid, text, text, sla_pause_reason, text, numeric, uuid, uuid);

CREATE OR REPLACE FUNCTION open_phase_wait(p_ticket_id uuid, p_what text, p_owed_by text, p_reason sla_pause_reason, p_owed_by_name text DEFAULT NULL::text, p_target_minutes numeric DEFAULT NULL::numeric, p_previous_wait_id uuid DEFAULT NULL::uuid, p_actor_agent_id uuid DEFAULT NULL::uuid)
 RETURNS phase_waits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ticket  tickets;
  v_log     ticket_phase_log;
  v_agent   agents;
  v_turn    smallint := 1;
  v_target  numeric;
  v_row     phase_waits;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id AND deleted_at IS NULL;
  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'El ticket % no existe', p_ticket_id;
  END IF;

  -- Solo trabajo de proyecto tiene fases, y por tanto esperas de fase. El
  -- CHECK de 00076 ya lo garantiza en la columna, pero aquí el mensaje de
  -- error dice qué pasó en vez de citar una restricción.
  IF v_ticket.requirement_phase IS NULL THEN
    RAISE EXCEPTION 'El ticket % no está en ninguna fase de requerimiento; las esperas de fase son del módulo de proyectos', p_ticket_id;
  END IF;

  -- El actor, igual que en accept_proposal (00074): por MCP auth.uid() es
  -- NULL porque se entra con service_role, así que se pasa explícito.
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
    RAISE EXCEPTION 'Solo el equipo puede registrar una espera';
  END IF;

  SELECT * INTO v_log
    FROM ticket_phase_log
   WHERE ticket_id = p_ticket_id AND exited_at IS NULL
   LIMIT 1;

  -- El turno siguiente al del turno anterior, si se encadena.
  IF p_previous_wait_id IS NOT NULL THEN
    SELECT turn_number + 1 INTO v_turn FROM phase_waits WHERE id = p_previous_wait_id;
    v_turn := coalesce(v_turn, 1);
  END IF;

  -- Sin plazo explícito, el del ida y vuelta: un día hábil, que son las 24
  -- horas que acordó el equipo para cada turno.
  -- 480 minutos = una jornada hábil. Era `1.0` cuando esto se medía en
  -- días; dejarlo así al pasar a minutos habría hecho que toda espera sin
  -- plazo explícito naciera con UN MINUTO y quedara incumplida enseguida.
  v_target := coalesce(p_target_minutes, 480);

  INSERT INTO phase_waits (
    tenant_id, ticket_id, phase_log_id, phase,
    what, owed_by, owed_by_name, reason, pauses_clock,
    target_minutes, previous_wait_id, turn_number,
    requested_by_user_id, requested_by_agent_id
  ) VALUES (
    v_ticket.tenant_id, p_ticket_id, v_log.id, v_ticket.requirement_phase,
    btrim(p_what), p_owed_by, p_owed_by_name, p_reason,
    sla_pause_reason_pauses(p_reason),
    v_target, p_previous_wait_id, v_turn,
    auth.uid(), v_agent.id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION open_phase_wait(uuid, text, text, sla_pause_reason, text, numeric, uuid, uuid)
  TO authenticated, service_role;
