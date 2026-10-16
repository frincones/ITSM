-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00069: AISLAMIENTO DE TICKETS POR ORGANIZACIÓN
-- NovaDesk ITSM — corrección de la fuga entre clientes, paso 2 de 3
-- ═══════════════════════════════════════════════════════════════
-- Para qué va
-- -----------
-- Hoy `tickets` y `ticket_followups` solo comprueban `tenant_id`, y las tres
-- organizaciones comparten tenant. Medido simulando sesiones reales:
--
--   Camilo Mayorga (Podenza)        ve 714 tickets, 1273 comentarios
--   Daniel Valbuena (Prosuministros) ve 714 tickets, 1273 comentarios
--
-- Es decir, Camilo lee los 240 tickets y los 367 comentarios de
-- Prosuministros, y Daniel los 470 y 893 de Podenza. Por la interfaz no se
-- nota —las server actions filtran por código— pero basta la sesión del
-- navegador contra /rest/v1/tickets para verlo todo.
--
-- Lo más sensible no son los tickets sino `ticket_followups`: son las
-- conversaciones completas entre TDX y el otro cliente.
--
-- Qué cambia exactamente
-- ----------------------
--   Admin NovaDesk, Freddy, Emma (personal)  714 -> 714   sin cambio
--   Camilo, Bibiana (Podenza)                714 -> 470
--   Daniel, Andrés (Prosuministros)          714 -> 240
--
-- Nadie pierde un solo ticket de su propio cliente.
--
-- Decisiones que hay detrás
-- -------------------------
-- El aislamiento es POR ORGANIZACIÓN, no por persona. Camilo creó 12 tickets
-- pero Podenza tiene 470: aislar por solicitante le quitaría 458 que hoy usa
-- para seguir a su equipo.
--
-- El personal sigue viendo todo. Se evaluó restringirlo por
-- `agent_organizations` y se descartó con datos: Admin NovaDesk perdería 244
-- tickets, Emma 4 y Freddy 1, porque esas asignaciones están incompletas.
--
-- Cada política conserva su condición actual y solo AÑADE el aislamiento, de
-- modo que nada que hoy funcione deje de funcionar: `deleted_at IS NULL`
-- sigue donde estaba y `tenant_id` también.
--
-- Depende de: 00068 (is_staff_agent, has_org_access CON sus GRANT)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. tickets
-- ---------------------------------------------------------------
-- Un ticket sin organización (hay uno, TKT-2604-00291, cerrado y de prueba)
-- deja de ser visible para los clientes y sigue siéndolo para el personal.
-- Es lo correcto: un registro sin cliente no pertenece a ningún cliente.

DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND deleted_at IS NULL
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND deleted_at IS NULL
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

-- En INSERT el aislamiento va en WITH CHECK: un cliente puede crear un
-- ticket, pero solo para su propia organización. El personal, para
-- cualquiera.
DROP POLICY IF EXISTS tickets_insert ON tickets;
CREATE POLICY tickets_insert ON tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

-- Borrar es del personal. Antes bastaba con pertenecer al tenant, lo que
-- dejaba a un usuario de cliente borrar tickets de cualquier organización.
DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets
  FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- 2. ticket_followups
-- ---------------------------------------------------------------
-- Hereda del ticket padre en vez de llevar su propia copia de la regla: si
-- mañana cambia quién puede ver un ticket, los comentarios siguen la misma
-- suerte sin tocar esta política.

DROP POLICY IF EXISTS ticket_followups_select ON ticket_followups;
CREATE POLICY ticket_followups_select ON ticket_followups
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_followups.ticket_id
        AND t.deleted_at IS NULL
        AND (is_staff_agent() OR has_org_access(t.organization_id))
    )
  );

DROP POLICY IF EXISTS ticket_followups_insert ON ticket_followups;
CREATE POLICY ticket_followups_insert ON ticket_followups
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_followups.ticket_id
        AND t.deleted_at IS NULL
        AND (is_staff_agent() OR has_org_access(t.organization_id))
    )
  );

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
--   node scripts/mcp/verify-rls.mjs --esperado
--
-- Debe dar exactamente:
--   Admin NovaDesk / Freddy / Emma   tickets 714  followups 1273
--   Camilo / Bibiana                 tickets 470  followups 893
--   Daniel / Andrés                  tickets 240  followups 367
--
-- Y la facturación sin moverse:
--   node scripts/mcp/verify-00067.mjs
--
-- Comprobación manual de que el personal sigue pudiendo escribir:
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<user_id admin>","role":"authenticated"}';
--   UPDATE tickets SET updated_at = updated_at
--    WHERE id = (SELECT id FROM tickets WHERE deleted_at IS NULL LIMIT 1);
--   ROLLBACK;
--
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   -- Devuelve las políticas tenant-only, y con ellas la fuga.
--   DROP POLICY IF EXISTS tickets_select ON tickets;
--   CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
--     USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
--
--   DROP POLICY IF EXISTS tickets_update ON tickets;
--   CREATE POLICY tickets_update ON tickets FOR UPDATE TO authenticated
--     USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
--
--   DROP POLICY IF EXISTS tickets_insert ON tickets;
--   CREATE POLICY tickets_insert ON tickets FOR INSERT TO authenticated
--     WITH CHECK (tenant_id = get_current_tenant_id());
--
--   DROP POLICY IF EXISTS tickets_delete ON tickets;
--   CREATE POLICY tickets_delete ON tickets FOR DELETE TO authenticated
--     USING (tenant_id = get_current_tenant_id());
--
--   DROP POLICY IF EXISTS ticket_followups_select ON ticket_followups;
--   CREATE POLICY ticket_followups_select ON ticket_followups FOR SELECT TO authenticated
--     USING (tenant_id = get_current_tenant_id());
--
--   DROP POLICY IF EXISTS ticket_followups_insert ON ticket_followups;
--   CREATE POLICY ticket_followups_insert ON ticket_followups FOR INSERT TO authenticated
--     WITH CHECK (tenant_id = get_current_tenant_id());
--
--   NOTIFY pgrst, 'reload schema';
--
-- No se pierde ningún dato: esto solo cambia políticas.
-- ═══════════════════════════════════════════════════════════════
