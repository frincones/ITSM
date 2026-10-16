-- ═══════════════════════════════════════════════════════════════
-- 00081 · Agrupar tickets en un requerimiento facturable
-- ═══════════════════════════════════════════════════════════════
--
-- El contrato factura por ENTREGABLE; el trabajo entra como TICKETS. El
-- cronograma de Podenza lo muestra: siete filtros que valen 2 créditos entre
-- todos, y un ítem que vale 2 él solo.
--
-- Sin esto, cargar los siete filtros con su talla M daría 14 créditos donde
-- el contrato dice 2 — siete veces lo facturable.
--
-- ───────────────────────────────────────────────────────────────
-- EL MODELO: TRES REGLAS
-- ───────────────────────────────────────────────────────────────
--   1. El crédito y la fase viven en el PADRE. Un hijo va con
--      effort_points = 0 y requirement_phase = NULL.
--   2. El padre es un ticket NUEVO de tipo desarrollo_pendiente, creado al
--      agrupar: agrupar es comprometerse, ya no es backlog.
--   3. Un ticket sin padre es su propio entregable.
--
-- La tercera es la que hace que esto no sea una migración de datos: agrupar
-- es opcional, y lo individual sigue funcionando exactamente igual.
--
-- ───────────────────────────────────────────────────────────────
-- SIN TABLAS NUEVAS
-- ───────────────────────────────────────────────────────────────
-- `ticket_relations` existe desde 00004 con los tipos 'parent' y 'child', y
-- está VACÍA (0 filas, verificado 16-oct-2026). No hay nada que migrar.
--
-- La suma de créditos tampoco cambia: cycle_delivery_compliance hace
-- sum(effort_points) y los hijos aportan 0, así que el total ya sale bien.
-- Lo único que se ajusta es que un hijo no cuente como ÍTEM, para que un
-- grupo de 5 no diga "1 de 5 entregado" cuando el entregable es uno.
--
-- ───────────────────────────────────────────────────────────────
-- EL HIJO CONSERVA SU TIPO — decisión del equipo, con su precio
-- ───────────────────────────────────────────────────────────────
-- Un ticket que entra a un grupo NO se reclasifica. Así la reunión de
-- planning no se convierte en una sesión de reclasificación, y no se toca
-- retroactivamente la cuota de un ciclo de soporte ya facturado.
--
-- ⚠ CONSECUENCIA: support, incident y request consumen cuota de soporte. Un
-- hijo de esos tipos seguirá contando en los 30 tickets/mes ADEMÁS de que su
-- trabajo cuente en los créditos del padre. El mismo trabajo en dos
-- contadores.
--
-- Medido hoy en Podenza: 32 tickets support abiertos, de los que 16 están en
-- estado backlog — trabajo de desarrollo mal tipado desde el origen.
--
-- No es un defecto del modelo: es el precio de no reclasificar, y la
-- interfaz lo advierte al agrupar con opción de reclasificar o seguir.
--
-- ───────────────────────────────────────────────────────────────
-- QUÉ NO TOCA
-- ───────────────────────────────────────────────────────────────
-- Nada del SLA de soporte (00047-00063). No se modifica
-- ticket_type_consumes_quota ni ninguna función de cuota: un hijo support
-- sigue contando donde contaba.
--
-- Verificar antes y después:
--   node scripts/mcp/baseline-soporte.mjs --esperado
--   node scripts/mcp/verify-00067.mjs
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. Índices sobre ticket_relations
-- ---------------------------------------------------------------
-- La tabla existe desde 00004 pero sin índice por `related_ticket_id`, que
-- es justo por donde se pregunta "¿este ticket tiene padre?" en cada fila de
-- cada listado.

CREATE INDEX IF NOT EXISTS idx_ticket_relations_child
  ON ticket_relations (related_ticket_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_ticket_relations_parent
  ON ticket_relations (ticket_id, relation_type);

-- Un ticket no puede ser hijo dos veces: evita grupos solapados y que un
-- crédito se cuente en dos entregables.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_relations_one_parent
  ON ticket_relations (related_ticket_id)
  WHERE relation_type = 'child';

-- ---------------------------------------------------------------
-- 2. VISTA: requirement_members
-- ---------------------------------------------------------------
-- Para que la interfaz pida el grupo entero de un tirón en vez de una
-- consulta por hijo.

CREATE OR REPLACE VIEW requirement_members AS
SELECT
  p.id                AS requirement_id,
  p.ticket_number     AS requirement_number,
  p.title             AS requirement_title,
  p.effort_size       AS requirement_size,
  p.effort_points     AS requirement_points,
  p.requirement_phase AS requirement_phase,
  p.delivery_cycle_id,
  p.organization_id,
  p.tenant_id,
  ch.id               AS member_id,
  ch.ticket_number    AS member_number,
  ch.title            AS member_title,
  ch.type             AS member_type,
  ch.status           AS member_status,
  -- Lo que decide si el entregable está listo. Un hijo cerrado o resuelto
  -- ya no bloquea.
  (ch.status IN ('resolved','closed')) AS member_done,
  -- Para el aviso de doble conteo: este hijo consume cuota de soporte.
  ticket_type_consumes_quota(ch.type)  AS member_consumes_quota
FROM ticket_relations r
JOIN tickets p  ON p.id  = r.ticket_id         AND p.deleted_at IS NULL
JOIN tickets ch ON ch.id = r.related_ticket_id AND ch.deleted_at IS NULL
WHERE r.relation_type = 'child';

COMMENT ON VIEW requirement_members IS
  'Los tickets que componen cada requerimiento agrupado, con si están listos y si consumen cuota de soporte. El crédito y la fase viven en el padre; los miembros van en 0.';

GRANT SELECT ON requirement_members TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. FUNCIÓN: agrupar
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION group_tickets_into_requirement(
  p_child_ids      uuid[],
  p_title          text,
  p_size           effort_size,
  p_cycle_id       uuid DEFAULT NULL,
  p_project_id     uuid DEFAULT NULL,
  p_actor_agent_id uuid DEFAULT NULL
)
RETURNS tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agent    agents;
  v_first    tickets;
  v_org      uuid;
  v_tenant   uuid;
  v_points   integer;
  v_parent   tickets;
  v_n        integer;
  v_con_padre integer;
BEGIN
  IF p_child_ids IS NULL OR array_length(p_child_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Hay que indicar al menos un ticket para agrupar';
  END IF;

  IF btrim(coalesce(p_title,'')) = '' THEN
    RAISE EXCEPTION 'El requerimiento necesita un nombre';
  END IF;

  -- El actor explícito, igual que accept_proposal (00074): por MCP auth.uid()
  -- es NULL porque se entra con service_role.
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
    RAISE EXCEPTION 'Solo el equipo puede agrupar tickets en un requerimiento';
  END IF;

  -- Todos los hijos existen y son del mismo cliente. Si no, el entregable
  -- cruzaría organizaciones y el crédito no sabría a quién facturarse.
  -- `min()` no existe para uuid, así que el tenant sale de una fila
  -- cualquiera del grupo. Todos comparten tenant por construcción: un ticket
  -- siempre lo tiene, y la comprobación de organización de más abajo es la
  -- que de verdad impide mezclar clientes.
  SELECT count(*), count(DISTINCT organization_id)
    INTO v_n, v_con_padre
    FROM tickets
   WHERE id = ANY(p_child_ids) AND deleted_at IS NULL;

  SELECT tenant_id INTO v_tenant
    FROM tickets WHERE id = p_child_ids[1] AND deleted_at IS NULL;

  IF v_n <> array_length(p_child_ids, 1) THEN
    RAISE EXCEPTION 'Alguno de los tickets no existe o está borrado';
  END IF;

  IF v_con_padre > 1 THEN
    RAISE EXCEPTION 'Los tickets son de organizaciones distintas: un requerimiento pertenece a un solo cliente';
  END IF;

  -- Ninguno puede estar ya en otro grupo. El índice único lo impediría, pero
  -- el mensaje de aquí dice qué pasó.
  SELECT count(*) INTO v_con_padre
    FROM ticket_relations
   WHERE related_ticket_id = ANY(p_child_ids) AND relation_type = 'child';

  IF v_con_padre > 0 THEN
    RAISE EXCEPTION '% ticket(s) ya pertenecen a otro requerimiento', v_con_padre;
  END IF;

  -- Un padre tampoco puede ser hijo de nadie: nada de grupos anidados.
  SELECT count(*) INTO v_con_padre
    FROM ticket_relations
   WHERE ticket_id = ANY(p_child_ids) AND relation_type = 'child';

  IF v_con_padre > 0 THEN
    RAISE EXCEPTION 'Alguno de los tickets ya es un requerimiento con miembros; desagrúpalo primero';
  END IF;

  SELECT * INTO v_first FROM tickets WHERE id = p_child_ids[1];
  v_org := v_first.organization_id;

  -- Los créditos salen de la escala de ESA organización (00080): Podenza
  -- factura por el Anexo C, el resto por la escala general del tenant.
  v_points := effort_points_for(v_tenant, v_org, p_size);

  IF v_points IS NULL THEN
    RAISE EXCEPTION 'No hay escala de esfuerzo vigente para la talla % en esta organización', p_size;
  END IF;

  -- El padre: tipo desarrollo_pendiente, que no consume cuota y admite fase
  -- (el CHECK de 00076 solo permite backlog y desarrollo_pendiente).
  INSERT INTO tickets (
    tenant_id, organization_id, title, description,
    type, status, urgency, impact,
    requester_email, assigned_agent_id,
    effort_size, effort_points,
    delivery_cycle_id, project_id,
    requirement_phase
  ) VALUES (
    v_tenant, v_org, btrim(p_title),
    format('Requerimiento que agrupa %s ticket(s). Creado desde el refinamiento del backlog.',
           array_length(p_child_ids,1)),
    'desarrollo_pendiente', 'new',
    coalesce(v_first.urgency, 'medium'), coalesce(v_first.impact, 'medium'),
    coalesce(v_first.requester_email, v_agent.email, 'equipo@tdxcore.com'),
    v_agent.id,
    p_size, v_points,
    coalesce(p_cycle_id, v_first.delivery_cycle_id),
    coalesce(p_project_id, v_first.project_id),
    -- Nace sin fase: el PM la asigna cuando el entregable arranca. Poner
    -- 'propuesto' aquí abriría un tramo que nadie pidió.
    NULL
  )
  RETURNING * INTO v_parent;

  -- Las relaciones.
  INSERT INTO ticket_relations (tenant_id, ticket_id, related_ticket_id, relation_type)
  SELECT v_tenant, v_parent.id, unnest(p_child_ids), 'child';

  -- Los miembros ceden su crédito y su fase al padre, y se mueven a su
  -- ciclo: un entregable pertenece a un solo ciclo.
  --
  -- El TIPO no se toca a propósito (ver cabecera): un hijo support sigue
  -- siendo support y sigue consumiendo cuota.
  UPDATE tickets
     SET effort_points     = 0,
         effort_size       = NULL,
         requirement_phase = NULL,
         delivery_cycle_id = v_parent.delivery_cycle_id,
         project_id        = coalesce(v_parent.project_id, project_id)
   WHERE id = ANY(p_child_ids);

  RETURN v_parent;
END;
$fn$;

COMMENT ON FUNCTION group_tickets_into_requirement(uuid[], text, effort_size, uuid, uuid, uuid) IS
  'Crea un requerimiento facturable que agrupa varios tickets. El crédito y la fase viven en el padre; los miembros van a 0. Los miembros CONSERVAN su tipo, así que uno de tipo support seguirá consumiendo cuota de soporte además de los créditos del padre.';

GRANT EXECUTE ON FUNCTION group_tickets_into_requirement(uuid[], text, effort_size, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. FUNCIÓN: desagrupar
-- ---------------------------------------------------------------
-- Deshace el grupo. NUNCA borra tickets: el padre queda vacío y el PM
-- decide si lo cancela, porque si ya pasó por fases su histórico de tramos y
-- esperas es la trazabilidad del entregable.

CREATE OR REPLACE FUNCTION ungroup_requirement(
  p_parent_id      uuid,
  p_actor_agent_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agent agents;
  v_n     integer;
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
    RAISE EXCEPTION 'Solo el equipo puede desagrupar un requerimiento';
  END IF;

  SELECT count(*) INTO v_n
    FROM ticket_relations
   WHERE ticket_id = p_parent_id AND relation_type = 'child';

  IF v_n = 0 THEN
    RAISE EXCEPTION 'El ticket % no agrupa ningún otro', p_parent_id;
  END IF;

  DELETE FROM ticket_relations
   WHERE ticket_id = p_parent_id AND relation_type = 'child';

  -- Los miembros vuelven al backlog sin crédito y sin fase. No se les
  -- devuelve una talla porque nunca la tuvieron dentro del grupo: habrá que
  -- re-estimarlos si salen por su cuenta.
  RETURN v_n;
END;
$fn$;

COMMENT ON FUNCTION ungroup_requirement(uuid, uuid) IS
  'Deshace un requerimiento agrupado. Los miembros vuelven al backlog sin crédito ni fase. El padre NO se borra: queda vacío y el equipo decide si lo cancela, porque su histórico de fases es la trazabilidad del entregable.';

GRANT EXECUTE ON FUNCTION ungroup_requirement(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. FUNCIÓN: re-estimar un requerimiento — SOLO ADMIN
-- ---------------------------------------------------------------
-- Cambiar la talla cambia lo que se factura, así que lo restringe el rol, no
-- la interfaz. Y solo mientras el ciclo esté abierto: una vez cerrado, la
-- cifra ya se facturó y recalcularla reescribiría el pasado — el mismo
-- principio de support_cycle_closures (00058).

CREATE OR REPLACE FUNCTION resize_requirement(
  p_ticket_id      uuid,
  p_size           effort_size,
  p_actor_agent_id uuid DEFAULT NULL
)
RETURNS tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agent  agents;
  v_ticket tickets;
  v_cycle  delivery_cycles;
  v_points integer;
BEGIN
  -- SOLO ADMIN. Supervisor y agente pueden agrupar, pero no cambiar el
  -- precio de algo ya comprometido.
  IF p_actor_agent_id IS NOT NULL THEN
    SELECT * INTO v_agent FROM agents
     WHERE id = p_actor_agent_id AND is_active = true AND role = 'admin';
  ELSE
    SELECT * INTO v_agent FROM agents
     WHERE user_id = auth.uid() AND is_active = true AND role = 'admin';
  END IF;

  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la talla de un requerimiento: afecta a lo que se factura';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id AND deleted_at IS NULL;
  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'El ticket % no existe', p_ticket_id;
  END IF;

  -- Un miembro de un grupo no tiene talla propia: el crédito es del padre.
  IF EXISTS (SELECT 1 FROM ticket_relations
              WHERE related_ticket_id = p_ticket_id AND relation_type = 'child') THEN
    RAISE EXCEPTION 'Este ticket pertenece a un requerimiento; re-estima el requerimiento, no uno de sus miembros';
  END IF;

  IF v_ticket.delivery_cycle_id IS NOT NULL THEN
    SELECT * INTO v_cycle FROM delivery_cycles WHERE id = v_ticket.delivery_cycle_id;
    IF v_cycle.status = 'closed' THEN
      RAISE EXCEPTION 'El ciclo % está cerrado: su cifra ya se facturó y no se recalcula', v_cycle.cycle_number;
    END IF;
  END IF;

  v_points := effort_points_for(v_ticket.tenant_id, v_ticket.organization_id, p_size);
  IF v_points IS NULL THEN
    RAISE EXCEPTION 'No hay escala vigente para la talla % en esta organización', p_size;
  END IF;

  UPDATE tickets
     SET effort_size = p_size, effort_points = v_points
   WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$fn$;

COMMENT ON FUNCTION resize_requirement(uuid, effort_size, uuid) IS
  'Cambia la talla y los créditos de un requerimiento. Solo admin, porque afecta a lo que se factura, y solo con el ciclo abierto: una cifra ya facturada no se recalcula.';

GRANT EXECUTE ON FUNCTION resize_requirement(uuid, effort_size, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 6. Las dos funciones del ciclo cuentan ENTREGABLES, no tickets
-- ---------------------------------------------------------------
-- La suma de créditos ya era correcta (los miembros aportan 0), pero el
-- CONTEO de ítems no: un grupo de 5 diría "1 de 5 entregado" cuando el
-- entregable es uno solo.

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
       -- Lo cancelado tampoco: salió del alcance de común acuerdo.
       AND t.status <> 'cancelled'
       -- Un MIEMBRO de un requerimiento no es un entregable: es parte de
       -- uno. Su crédito ya está en el padre (va a 0), así que la suma no
       -- cambia; lo que se corrige es el conteo de ítems.
       AND NOT EXISTS (
         SELECT 1 FROM ticket_relations r
          WHERE r.related_ticket_id = t.id AND r.relation_type = 'child'
       )
  )
  SELECT
    v_cycle.id,
    v_cycle.cycle_number,
    v_cycle.status,
    v_cycle.committed_points,
    coalesce(sum(i.effort_points), 0)::integer,
    coalesce(sum(i.effort_points) FILTER (WHERE i.st IN ('resolved','closed')), 0)::integer,
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

-- Esta función gana dos columnas (member_count, members_done), y
-- CREATE OR REPLACE no puede cambiar el tipo de retorno de una función
-- existente. Hay que borrarla primero.
DROP FUNCTION IF EXISTS cycle_sla_breaches(uuid);

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
  is_delivered   boolean,
  member_count   integer,
  members_done   integer
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
    (t.requirement_phase = 'entregado') AS is_delivered,
    -- Cuántos tickets agrupa y cuántos van listos. Es lo que explica en el
    -- tablero por qué el reloj sigue corriendo: "4 de 5 listos".
    (SELECT count(*)::integer FROM requirement_members m WHERE m.requirement_id = t.id),
    (SELECT count(*)::integer FROM requirement_members m
      WHERE m.requirement_id = t.id AND m.member_done)
  FROM tickets t
  CROSS JOIN LATERAL requirement_delay(t.id) d
 WHERE t.delivery_cycle_id = p_cycle_id
   AND t.deleted_at IS NULL
   AND t.status NOT IN ('proposed', 'cancelled')
   -- Los miembros no son entregables.
   AND NOT EXISTS (
     SELECT 1 FROM ticket_relations r
      WHERE r.related_ticket_id = t.id AND r.relation_type = 'child'
   )
 ORDER BY d.exposed_over DESC, d.tdx_over DESC, t.ticket_number;
$$;

COMMENT ON FUNCTION cycle_sla_breaches(uuid) IS
  'Un renglón por ENTREGABLE del ciclo con su atraso por responsable. Los miembros de un requerimiento no aparecen: su crédito y su plazo son los del padre. member_count/members_done explican por qué un entregable sigue abierto.';

GRANT EXECUTE ON FUNCTION cycle_sla_breaches(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────────────────
-- ROLLBACK
-- ───────────────────────────────────────────────────────────────
-- -- Deshacer los grupos (los tickets NO se borran, solo las relaciones):
-- DELETE FROM ticket_relations WHERE relation_type = 'child';
--
-- DROP FUNCTION IF EXISTS resize_requirement(uuid, effort_size, uuid);
-- DROP FUNCTION IF EXISTS ungroup_requirement(uuid, uuid);
-- DROP FUNCTION IF EXISTS group_tickets_into_requirement(uuid[], text, effort_size, uuid, uuid, uuid);
-- DROP VIEW IF EXISTS requirement_members;
-- DROP INDEX IF EXISTS idx_ticket_relations_one_parent;
-- DROP INDEX IF EXISTS idx_ticket_relations_parent;
-- DROP INDEX IF EXISTS idx_ticket_relations_child;
--
-- Y reaplicar delivery_cycle_status de 00075 y cycle_sla_breaches de 00079.
-- Los créditos congelados en tickets.effort_points no dependen de nada de
-- aquí; un padre huérfano queda como un ticket normal.
