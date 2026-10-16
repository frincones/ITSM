-- ═══════════════════════════════════════════════════════════════
-- 00080 · Escala de esfuerzo por organización (Fase G)
-- ═══════════════════════════════════════════════════════════════
--
-- ESTA MIGRACIÓN TOCA LO QUE SE COBRA. Va sola y en su propia ventana a
-- propósito, separada de 00076-00079, que solo medían.
--
-- ───────────────────────────────────────────────────────────────
-- EL CONFLICTO QUE RESUELVE
-- ───────────────────────────────────────────────────────────────
-- Hay dos escalas de talla → unidad, y no coinciden:
--
--                        S    M    L    XL
--   Implementado (00067)  1    3    8    13      Fibonacci, para estimar
--   Anexo C               1    2    4    —       créditos facturables
--
-- La primera es esfuerzo relativo: sirve para planificar un ciclo. La
-- segunda determina CUÁNTO SE FACTURA Y CUÁNTO SE DESCUENTA, porque
-- cycle_delivery_compliance (00079) multiplica los créditos del ítem por el
-- valor del crédito del plan.
--
-- Mantener las dos en paralelo con el mismo nombre es cómo se acaba
-- facturando por la equivocada.
--
-- ───────────────────────────────────────────────────────────────
-- POR QUÉ POR ORGANIZACIÓN Y NO SOLO CAMBIAR LOS VALORES
-- ───────────────────────────────────────────────────────────────
-- `idx_effort_conversion_current` es UNIQUE (tenant_id, size), así que hoy
-- Podenza y Prosuministros no pueden tener tallas distintas. Las tres
-- organizaciones comparten un tenant.
--
-- Si se cambiara la escala a la del Anexo C sin más, se le aplicaría a
-- Prosuministros una tabla pactada con Podenza. Y el Anexo C solo rige
-- para Podenza.
--
-- Así que la escala pasa a ser por organización, con `organization_id`
-- nullable para la escala por defecto del tenant. La de Podenza se siembra
-- con los valores del contrato; las demás siguen con la Fibonacci que ya
-- tenían, sin que nadie note el cambio.
--
-- ───────────────────────────────────────────────────────────────
-- POR QUÉ ES SEGURO HOY (y cada día lo es menos)
-- ───────────────────────────────────────────────────────────────
-- Medido el 16-oct-2026:
--
--   tickets con effort_size            4  (los 4 de prueba [DEMO])
--   tickets REALES estimados           0
--   ciclos cerrados                    0
--   filas en billing_plans             0
--
-- Ningún ítem real tiene puntos congelados, así que cambiar la escala no
-- altera ninguna cifra existente. Es el momento más barato, y el coste
-- crece con cada ítem que se estime.
--
-- El valor se CONGELA en `tickets.effort_points` al estimar (00067), así
-- que lo ya estimado nunca se recalcula: cambiar la tabla afecta a lo que
-- se estime desde ahora.
--
-- ───────────────────────────────────────────────────────────────
-- QUÉ NO TOCA
-- ───────────────────────────────────────────────────────────────
-- NADA del SLA de soporte (00047-00063). En particular no se toca
-- `organization_support_contracts`, que gobierna la cuota de soporte y está
-- en reportes entregados: el contrato Professional de Podenza (30 tickets,
-- $1.000.000) sigue intacto.
--
-- Esta migración no decide si Podenza pasa a Enterprise. Eso es cargar una
-- fila en `billing_plans`, y se deja fuera a propósito — ver la nota final.
--
-- Verificar antes y después:
--   node scripts/mcp/baseline-soporte.mjs --esperado
--   node scripts/mcp/verify-00067.mjs
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. La escala pasa a ser por organización
-- ---------------------------------------------------------------

ALTER TABLE effort_conversion
  ADD COLUMN IF NOT EXISTS organization_id uuid
    REFERENCES organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN effort_conversion.organization_id IS
  'La organización a la que aplica esta escala. NULL = la escala por defecto del tenant. Existe porque las tres organizaciones comparten tenant y el Anexo C solo rige para Podenza.';

-- El índice viejo impedía dos escalas vigentes para la misma talla en el
-- tenant, que es justo lo que ahora hace falta.
DROP INDEX IF EXISTS idx_effort_conversion_current;

-- Dos índices porque un UNIQUE con columna nullable no distingue NULL de
-- NULL en Postgres: sin separarlos se podrían colar dos escalas por defecto
-- para la misma talla.
CREATE UNIQUE INDEX IF NOT EXISTS idx_effort_conversion_current_org
  ON effort_conversion (tenant_id, organization_id, size)
  WHERE effective_to IS NULL AND organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_effort_conversion_current_default
  ON effort_conversion (tenant_id, size)
  WHERE effective_to IS NULL AND organization_id IS NULL;

-- ---------------------------------------------------------------
-- 2. La función que resuelve la precedencia
-- ---------------------------------------------------------------
-- Lo pactado con la organización gana a la escala general del tenant. Es el
-- mismo criterio que phase_target_days (00077), para que no haya dos reglas
-- de precedencia distintas que alguien tenga que recordar.

CREATE OR REPLACE FUNCTION effort_points_for(
  p_tenant_id       uuid,
  p_organization_id uuid,
  p_size            effort_size,
  p_at              date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.points
    FROM effort_conversion e
   WHERE e.tenant_id = p_tenant_id
     AND e.size = p_size
     AND (e.organization_id = p_organization_id OR e.organization_id IS NULL)
     AND e.effective_from <= p_at
     AND (e.effective_to IS NULL OR e.effective_to >= p_at)
   ORDER BY (e.organization_id IS NOT NULL) DESC, e.effective_from DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION effort_points_for(uuid, uuid, effort_size, date) IS
  'Puntos de una talla resolviendo la precedencia: lo pactado con la organización gana a la escala general del tenant. Misma regla que phase_target_days, para no tener dos criterios distintos.';

GRANT EXECUTE ON FUNCTION effort_points_for(uuid, uuid, effort_size, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. La escala del Anexo C para Podenza
-- ---------------------------------------------------------------
-- S=1, M=2, L=4. Sin XL: el Anexo C no define esa talla.
--
-- La vigencia arranca el 22-sep-2026, la fecha de inicio del contrato de
-- Podenza en la base, para que lo que se estime quede coherente con el
-- acuerdo desde su primer día.
--
-- La escala Fibonacci del tenant NO se toca: sigue vigente con
-- organization_id NULL y la heredan Prosuministros, ITSM-TDX y cualquier
-- cliente nuevo. Nadie más nota este cambio.

INSERT INTO effort_conversion (tenant_id, organization_id, size, points, effective_from)
SELECT o.tenant_id, o.id, v.size, v.pts, DATE '2026-09-22'
  FROM organizations o
 CROSS JOIN (VALUES
    ('S'::effort_size, 1),
    ('M'::effort_size, 2),
    ('L'::effort_size, 4)
 ) AS v(size, pts)
 WHERE o.name ILIKE '%podenza%'
   AND NOT EXISTS (
     SELECT 1 FROM effort_conversion e
      WHERE e.tenant_id = o.tenant_id
        AND e.organization_id = o.id
        AND e.size = v.size
        AND e.effective_to IS NULL
   );

-- NOTA SOBRE XL. No se siembra para Podenza a propósito: el Anexo C no la
-- define. Un ítem XL de Podenza caerá en la escala por defecto del tenant
-- (13 puntos), que NO es un valor pactado. Si aparece uno, hay que decidir
-- si se parte en varios o si se negocia la talla — mejor eso que facturar
-- 13 créditos que nadie acordó.
--
-- La alternativa sería dejar XL sin puntos para que la estimación falle,
-- pero eso bloquearía el trabajo en vez de señalarlo.

-- ---------------------------------------------------------------
-- 4. Las RLS siguen igual
-- ---------------------------------------------------------------
-- Las políticas de 00067 filtran por tenant_id, que no cambia. Un cliente
-- sigue viendo la escala de su tenant: saber cuántos créditos vale una
-- talla es parte de su contrato.
--
-- No se añade un filtro por organization_id a propósito: las tres
-- organizaciones comparten tenant y ver la escala ajena no revela trabajo
-- ajeno, solo una tabla de conversión. Filtrarlo obligaría a reescribir las
-- políticas de 00067 sin ganar nada.

NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO HACE, Y POR QUÉ
-- ───────────────────────────────────────────────────────────────
-- 1. NO carga el plan Enterprise en billing_plans.
--
--    El Anexo C dice Enterprise: 14 créditos, $11.070.000/mes. El contrato
--    en la base dice Professional: 30 tickets, $1.000.000/mes. Son dos
--    acuerdos distintos y decidir cuál rige para facturar NO es una
--    decisión técnica.
--
--    Mientras billing_plans esté vacía, cycle_delivery_compliance devuelve
--    discount_cop = NULL y explica que falta el plan. Eso es correcto: es
--    mejor no dar una cifra que dar una calculada con el plan equivocado.
--
--    Para activarlo, cuando se decida:
--
--      INSERT INTO billing_plans (tenant_id, organization_id, plan_name,
--             monthly_credits, monthly_fee_cop, retention_threshold_pct,
--             effective_from)
--      SELECT o.tenant_id, o.id, 'Enterprise', 14, 11070000, 50, '2026-09-22'
--        FROM organizations o WHERE o.name ILIKE '%podenza%';
--
--    Y cuando se sepa la fecha del paso a Growth:
--
--      UPDATE billing_plans SET effective_to = '<el día anterior>'
--       WHERE plan_name = 'Enterprise';
--      INSERT INTO billing_plans (...) VALUES (..., 'Growth', 8, 7980000, ...);
--
-- 2. NO cambia organization_support_contracts.
--
--    La cuota de soporte de Podenza (30 tickets, $1.000.000) sigue igual.
--    Es otro contrato sobre otro tipo de trabajo, y está en reportes ya
--    entregados.
--
-- ───────────────────────────────────────────────────────────────
-- ROLLBACK
-- ───────────────────────────────────────────────────────────────
-- DELETE FROM effort_conversion WHERE organization_id IS NOT NULL;
-- DROP FUNCTION IF EXISTS effort_points_for(uuid, uuid, effort_size, date);
-- DROP INDEX IF EXISTS idx_effort_conversion_current_default;
-- DROP INDEX IF EXISTS idx_effort_conversion_current_org;
-- CREATE UNIQUE INDEX idx_effort_conversion_current
--   ON effort_conversion (tenant_id, size) WHERE effective_to IS NULL;
-- ALTER TABLE effort_conversion DROP COLUMN IF EXISTS organization_id;
--
-- Reversible sin pérdida: los puntos ya congelados en tickets.effort_points
-- no dependen de esta tabla.
