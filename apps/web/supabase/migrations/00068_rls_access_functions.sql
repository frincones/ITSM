-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00068: FUNCIONES DE ACCESO PARA RLS
-- NovaDesk ITSM — corrección de la fuga entre clientes, paso 1 de 3
-- ═══════════════════════════════════════════════════════════════
-- Para qué va
-- -----------
-- Las tres organizaciones (Podenza, Prosuministros, TDX) comparten un único
-- tenant, así que `tenant_id` no las separa — las separa `organization_id`.
-- Doce tablas tienen esa columna y no la usan en sus políticas, de modo que
-- un usuario de Podenza que consulte la API con su sesión ve los datos de
-- Prosuministros, y al revés.
--
-- Esta migración NO corrige ninguna política todavía. Solo deja disponibles
-- las dos funciones sobre las que se apoyarán 00069 y 00070, para que ese
-- paso sea reversible por sí solo y este no cambie lo que ve nadie.
--
-- Por qué no basta con aplicar 00043
-- ----------------------------------
-- 00043 existe en el repositorio desde hace tiempo, fue escrita exactamente
-- para esto, y NUNCA llegó a producción. Al ensayarla dentro de una
-- transacción revertida falla para TODOS los usuarios, administradores
-- incluidos:
--
--   ERROR: 42501: permission denied for function is_staff_agent
--
-- La causa: 00043 crea las funciones pero nunca otorga GRANT EXECUTE, y
-- 00060_function_grants.sql tampoco las incluye. Lo más probable es que se
-- intentara aplicar, rompiera la aplicación y se revirtiera — dejando el
-- archivo en el repositorio y la fuga en producción.
--
-- De ahí que esta migración exista: son las mismas funciones CON sus
-- permisos, y los grants quedan además en 00060 para que no se pierdan la
-- próxima vez que alguien regenere ese archivo.
--
-- Riesgo: ninguno. Crear funciones no altera ninguna fila ni ninguna
-- política. Nadie cambia lo que ve hasta 00069.
--
-- Depende de: 00021 (organizations, organization_users), 00017 (agents)
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. is_staff_agent — ¿quien pregunta trabaja para TDX?
-- ---------------------------------------------------------------
-- El personal ve todos los clientes, y eso es deliberado.
--
-- Se consideró restringirlo por `agent_organizations` y se descartó con
-- datos: esas asignaciones están incompletas. Si se usaran como regla de
-- acceso, Admin NovaDesk perdería 244 tickets, Emma 4 y Freddy 1 — gente
-- que hoy atiende esos casos dejaría de verlos. La tabla sirve para saber
-- quién lleva a quién, no para decidir quién puede leer qué.
--
-- `readonly` queda fuera a propósito: es el rol de los usuarios de cliente.

CREATE OR REPLACE FUNCTION is_staff_agent()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agents
    WHERE user_id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'supervisor', 'agent')
  );
$$;

COMMENT ON FUNCTION is_staff_agent() IS
  'TRUE si quien consulta es personal de TDX (admin, supervisor o agente activo). El personal ve todas las organizaciones: restringirlo por agent_organizations dejaría a administradores sin tickets que atienden.';

-- ---------------------------------------------------------------
-- 2. has_org_access — ¿pertenece a esta organización?
-- ---------------------------------------------------------------
-- Dos caminos de pertenencia, y los dos hacen falta:
--   * organization_users  — el usuario de cliente (Camilo, Daniel...)
--   * agent_organizations — un agente asignado a esa cuenta
--
-- Devuelve FALSE cuando org_id es NULL, y eso importa: hay un ticket
-- huérfano sin organización, y los catálogos internos de TDX (assets, slas)
-- tampoco la tienen. Lo correcto es que un cliente no los vea; el personal
-- los sigue viendo por is_staff_agent().

CREATE OR REPLACE FUNCTION has_org_access(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT org_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = org_id
        AND ou.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM agent_organizations ao
      JOIN agents a ON a.id = ao.agent_id
      WHERE a.user_id = auth.uid()
        AND a.is_active = true
        AND ao.organization_id = org_id
    )
  );
$$;

COMMENT ON FUNCTION has_org_access(uuid) IS
  'TRUE si quien consulta pertenece a esa organización, como usuario de cliente o como agente asignado. FALSE cuando org_id es NULL: un registro sin organización no pertenece a ningún cliente.';

-- ---------------------------------------------------------------
-- 3. LOS PERMISOS — lo que le faltaba a 00043
-- ---------------------------------------------------------------
-- Sin esto las funciones existen pero el rol `authenticated` no puede
-- ejecutarlas, y cualquier política que las use rompe TODA lectura con
-- "permission denied for function" — para el personal igual que para los
-- clientes. Es exactamente el fallo que dejó 00043 sin aplicar.

GRANT EXECUTE ON FUNCTION is_staff_agent() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION has_org_access(uuid) TO authenticated, service_role;

-- PostgREST necesita recargar para exponer las funciones nuevas.
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
-- -- 1) las funciones existen y son ejecutables por authenticated
-- SELECT p.proname,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS puede_authenticated
--   FROM pg_proc p
--  WHERE p.proname IN ('is_staff_agent', 'has_org_access');
-- -- esperado: 2 filas, ambas con puede_authenticated = true
--
-- -- 2) responden correctamente para un administrador
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<user_id de un admin>","role":"authenticated"}';
-- SELECT is_staff_agent() AS deberia_ser_true;
-- ROLLBACK;
--
-- -- 3) nada cambió todavía: cada usuario sigue viendo lo mismo
-- --    node scripts/mcp/verify-rls.mjs
--
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS has_org_access(uuid);
--   DROP FUNCTION IF EXISTS is_staff_agent();
--   NOTIFY pgrst, 'reload schema';
--
-- Seguro mientras 00069 y 00070 no estén aplicadas. Si lo están, revertir
-- primero esas: sus políticas dependen de estas funciones, y borrarlas
-- dejaría toda lectura rota.
-- ═══════════════════════════════════════════════════════════════
