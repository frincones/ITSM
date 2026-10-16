-- ═══════════════════════════════════════════════════════════════
-- 00077 · Registro de fases (Fase B del módulo de proyectos)
-- ═══════════════════════════════════════════════════════════════
--
-- Mide cuánto tiempo pasó cada requerimiento en cada fase, y de quién era
-- el reloj. Sin esto, las fases de 00076 son una etiqueta; con esto, son un
-- plazo medible.
--
-- ───────────────────────────────────────────────────────────────
-- EL MODELO: TRAMOS, NO EVENTOS
-- ───────────────────────────────────────────────────────────────
-- ticket_status_history (00045) guarda EVENTOS: "pasó a testing el día X".
-- Para medir un plazo hace falta el TRAMO: "estuvo en testing del X al Y,
-- que son N días hábiles".
--
-- Se podría derivar el tramo del evento con un LEAD() en cada consulta,
-- pero entonces cada pantalla repetiría el cálculo y el día que una lo haga
-- distinto los números del portal no cuadrarán con los internos. Así que el
-- tramo se guarda cerrado: entered_at, exited_at y los días hábiles netos.
--
-- Una fila por paso. Un ítem que vuelve de UAT a desarrollo genera un
-- segundo tramo de 'desarrollo', no sobrescribe el primero — porque el
-- contrato mide el tiempo total consumido, y una devolución cuesta.
--
-- ───────────────────────────────────────────────────────────────
-- QUÉ NO TOCA
-- ───────────────────────────────────────────────────────────────
-- Nada del SLA de soporte (migraciones 00047-00063).
--
-- El trigger va sobre `requirement_phase`, columna que el CHECK de 00076
-- solo permite en tickets de tipo backlog/desarrollo_pendiente. Un ticket
-- de soporte no puede tener fase, así que este trigger no puede dispararse
-- sobre uno.
--
-- No es un tercer trigger sobre `status`: va `AFTER UPDATE OF
-- requirement_phase` con cláusula WHEN, así que no se dispara cuando se
-- mueve un ticket por el flujo normal de soporte.
--
-- El nombre `trg_log_ticket_phase_change` ordena alfabéticamente después de
-- `trg_log_ticket_status_change` (00045), que es lo que queremos si algún
-- día necesita leer la fila que aquel escribe: Postgres ejecuta los
-- triggers del mismo evento en orden alfabético.
--
-- Verificar antes y después:
--   node scripts/mcp/baseline-soporte.mjs --esperado
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLA: ticket_phase_log
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ticket_phase_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  phase         requirement_phase NOT NULL,
  -- De quién era el reloj. Se congela del catálogo en el momento de entrar:
  -- si mañana se reorganiza quién responde de una fase, lo ya medido no
  -- cambia de dueño. Mismo principio que effort_points en 00067.
  owner         text NOT NULL CHECK (owner IN ('tdx','cliente','tercero','ninguno')),

  entered_at    timestamptz NOT NULL DEFAULT now(),
  -- NULL = el ítem está en esta fase ahora mismo. Un solo tramo abierto por
  -- ticket, garantizado por el índice de más abajo.
  exited_at     timestamptz,

  -- Días hábiles del tramo, calculados al cerrarlo con el mismo calendario
  -- que usa el reloj del SLA de soporte (calendar_holidays, 36 festivos).
  -- Se guardan en vez de derivarse para que el portal y el equipo lean el
  -- mismo número.
  business_days integer,
  -- Días hábiles que el reloj estuvo pausado dentro de este tramo, por
  -- esperas registradas en phase_waits (00078). Se rellena al cerrar.
  paused_days   integer NOT NULL DEFAULT 0,

  -- El plazo que aplicaba al entrar, congelado del catálogo vigente. Igual
  -- que `owner`: cambiar un plazo mañana no reescribe el pasado.
  target_days   numeric(5,2),
  -- La talla en el momento de entrar: el plazo de la fase de desarrollo
  -- depende de ella (S:3 M:4 L:5).
  effort_size   effort_size,

  entered_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (exited_at IS NULL OR exited_at >= entered_at)
);

COMMENT ON TABLE ticket_phase_log IS
  'Un tramo por cada paso de un requerimiento por una fase. Lo escribe el trigger, nunca el código, así que recoge los cambios vengan de la UI, del MCP o de SQL. El responsable y el plazo se congelan al entrar para que reorganizar el catálogo no reescriba el histórico.';

COMMENT ON COLUMN ticket_phase_log.exited_at IS
  'NULL = el ítem está en esta fase ahora. Solo puede haber un tramo abierto por ticket.';

COMMENT ON COLUMN ticket_phase_log.business_days IS
  'Días hábiles brutos del tramo, con el calendario de calendar_holidays. Para saber los imputables hay que restar paused_days.';

-- Un solo tramo abierto por ticket. Si el trigger fallara en cerrar el
-- anterior, este índice lo convierte en un error visible en vez de en dos
-- relojes corriendo a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_log_open
  ON ticket_phase_log (ticket_id)
  WHERE exited_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_phase_log_ticket
  ON ticket_phase_log (ticket_id, entered_at DESC);

-- Para el tablero: los tramos abiertos de una fase, por responsable.
CREATE INDEX IF NOT EXISTS idx_phase_log_current
  ON ticket_phase_log (tenant_id, phase, owner)
  WHERE exited_at IS NULL;

ALTER TABLE ticket_phase_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_phase_log FORCE ROW LEVEL SECURITY;

-- Solo lectura desde la aplicación: lo escribe el trigger, que corre como
-- SECURITY DEFINER y no pasa por aquí. Patrón de cycle_history_select
-- (00071:177).
--
-- El cliente ve los tramos de sus propios requerimientos: es la mitad de la
-- historia que pidió el portal — cuántos días lleva cada cosa y de quién
-- son.
DROP POLICY IF EXISTS ticket_phase_log_select ON ticket_phase_log;
CREATE POLICY ticket_phase_log_select ON ticket_phase_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_phase_log.ticket_id
        AND (is_staff_agent() OR has_org_access(t.organization_id))
    )
  );

-- ---------------------------------------------------------------
-- 2. FUNCIÓN: el plazo vigente de una fase
-- ---------------------------------------------------------------
-- Resuelve la precedencia de phase_sla_targets (00076): lo pactado con la
-- organización gana a lo general del tenant, y lo específico de una talla
-- gana a lo que no mira la talla.
--
-- Devuelve NULL cuando no hay plazo definido. Eso es deliberado: un ítem XL
-- en fase de desarrollo no tiene plazo en el Anexo C, y es mejor reportarlo
-- como "sin plazo" que inventarse uno.

CREATE OR REPLACE FUNCTION phase_target_days(
  p_tenant_id       uuid,
  p_organization_id uuid,
  p_phase           requirement_phase,
  p_size            effort_size DEFAULT NULL,
  p_at              date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.target_days
    FROM phase_sla_targets t
   WHERE t.tenant_id = p_tenant_id
     AND t.phase = p_phase
     AND (t.organization_id = p_organization_id OR t.organization_id IS NULL)
     AND (t.size = p_size OR t.size IS NULL)
     AND t.effective_from <= p_at
     AND (t.effective_to IS NULL OR t.effective_to >= p_at)
   -- Lo más específico primero: la organización gana al tenant, y la talla
   -- gana a la regla general.
   ORDER BY (t.organization_id IS NOT NULL) DESC,
            (t.size IS NOT NULL) DESC,
            t.effective_from DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION phase_target_days(uuid, uuid, requirement_phase, effort_size, date) IS
  'Plazo en días hábiles de una fase, resolviendo la precedencia: lo pactado con la organización gana a lo general, y lo de la talla gana a lo que no la mira. NULL cuando no hay plazo definido, que es mejor que inventarse uno.';

GRANT EXECUTE ON FUNCTION phase_target_days(uuid, uuid, requirement_phase, effort_size, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. TRIGGER: cerrar el tramo anterior y abrir el nuevo
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_ticket_phase_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agent_id uuid;
  v_owner    text;
  v_target   numeric;
  v_open     ticket_phase_log;
BEGIN
  SELECT id INTO v_agent_id FROM agents WHERE user_id = auth.uid() LIMIT 1;

  -- 1. Cerrar el tramo abierto, si lo hay.
  SELECT * INTO v_open
    FROM ticket_phase_log
   WHERE ticket_id = NEW.id AND exited_at IS NULL
   LIMIT 1;

  IF v_open.id IS NOT NULL THEN
    UPDATE ticket_phase_log
       SET exited_at = now(),
           -- Días hábiles del tramo, con el mismo calendario que el SLA de
           -- soporte. Inclusive en ambos extremos, como working_days_between.
           business_days = working_days_between(
             NEW.tenant_id,
             (v_open.entered_at AT TIME ZONE 'America/Bogota')::date,
             (now() AT TIME ZONE 'America/Bogota')::date
           )
     WHERE id = v_open.id;
  END IF;

  -- 2. Abrir el nuevo, salvo que la fase pase a NULL (el PM deshace el
  --    triage y el ítem vuelve al backlog sin fase).
  IF NEW.requirement_phase IS NOT NULL THEN
    SELECT p.owner INTO v_owner
      FROM delivery_phases p
     WHERE p.tenant_id = NEW.tenant_id AND p.phase = NEW.requirement_phase;

    -- Si el catálogo no tuviera la fase, 'ninguno' deja el tramo medible
    -- sin imputárselo a nadie. Mejor que fallar el UPDATE del ticket por
    -- una fila de catálogo que falta.
    v_owner := coalesce(v_owner, 'ninguno');

    v_target := phase_target_days(
      NEW.tenant_id, NEW.organization_id, NEW.requirement_phase, NEW.effort_size
    );

    INSERT INTO ticket_phase_log (
      tenant_id, ticket_id, phase, owner,
      target_days, effort_size,
      entered_by_user_id, entered_by_agent_id
    ) VALUES (
      NEW.tenant_id, NEW.id, NEW.requirement_phase, v_owner,
      v_target, NEW.effort_size,
      auth.uid(), v_agent_id
    );
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION log_ticket_phase_change() IS
  'Cierra el tramo de fase anterior calculando sus días hábiles y abre el nuevo, congelando el responsable y el plazo vigentes. Solo puede dispararse en tickets de proyecto: el CHECK de 00076 impide que uno de soporte tenga fase.';

-- AFTER UPDATE OF <columna> + WHEN: no se dispara en el flujo de soporte.
-- DROP previo porque CREATE TRIGGER no admite IF NOT EXISTS.
DROP TRIGGER IF EXISTS trg_log_ticket_phase_change ON tickets;
CREATE TRIGGER trg_log_ticket_phase_change
  AFTER UPDATE OF requirement_phase ON tickets
  FOR EACH ROW
  WHEN (OLD.requirement_phase IS DISTINCT FROM NEW.requirement_phase)
  EXECUTE FUNCTION log_ticket_phase_change();

-- El alta también se registra: un requerimiento puede nacer ya con fase
-- (por ejemplo 'propuesto' desde el portal), y sin esto su primer tramo no
-- existiría y el ítem parecería no haber estado nunca en ninguna fase.
CREATE OR REPLACE FUNCTION log_ticket_phase_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agent_id uuid;
  v_owner    text;
BEGIN
  SELECT id INTO v_agent_id FROM agents WHERE user_id = auth.uid() LIMIT 1;

  SELECT p.owner INTO v_owner
    FROM delivery_phases p
   WHERE p.tenant_id = NEW.tenant_id AND p.phase = NEW.requirement_phase;

  INSERT INTO ticket_phase_log (
    tenant_id, ticket_id, phase, owner,
    target_days, effort_size,
    entered_by_user_id, entered_by_agent_id
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.requirement_phase, coalesce(v_owner, 'ninguno'),
    phase_target_days(NEW.tenant_id, NEW.organization_id, NEW.requirement_phase, NEW.effort_size),
    NEW.effort_size,
    auth.uid(), v_agent_id
  );

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_ticket_phase_creation ON tickets;
CREATE TRIGGER trg_log_ticket_phase_creation
  AFTER INSERT ON tickets
  FOR EACH ROW
  WHEN (NEW.requirement_phase IS NOT NULL)
  EXECUTE FUNCTION log_ticket_phase_creation();

-- ---------------------------------------------------------------
-- 4. FUNCIÓN: el estado de las fases de un requerimiento
-- ---------------------------------------------------------------
-- Lo que leen el tablero interno y el portal. Una sola función para los
-- dos, para que los números del cliente no puedan discrepar de los
-- nuestros.
--
-- `net_days` es lo imputable: los días hábiles del tramo menos los que el
-- reloj estuvo pausado esperando a otra parte. Es la cifra que compara con
-- el plazo, y la que implementa "los atrasos de PODENZA extienden el plazo
-- de TDX día por día".

CREATE OR REPLACE FUNCTION ticket_phase_sla(p_ticket_id uuid)
RETURNS TABLE (
  phase         requirement_phase,
  owner         text,
  entered_at    timestamptz,
  exited_at     timestamptz,
  is_open       boolean,
  business_days integer,
  paused_days   integer,
  net_days      integer,
  target_days   numeric,
  over_days     integer,
  breached      boolean,
  generates_credit boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH tramos AS (
    SELECT
      l.phase,
      l.owner,
      l.entered_at,
      l.exited_at,
      (l.exited_at IS NULL) AS is_open,
      -- Un tramo abierto se mide hasta hoy: el reloj sigue corriendo.
      coalesce(
        l.business_days,
        working_days_between(
          l.tenant_id,
          (l.entered_at AT TIME ZONE 'America/Bogota')::date,
          (now() AT TIME ZONE 'America/Bogota')::date
        )
      ) AS dias_brutos,
      l.paused_days,
      l.target_days,
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
    t.dias_brutos,
    t.paused_days,
    greatest(t.dias_brutos - t.paused_days, 0) AS net_days,
    t.target_days,
    -- Sin plazo definido no hay atraso que reportar, no un atraso de 0.
    CASE WHEN t.target_days IS NULL THEN NULL
         ELSE greatest(
           (greatest(t.dias_brutos - t.paused_days, 0) - t.target_days)::integer, 0)
    END AS over_days,
    CASE WHEN t.target_days IS NULL THEN NULL
         ELSE greatest(t.dias_brutos - t.paused_days, 0) > t.target_days
    END AS breached,
    t.generates_credit
  FROM tramos t
  ORDER BY t.entered_at;
$$;

COMMENT ON FUNCTION ticket_phase_sla(uuid) IS
  'Los tramos de fase de un requerimiento con sus días netos contra el plazo. net_days descuenta las pausas, que es lo que implementa la extensión día por día del contrato. La leen el tablero interno y el portal, para que los números no puedan discrepar.';

GRANT EXECUTE ON FUNCTION ticket_phase_sla(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. FUNCIÓN: el atraso de un requerimiento, por responsable
-- ---------------------------------------------------------------
-- La cifra de las dos pantallas: cuántos días lleva de atraso, y de quién
-- son. Solo el atraso en fases `generates_credit` expone a descuento.

CREATE OR REPLACE FUNCTION requirement_delay(p_ticket_id uuid)
RETURNS TABLE (
  tdx_days      integer,
  cliente_days  integer,
  tercero_days  integer,
  tdx_over      integer,
  cliente_over  integer,
  exposed_over  integer,
  current_phase requirement_phase,
  current_owner text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH s AS (SELECT * FROM ticket_phase_sla(p_ticket_id))
  SELECT
    coalesce(sum(s.net_days) FILTER (WHERE s.owner = 'tdx'), 0)::integer,
    coalesce(sum(s.net_days) FILTER (WHERE s.owner = 'cliente'), 0)::integer,
    coalesce(sum(s.net_days) FILTER (WHERE s.owner = 'tercero'), 0)::integer,
    coalesce(sum(s.over_days) FILTER (WHERE s.owner = 'tdx'), 0)::integer,
    coalesce(sum(s.over_days) FILTER (WHERE s.owner = 'cliente'), 0)::integer,
    -- Lo único que puede costar dinero: atraso de TDX en una fase que
    -- genera descuento según el catálogo.
    coalesce(sum(s.over_days) FILTER (WHERE s.owner = 'tdx' AND s.generates_credit), 0)::integer,
    (SELECT s2.phase FROM s s2 WHERE s2.is_open LIMIT 1),
    (SELECT s2.owner FROM s s2 WHERE s2.is_open LIMIT 1)
  FROM s;
$$;

COMMENT ON FUNCTION requirement_delay(uuid) IS
  'Días netos y de atraso de un requerimiento, separados por responsable. exposed_over es lo único que puede generar descuento: atraso de TDX en una fase que el catálogo marca como generadora de crédito.';

GRANT EXECUTE ON FUNCTION requirement_delay(uuid) TO authenticated, service_role;

-- Los grants de 00060 se mantienen al día: ese archivo es el inventario, y
-- 00068 existe porque 00043 creó funciones sin grants y rompió toda lectura
-- con "permission denied for function".

NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────────────────
-- SIN BACKFILL, A PROPÓSITO
-- ───────────────────────────────────────────────────────────────
-- Las propuestas anteriores incluían reconstruir las 2092 transiciones de
-- ticket_status_history para tener una línea base histórica. Se retiró:
-- esas transiciones son de tickets de soporte y garantía, y leerlas como
-- fases de proyecto mezclaría los dos procesos justo donde más importa no
-- mezclarlos.
--
-- Los 16 tickets de tipo proyecto que existen no tienen project_id, ni
-- ciclo, ni estimación. Entran al proceso desde la fase que les asigne el
-- PM, y su primer tramo lo abre el trigger.
--
-- ───────────────────────────────────────────────────────────────
-- ROLLBACK
-- ───────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_log_ticket_phase_creation ON tickets;
-- DROP TRIGGER IF EXISTS trg_log_ticket_phase_change ON tickets;
-- DROP FUNCTION IF EXISTS log_ticket_phase_creation();
-- DROP FUNCTION IF EXISTS log_ticket_phase_change();
-- DROP FUNCTION IF EXISTS requirement_delay(uuid);
-- DROP FUNCTION IF EXISTS ticket_phase_sla(uuid);
-- DROP FUNCTION IF EXISTS phase_target_days(uuid, uuid, requirement_phase, effort_size, date);
-- DROP TABLE IF EXISTS ticket_phase_log;
