-- ═══════════════════════════════════════════════════════════════
-- 00078 · Gestión de esperas (Fase C del módulo de proyectos)
-- ═══════════════════════════════════════════════════════════════
--
-- Lo que pidió el equipo, en sus palabras (16-oct-2026):
--
--   "el dolor mayor que tenemos es que Podenza se demora mucho en aprobar
--    un documento funcional (...) y el PM asignado debe lograr revisarlos,
--    gestionarlos y usar la herramienta para decir ya recibimos o cuándo
--    recibimos la respuesta"
--
-- Esta migración es esa herramienta: el PM registra qué pidió, a quién y
-- cuándo, y luego marca "ya llegó". Mientras no llegue, el reloj de TDX
-- está pausado y el del cliente corriendo.
--
-- ───────────────────────────────────────────────────────────────
-- POR QUÉ HACE FALTA, MEDIDO
-- ───────────────────────────────────────────────────────────────
-- El mecanismo de pausa de soporte (00048) ya existe y funciona, pero
-- nadie lo usa. De 221 pausas registradas en el historial:
--
--   209   sin motivo              pausa = false
--     8   espera_cliente_validacion  pausa = true
--     4   priorizacion_interna       pausa = false
--
-- 209 de 221 no dicen por qué el ticket está parado, así que hoy es
-- imposible responder "¿este atraso es de TDX o de Podenza?". Y por diseño
-- conservador de 00048, una pausa sin justificar NO para el reloj: corre
-- contra nosotros.
--
-- En proyectos el motivo es obligatorio (NOT NULL), porque sin él el
-- cálculo del Anexo C no sirve para nada.
--
-- ───────────────────────────────────────────────────────────────
-- EL IDA Y VUELTA DE LA FASE 1
-- ───────────────────────────────────────────────────────────────
-- El proceso real, según el equipo:
--
--   "Primero se agenda, luego se tiene la reunión de levantamiento, se
--    genera el documento, y luego que se genera el documento se hace una
--    serie de revisiones. (...) le mandamos la primera versión al cliente.
--    Y luego (...) es posible que nos la devuelva con comentarios. Y en ese
--    ida y vuelta máximo son 24 horas para responder cada uno."
--
-- No es un plazo único: son turnos alternados con 24 horas cada uno. Cada
-- turno es una fila:
--
--   TDX manda la v1       -> espera a cargo del cliente, 24h
--   el cliente comenta    -> se cierra la suya, se abre la de TDX, 24h
--   TDX manda la v2       -> vuelve a abrirse la del cliente
--
-- Así queda registrado si el cliente tardó cinco días cuando tenía uno, y
-- también si fuimos nosotros los que nos demoramos.
--
-- ───────────────────────────────────────────────────────────────
-- QUÉ NO TOCA
-- ───────────────────────────────────────────────────────────────
-- Nada del SLA de soporte (00047-00063). No se modifica
-- resolve_pause_reason, ni ticket_paused_business_minutes, ni
-- ticket_status_history: el reloj de respuesta de soporte sigue
-- funcionando exactamente igual.
--
-- Esta tabla pausa el reloj de FASES, que es otro mecanismo sobre otro
-- tipo de trabajo. Se reutiliza el enum sla_pause_reason (00048) en vez de
-- crear otro, porque sus seis valores ya mapean a cláusulas del contrato y
-- el equipo los aprobó tal cual.
--
-- Verificar antes y después:
--   node scripts/mcp/baseline-soporte.mjs --esperado
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLA: phase_waits
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phase_waits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  -- El tramo de fase en el que se abrió la espera. Permite imputar los días
  -- al tramo correcto cuando el ítem ya avanzó de fase.
  phase_log_id  uuid REFERENCES ticket_phase_log(id) ON DELETE SET NULL,
  phase         requirement_phase NOT NULL,

  -- Qué se pidió, en palabras del PM. Es lo que ve el cliente en el portal,
  -- así que se escribe para que lo entienda: "las credenciales del API del
  -- banco", no "cred_api_bank".
  what          text NOT NULL CHECK (btrim(what) <> ''),
  -- De quién se espera. Determina a quién se le imputan los días.
  owed_by       text NOT NULL CHECK (owed_by IN ('cliente','tercero','tdx')),
  -- A quién concretamente se le pidió, cuando se sabe. Texto libre porque
  -- puede ser alguien ajeno al sistema (el banco, un proveedor).
  owed_by_name  text,

  -- El motivo contractual. OBLIGATORIO, al contrario que en soporte: sin
  -- él no se puede defender la pausa ante el cliente.
  reason        sla_pause_reason NOT NULL,
  -- ¿Esta espera para el reloj? Se deriva del motivo con la función de
  -- 00048, así que 'priorizacion_interna' registra la espera pero NO la
  -- descuenta: aparcar algo por decisión nuestra no es culpa de nadie más.
  pauses_clock  boolean NOT NULL DEFAULT true,

  requested_at  timestamptz NOT NULL DEFAULT now(),
  -- NULL = seguimos esperando. Lo rellena el botón "ya llegó".
  received_at   timestamptz,
  -- El plazo del turno, en días hábiles. Para el ida y vuelta de la fase 1
  -- es 1 (las 24 horas que acordó el equipo).
  target_days   numeric(5,2),
  -- Días hábiles que costó, calculados al cerrarla.
  business_days integer,

  -- Para el ida y vuelta: enlaza el turno con el anterior, de modo que se
  -- pueda reconstruir la conversación completa.
  previous_wait_id uuid REFERENCES phase_waits(id) ON DELETE SET NULL,
  -- Número de turno dentro de la misma conversación (v1, v2, v3...).
  turn_number   smallint NOT NULL DEFAULT 1 CHECK (turn_number > 0),

  requested_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  received_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (received_at IS NULL OR received_at >= requested_at)
);

COMMENT ON TABLE phase_waits IS
  'Esperas abiertas y cerradas de cada requerimiento: qué se pidió, a quién y cuándo, y cuándo llegó. Mientras received_at sea NULL el reloj de la parte responsable está corriendo. Es el registro del ida y vuelta de la fase de documentación, con un turno por fila.';

COMMENT ON COLUMN phase_waits.reason IS
  'Motivo contractual, obligatorio. Reutiliza el catálogo de 00048 (cláusula 4 del contrato de soporte) porque sus valores ya mapean a las causas que el Anexo C reconoce. En soporte el motivo es opcional y 209 de 221 pausas van sin él; aquí no se permite.';

COMMENT ON COLUMN phase_waits.pauses_clock IS
  'Si esta espera descuenta días del reloj. Se deriva del motivo: priorizacion_interna registra la espera pero no la descuenta, porque aparcar algo por decisión propia no es atraso de nadie más.';

COMMENT ON COLUMN phase_waits.turn_number IS
  'Turno dentro de una misma conversación. El ida y vuelta de la fase 1 tiene 24h por turno: v1 al cliente (turno 1), comentarios de vuelta (turno 2), v2 al cliente (turno 3).';

-- Las esperas abiertas, que es lo que mira el PM cada mañana.
CREATE INDEX IF NOT EXISTS idx_phase_waits_open
  ON phase_waits (tenant_id, owed_by, requested_at)
  WHERE received_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_phase_waits_ticket
  ON phase_waits (ticket_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase_waits_log
  ON phase_waits (phase_log_id)
  WHERE phase_log_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON phase_waits;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON phase_waits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE phase_waits ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_waits FORCE ROW LEVEL SECURITY;

-- El cliente VE las esperas de sus requerimientos: es lo que pidió el
-- portal ("qué está esperando de ellos, con los días que lleva
-- esperando"). Ver lo que se le pidió es la mitad de poder responderlo.
DROP POLICY IF EXISTS phase_waits_select ON phase_waits;
CREATE POLICY phase_waits_select ON phase_waits
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = phase_waits.ticket_id
        AND (is_staff_agent() OR has_org_access(t.organization_id))
    )
  );

-- Registrar y cerrar esperas es del equipo. Un cliente no puede declarar
-- que ya entregó algo: eso lo confirma el PM, que es quien lo recibe.
DROP POLICY IF EXISTS phase_waits_write ON phase_waits;
CREATE POLICY phase_waits_write ON phase_waits
  FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent())
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- 2. FUNCIÓN: abrir una espera
-- ---------------------------------------------------------------
-- El PM dice "pedí X a Y". La función resuelve el tramo de fase actual, el
-- motivo y si pausa, y encadena el turno con el anterior si lo hay.

CREATE OR REPLACE FUNCTION open_phase_wait(
  p_ticket_id   uuid,
  p_what        text,
  p_owed_by     text,
  p_reason      sla_pause_reason,
  p_owed_by_name text DEFAULT NULL,
  p_target_days numeric DEFAULT NULL,
  p_previous_wait_id uuid DEFAULT NULL,
  p_actor_agent_id uuid DEFAULT NULL
)
RETURNS phase_waits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
  v_target := coalesce(p_target_days, 1.0);

  INSERT INTO phase_waits (
    tenant_id, ticket_id, phase_log_id, phase,
    what, owed_by, owed_by_name, reason, pauses_clock,
    target_days, previous_wait_id, turn_number,
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
$fn$;

COMMENT ON FUNCTION open_phase_wait(uuid, text, text, sla_pause_reason, text, numeric, uuid, uuid) IS
  'Registra que se pidió algo y se está esperando. Deriva de sla_pause_reason_pauses si la espera descuenta días, y encadena el turno con el anterior para reconstruir el ida y vuelta. El plazo por defecto es 1 día hábil: las 24 horas por turno del proceso de documentación.';

GRANT EXECUTE ON FUNCTION open_phase_wait(uuid, text, text, sla_pause_reason, text, numeric, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. FUNCIÓN: cerrar una espera — el botón "ya llegó"
-- ---------------------------------------------------------------
-- Calcula los días hábiles que costó y los acumula en paused_days del
-- tramo de fase, que es lo que descuenta ticket_phase_sla (00077).
--
-- `p_open_return_wait` implementa el ida y vuelta: al recibir los
-- comentarios del cliente se cierra su turno y se abre el nuestro en la
-- misma operación, que es como ocurre en la realidad.

CREATE OR REPLACE FUNCTION close_phase_wait(
  p_wait_id     uuid,
  p_note        text DEFAULT NULL,
  p_received_at timestamptz DEFAULT NULL,
  p_open_return_wait text DEFAULT NULL,
  p_actor_agent_id uuid DEFAULT NULL
)
RETURNS phase_waits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_wait  phase_waits;
  v_agent agents;
  v_when  timestamptz;
  v_days  integer;
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

  v_days := working_days_between(
    v_wait.tenant_id,
    (v_wait.requested_at AT TIME ZONE 'America/Bogota')::date,
    (v_when AT TIME ZONE 'America/Bogota')::date
  );

  UPDATE phase_waits
     SET received_at = v_when,
         business_days = v_days,
         received_note = p_note
   WHERE id = p_wait_id
  RETURNING * INTO v_wait;

  -- Acumular los días en el tramo de fase, solo si la espera pausa. Es lo
  -- que hace que ticket_phase_sla reste esos días del reloj — la extensión
  -- "día por día" del contrato.
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

    v_tramo_dias := working_days_between(
      v_log.tenant_id,
      (v_log.entered_at AT TIME ZONE 'America/Bogota')::date,
      (coalesce(v_log.exited_at, now()) AT TIME ZONE 'America/Bogota')::date
    );

    UPDATE ticket_phase_log
       SET paused_days = least(paused_days + v_days, v_tramo_dias)
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
      v_wait.target_days,
      v_wait.id,
      v_agent.id
    );
  END IF;

  RETURN v_wait;
END;
$fn$;

COMMENT ON FUNCTION close_phase_wait(uuid, text, timestamptz, text, uuid) IS
  'El botón "ya llegó": cierra la espera, calcula sus días hábiles y los acumula en paused_days del tramo de fase, que es lo que descuenta el reloj. Con p_open_return_wait abre el turno de vuelta en la misma operación, invirtiendo quién debe.';

GRANT EXECUTE ON FUNCTION close_phase_wait(uuid, text, timestamptz, text, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. FUNCIÓN: las esperas abiertas — la bandeja del PM
-- ---------------------------------------------------------------
-- Lo que mira el PM cada mañana, ordenado por lo que lleva más tiempo
-- esperando. Es el panel "Esperas abiertas" de la pantalla interna.

CREATE OR REPLACE FUNCTION open_phase_waits(
  p_organization_id uuid DEFAULT NULL,
  p_project_id      uuid DEFAULT NULL
)
RETURNS TABLE (
  wait_id       uuid,
  ticket_id     uuid,
  ticket_number text,
  ticket_title  text,
  organization_id uuid,
  phase         requirement_phase,
  what          text,
  owed_by       text,
  owed_by_name  text,
  reason        sla_pause_reason,
  pauses_clock  boolean,
  requested_at  timestamptz,
  waiting_days  integer,
  target_days   numeric,
  over_days     integer,
  turn_number   smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    w.id,
    t.id,
    t.ticket_number,
    t.title,
    t.organization_id,
    w.phase,
    w.what,
    w.owed_by,
    w.owed_by_name,
    w.reason,
    w.pauses_clock,
    w.requested_at,
    working_days_between(
      w.tenant_id,
      (w.requested_at AT TIME ZONE 'America/Bogota')::date,
      (now() AT TIME ZONE 'America/Bogota')::date
    ) AS waiting_days,
    w.target_days,
    CASE WHEN w.target_days IS NULL THEN NULL
         ELSE greatest(
           (working_days_between(
              w.tenant_id,
              (w.requested_at AT TIME ZONE 'America/Bogota')::date,
              (now() AT TIME ZONE 'America/Bogota')::date
            ) - w.target_days)::integer, 0)
    END AS over_days,
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

COMMENT ON FUNCTION open_phase_waits(uuid, uuid) IS
  'Las esperas sin cerrar, ordenadas por antigüedad. Es la bandeja del PM en la pantalla interna y, filtrada por organización, el panel "lo que esperamos de usted" del portal.';

GRANT EXECUTE ON FUNCTION open_phase_waits(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────────────────
-- ROLLBACK
-- ───────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS open_phase_waits(uuid, uuid);
-- DROP FUNCTION IF EXISTS close_phase_wait(uuid, text, timestamptz, text, uuid);
-- DROP FUNCTION IF EXISTS open_phase_wait(uuid, text, text, sla_pause_reason, text, numeric, uuid, uuid);
-- DROP TABLE IF EXISTS phase_waits;
--
-- Nota: al revertir, los paused_days ya acumulados en ticket_phase_log
-- quedan como están. Para dejarlos a cero:
--   UPDATE ticket_phase_log SET paused_days = 0;
