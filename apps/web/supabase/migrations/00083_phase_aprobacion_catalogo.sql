-- ---------------------------------------------------------------------------
-- 00083 · El catálogo de fases, corregido
-- ---------------------------------------------------------------------------
-- Tres cambios, y el segundo es la corrección de un error:
--
--   1. `aprobacion` entra entre documentación y accesos, a cargo del CLIENTE,
--      con 1 día hábil. Mide lo que tarda el cliente en aprobar el documento.
--
--   2. `levantamiento` pasa de 'cliente' a 'tdx' y PIERDE su plazo.
--      La reunión de levantamiento la convoca TDX, no el cliente. El plan
--      original ya lo decía —«Levantamiento y documento → responsable TDX»—
--      pero 00076:407 lo sembró como 'cliente' y nadie lo revisó. Los días
--      se le estaban imputando al cliente siendo de TDX: un error a favor de
--      TDX, y por eso hay que corregirlo. Un descuento calculado sobre días
--      mal atribuidos no se sostiene ante el cliente.
--      Sin plazo porque agendar una reunión no es un tramo que medir.
--
--   3. `documentacion` baja de 2 días a 1. El contrato da 2 días entre
--      documentar y aprobar, y ahora se reparten 1 + 1.
--
-- OJO: esto NO corrige los tramos YA ABIERTOS. El trigger de 00077 congela
-- `owner` y `target_days` en la fila de ticket_phase_log al abrirla, así que
-- lo que ya está en marcha conserva lo que tenía. Es deliberado —impide que
-- cambiar una regla reescriba el pasado— y por eso los tramos vivos se
-- corrigen aparte, con su propio respaldo.
-- ---------------------------------------------------------------------------

-- 1. Hueco para la fase nueva: lo que va después se corre un puesto.
UPDATE delivery_phases
   SET sort_order = sort_order + 1
 WHERE phase IN ('accesos','desarrollo','uat','despliegue','entregado','descartado');

-- 2. La fase nueva, para cada tenant que ya tenga el catálogo.
INSERT INTO delivery_phases
       (tenant_id, phase, sort_order, name, owner, generates_credit, is_terminal)
SELECT DISTINCT d.tenant_id, 'aprobacion'::requirement_phase, 3::smallint,
       'Aprobación del documento', 'cliente', false, false
  FROM delivery_phases d
ON CONFLICT (tenant_id, phase) DO NOTHING;

-- 3. El levantamiento es de TDX.
UPDATE delivery_phases SET owner = 'tdx' WHERE phase = 'levantamiento';

-- 4. Los plazos. Sin fila en phase_sla_targets = sin plazo, igual que
--    `propuesto`: la fase se ve en el tablero pero no puede incumplir.
DELETE FROM phase_sla_targets WHERE phase = 'levantamiento';

UPDATE phase_sla_targets SET target_days = 1 WHERE phase = 'documentacion';

INSERT INTO phase_sla_targets (tenant_id, phase, target_days, effective_from)
SELECT DISTINCT t.tenant_id, 'aprobacion'::requirement_phase, 1, CURRENT_DATE
  FROM phase_sla_targets t
 WHERE NOT EXISTS (
         SELECT 1 FROM phase_sla_targets x
          WHERE x.tenant_id = t.tenant_id AND x.phase = 'aprobacion'
       );
