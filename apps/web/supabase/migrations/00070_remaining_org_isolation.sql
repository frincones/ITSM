-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00070: AISLAMIENTO DE LAS TABLAS RESTANTES
-- NovaDesk ITSM — corrección de la fuga entre clientes, paso 3 de 3
-- ═══════════════════════════════════════════════════════════════
-- Para qué va
-- -----------
-- 00069 cerró `tickets` y `ticket_followups`, que son el grueso del volumen.
-- Quedan diez tablas que también tienen `organization_id` sin usarlo en sus
-- políticas. Menos filas, pero no menos sensibles: `contacts` expone nombres,
-- correos y teléfonos de los clientes entre sí.
--
-- Medido con la sesión de Camilo Mayorga (Podenza) antes de esta migración:
--
--   contacts                6 -> debería ver 1
--   nps_surveys           188 -> debería ver 93
--   inbox_conversations     8 -> debería ver 4
--   ai_dashboard_insights   6 -> debería ver 1
--   organization_users      5 -> debería ver 3
--   agent_organizations    10 -> debería ver 5
--   assets                  7 -> debería ver 0
--   slas                    4 -> debería ver 0
--   kb_articles             6 -> debería ver 5
--
-- Tres tratamientos, no uno
-- -------------------------
-- No todas las tablas se arreglan igual, y aplicar la misma regla a todas
-- rompería cosas:
--
--   (a) Por organización — donde conviven datos de varios clientes.
--   (b) Solo personal — catálogos internos de TDX. Ninguna de sus filas
--       tiene `organization_id`, así que un cliente no debería verlas.
--   (c) Por `is_public` — kb_articles. Sus 6 artículos tienen
--       `organization_id = NULL`: filtrar por organización dejaría a los
--       clientes SIN base de conocimiento. 5 están publicados y deben
--       seguir viéndose.
--
-- Depende de: 00068 (is_staff_agent, has_org_access)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- (a) POR ORGANIZACIÓN
-- ---------------------------------------------------------------

-- contacts — las personas de contacto de cada cliente. Lo más sensible de
-- esta migración: hoy un cliente ve los datos personales de los demás.
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

-- Escribir contactos es del personal: un cliente no administra su directorio
-- desde aquí.
DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_update ON contacts
  FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS contacts_delete ON contacts;
CREATE POLICY contacts_delete ON contacts
  FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- nps_surveys — encuestas de satisfacción. Las respuestas de un cliente no
-- son asunto de otro.
DROP POLICY IF EXISTS nps_surveys_select ON nps_surveys;
CREATE POLICY nps_surveys_select ON nps_surveys
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

-- inbox_conversations — conversaciones de WhatsApp y correo.
DROP POLICY IF EXISTS inbox_conversations_select ON inbox_conversations;
CREATE POLICY inbox_conversations_select ON inbox_conversations
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

DROP POLICY IF EXISTS inbox_conversations_insert ON inbox_conversations;
CREATE POLICY inbox_conversations_insert ON inbox_conversations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS inbox_conversations_update ON inbox_conversations;
CREATE POLICY inbox_conversations_update ON inbox_conversations
  FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS inbox_conversations_delete ON inbox_conversations;
CREATE POLICY inbox_conversations_delete ON inbox_conversations
  FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ai_dashboard_insights — análisis generados por IA sobre la operación de
-- cada cliente.
-- Ojo con el nombre: la política se llama ai_insights_select, no
-- ai_dashboard_insights_select. Un DROP con el nombre equivocado no falla,
-- simplemente no borra nada, y quedarían dos políticas SELECT — la vieja
-- seguiría dejando pasar todo, porque en RLS las políticas se suman con OR.
DROP POLICY IF EXISTS ai_insights_select ON ai_dashboard_insights;
CREATE POLICY ai_insights_select ON ai_dashboard_insights
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

-- organization_users — quién trabaja en cada cliente. Un cliente ve a los
-- suyos, no a los de la competencia.
DROP POLICY IF EXISTS organization_users_select ON organization_users;
CREATE POLICY organization_users_select ON organization_users
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

DROP POLICY IF EXISTS organization_users_insert ON organization_users;
CREATE POLICY organization_users_insert ON organization_users
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS organization_users_update ON organization_users;
CREATE POLICY organization_users_update ON organization_users
  FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS organization_users_delete ON organization_users;
CREATE POLICY organization_users_delete ON organization_users
  FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- agent_organizations — qué agente de TDX atiende a qué cliente. Revela el
-- mapa de la operación comercial.
DROP POLICY IF EXISTS agent_organizations_select ON agent_organizations;
CREATE POLICY agent_organizations_select ON agent_organizations
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

DROP POLICY IF EXISTS agent_organizations_insert ON agent_organizations;
CREATE POLICY agent_organizations_insert ON agent_organizations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS agent_organizations_update ON agent_organizations;
CREATE POLICY agent_organizations_update ON agent_organizations
  FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS agent_organizations_delete ON agent_organizations;
CREATE POLICY agent_organizations_delete ON agent_organizations
  FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- (b) SOLO PERSONAL — catálogos internos de TDX
-- ---------------------------------------------------------------
-- Ninguna fila de estas dos tablas tiene `organization_id`. No son datos de
-- cliente: son el inventario y los acuerdos de servicio de TDX.

DROP POLICY IF EXISTS assets_select ON assets;
CREATE POLICY assets_select ON assets
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

DROP POLICY IF EXISTS slas_select ON slas;
CREATE POLICY slas_select ON slas
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_staff_agent());

-- ---------------------------------------------------------------
-- (c) POR is_public — la base de conocimiento
-- ---------------------------------------------------------------
-- Caso especial, y el que más fácil se rompe. Los 6 artículos tienen
-- `organization_id = NULL`, así que una política por organización se la
-- quitaría ENTERA a los clientes.
--
-- La regla correcta es la visibilidad del artículo: 5 están publicados con
-- `is_public = true` y deben seguir viéndose; 1 es un borrador interno y no.
--
-- El portal público no se ve afectado por esto en ningún caso: consulta con
-- `service_role`, que no pasa por RLS.

DROP POLICY IF EXISTS kb_articles_select ON kb_articles;
CREATE POLICY kb_articles_select ON kb_articles
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR is_public = true)
  );

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
--   node scripts/mcp/verify-rls.mjs --esperado    # debe dar 0 diferencias
--   node scripts/mcp/verify-00067.mjs             # facturación intacta
--
-- Esperado por usuario:
--   personal          contacts 6  nps 188  kb 6
--   Camilo / Bibiana  contacts 1  nps 93   kb 5
--   Daniel / Andrés   contacts 2  nps 95   kb 5
--
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- Devuelve cada política a su forma tenant-only, y con ella la fuga:
--
--   DROP POLICY IF EXISTS contacts_select ON contacts;
--   CREATE POLICY contacts_select ON contacts FOR SELECT TO authenticated
--     USING (tenant_id = get_current_tenant_id());
--   -- ...ídem para insert/update/delete de contacts,
--   --    nps_surveys, inbox_conversations, ai_dashboard_insights,
--   --    organization_users, agent_organizations, assets, slas, kb_articles
--
--   NOTIFY pgrst, 'reload schema';
--
-- No se pierde ningún dato: esto solo cambia políticas.
-- ═══════════════════════════════════════════════════════════════
