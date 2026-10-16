-- ═══════════════════════════════════════════════════════════════
-- 00076 · Fases de requerimiento (Fase A del módulo de proyectos)
-- ═══════════════════════════════════════════════════════════════
--
-- Implementa el Anexo C del contrato TDX–Podenza: cada requerimiento de
-- proyecto recorre cinco fases, cada una con su reloj, su responsable y su
-- regla de atraso.
--
-- ───────────────────────────────────────────────────────────────
-- POR QUÉ UNA COLUMNA NUEVA Y NO ESTADOS NUEVOS
-- ───────────────────────────────────────────────────────────────
-- La propuesta inicial era añadir 9 valores `req_*` al enum ticket_status.
-- Medido el impacto, se descartó:
--
--   mapas estado→etiqueta/color        10 archivos
--   listas .in('status',[...])         24 consultas
--   declaraciones de enum/unión         3
--   claves de VALID_TRANSITIONS         9 + aristas de entrada
--   ---------------------------------------------------
--   puntos a tocar                     ~63, de los que el compilador
--                                      solo protege 1
--
-- Dos fallos serían silenciosos, no visibles:
--
--   lib/services/workspace-grouping.ts:429 descarta en silencio un ticket
--   que no coincide con ninguna regla ("drop quietly"), así que un
--   requerimiento desaparecería del workspace sin error.
--
--   lib/domain/tickets.domain.ts:381 hace VALID_TRANSITIONS[status] ?? [],
--   así que un estado sin clave congela el ticket para siempre.
--
-- Y el argumento que cierra el asunto: el enum colapsaría FASE y ESTADO DE
-- PAUSA en una sola columna. Un ítem no podría estar a la vez en fase de
-- desarrollo y detenido esperando al cliente — y `resolve_pause_reason`
-- (00048:309) solo pausa el reloj en detenido/backlog/esperando_ventana.
-- La cláusula del contrato "los atrasos de PODENZA extienden el plazo de
-- TDX día por día" es literalmente pauses_sla = true. El enum la rompería.
--
-- Con la columna, un ítem en fase `accesos` es:
--     status = 'detenido'  +  pause_reason = 'dependencia_tercero'
--     +  requirement_phase = 'accesos'
-- Las tres cosas a la vez, y el reloj se pausa. Que es el contrato.
--
-- ───────────────────────────────────────────────────────────────
-- QUÉ NO TOCA — EL SLA DE SOPORTE QUEDA INTACTO
-- ───────────────────────────────────────────────────────────────
-- Las migraciones 00047-00063 (soporte, garantías y bugs) no se modifican.
-- No hace falta cuidado: los dos universos YA estaban separados por TIPO de
-- ticket desde que se construyó el SLA de soporte.
--
--   ticket_type_consumes_quota  (00048:191)  type IN (support,incident,request)
--   ticket_type_counts_for_sla  (00048:201)  type IN (support,incident,request)
--   stamp_ticket_sla            (00053:198)  filtra por el anterior
--   support_cycle_compliance    (00057:40)   filtra por sla_applies
--
-- Ninguna lee ticket_status, y los tipos de proyecto (backlog,
-- desarrollo_pendiente) nunca estuvieron en esas listas.
--
-- Medido en producción el 16-oct-2026:
--   soporte  (support/incident/request)  375 tickets,  15 con SLA activo
--   garantía (warranty)                  323 tickets,   0 con SLA activo
--   proyecto (backlog/desarrollo_pend.)   16 tickets,   0 con SLA activo
--
-- Los 15 con SLA son todos de tipo support.
--
-- EL CHECK DE ESTA MIGRACIÓN es la garantía mecánica: hace imposible
-- escribir una fase en un ticket de soporte, ni por error de código.
--
-- Verificar antes y después:
--   node scripts/mcp/baseline-soporte.mjs --esperado
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM: requirement_phase
-- ---------------------------------------------------------------
-- Nueve valores: las cinco fases del Anexo C, más 'propuesto' (lo que el
-- cliente pidió y aún no se tria), 'entregado' y 'descartado' como estados
-- terminales, y 'levantamiento' separado de 'documentacion' porque el
-- proceso real tiene dos tramos distintos — ver sección 4.
--
-- Tipo NUEVO, así que no aplica la restricción de Postgres de no usar un
-- valor de enum en la misma transacción que lo crea (la razón por la que
-- 00025, 00026, 00047 y 00073 van cada una sola).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirement_phase') THEN
    CREATE TYPE requirement_phase AS ENUM (
      'propuesto',       -- pedido por el cliente, sin triar
      'levantamiento',   -- reunión agendada / realizada
      'documentacion',   -- TDX redacta y van las revisiones
      'accesos',         -- fase fundacional: credenciales, entornos
      'desarrollo',      -- fase 3 del contrato: LA QUE GENERA DESCUENTO
      'uat',             -- pruebas de aceptación del cliente
      'despliegue',      -- puesta en producción
      'entregado',       -- terminal: cerrado conforme
      'descartado'       -- terminal: salió del alcance
    );
  END IF;
END $$;

COMMENT ON TYPE requirement_phase IS
  'Fase del Anexo C por la que va un requerimiento de proyecto. Es independiente de ticket_status: un ítem en fase desarrollo puede estar in_progress o detenido, y solo detenido pausa el reloj del SLA.';

-- ---------------------------------------------------------------
-- 2. COLUMNA: tickets.requirement_phase
-- ---------------------------------------------------------------
-- Nullable y sin valor por defecto: un ticket de soporte no tiene fase, y
-- un requerimiento no la tiene hasta que el PM lo tria.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS requirement_phase requirement_phase;

COMMENT ON COLUMN tickets.requirement_phase IS
  'Fase del contrato en la que va este requerimiento. NULL en todo lo que no sea trabajo de proyecto. No afecta a la facturación: support_cycle_usage() y support_cycle_compliance() filtran por tipo de ticket, no por esta columna.';

-- ---------------------------------------------------------------
-- 2.1 EL CHECK — la garantía de aislamiento
-- ---------------------------------------------------------------
-- Un ticket de soporte, incidente, petición o garantía NUNCA lleva fase de
-- requerimiento. Esto no es una convención: es una restricción de la base.
--
-- POR QUÉ IMPORTA, concretamente. `set_updated_at` (00004:164) es el único
-- trigger sobre tickets SIN cláusula `OF <columna>`, así que se dispara al
-- escribir cualquier columna, incluida esta. Solo escribe updated_at, pero
-- updated_at alimenta ticket_dates_plausible() (00062:41), que filtra la
-- cuota y el cumplimiento. 00062 lo dejó advertido:
--
--   "tocar un ticket corrupto hoy repara su updated_at y volvería a
--    colarse en el conteo"
--
-- Medido: en el ciclo vigente de Podenza hay 7 tickets de soporte con
-- fechas imposibles, y los 7 tienen sla_applies = false, así que no podrían
-- entrar al denominador ni generar un peso de crédito. Pero el riesgo es
-- estructural y no quiero depender de que sigan así.
--
-- Con este CHECK, el módulo de proyectos no puede tocar una fila de
-- soporte. El acoplamiento queda cerrado por la base, no por disciplina.

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_phase_only_project;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_phase_only_project
  CHECK (
    requirement_phase IS NULL
    OR type IN ('backlog', 'desarrollo_pendiente')
  );

COMMENT ON CONSTRAINT tickets_phase_only_project ON tickets IS
  'Impide escribir una fase de requerimiento en un ticket de soporte, garantía o incidente. Garantía mecánica de que el módulo de proyectos no puede alterar el updated_at de una fila que entra en el cálculo de cuota o cumplimiento.';

-- Índice para el tablero de fases: filtra por fase y excluye lo terminal.
CREATE INDEX IF NOT EXISTS idx_tickets_requirement_phase
  ON tickets (tenant_id, requirement_phase)
  WHERE requirement_phase IS NOT NULL
    AND requirement_phase NOT IN ('entregado', 'descartado');

-- ---------------------------------------------------------------
-- 3. TABLA: delivery_phases — el catálogo de las fases
-- ---------------------------------------------------------------
-- Qué es cada fase, en qué orden va, de quién es el reloj y si su
-- incumplimiento genera descuento. Es catálogo, no configuración por
-- cliente: las fases son del proceso, los plazos sí son del contrato
-- (sección 4).

CREATE TABLE IF NOT EXISTS delivery_phases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phase         requirement_phase NOT NULL,
  sort_order    smallint NOT NULL,
  name          text NOT NULL,
  -- De quién es el reloj mientras el ítem está en esta fase. Determina a
  -- quién se le imputa el atraso.
  owner         text NOT NULL CHECK (owner IN ('tdx', 'cliente', 'tercero', 'ninguno')),
  -- ¿Incumplir el plazo de esta fase genera descuento? Solo la fase 3 del
  -- Anexo C ("Desarrollo y pruebas"), porque es la única de la que TDX
  -- responde contractualmente.
  generates_credit boolean NOT NULL DEFAULT false,
  -- ¿Es una fase terminal? Un ítem aquí ya no consume reloj.
  is_terminal   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phase)
);

COMMENT ON TABLE delivery_phases IS
  'Catálogo de las fases del Anexo C: orden, responsable del reloj y si generan descuento. Solo la fase de desarrollo genera descuento, porque es la única de la que TDX responde.';

CREATE TABLE IF NOT EXISTS phase_sla_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- NULL = el plazo por defecto del tenant. Con valor = el plazo pactado
  -- con esa organización, que prevalece.
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  phase           requirement_phase NOT NULL,
  -- NULL = el plazo aplica a cualquier talla. Con valor = el plazo de esa
  -- talla concreta, como la fase 3 del contrato (S:3 M:4 L:5).
  size            effort_size,
  target_days     numeric(5,2) NOT NULL CHECK (target_days > 0),
  -- Versionado por vigencia, igual que effort_conversion (00067): cambiar
  -- un plazo no recalcula lo ya medido.
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE phase_sla_targets IS
  'Plazo en días hábiles de cada fase, opcionalmente por organización y por talla. Versionado por vigencia: cambiar un plazo afecta a lo que se mida desde entonces, nunca a lo ya facturado.';

-- Un solo plazo vigente por combinación. Dos índices porque un UNIQUE con
-- columnas nullable no distingue NULL de NULL en Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_sla_current_org_size
  ON phase_sla_targets (tenant_id, organization_id, phase, size)
  WHERE effective_to IS NULL AND organization_id IS NOT NULL AND size IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_sla_current_org_nosize
  ON phase_sla_targets (tenant_id, organization_id, phase)
  WHERE effective_to IS NULL AND organization_id IS NOT NULL AND size IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_sla_current_default_size
  ON phase_sla_targets (tenant_id, phase, size)
  WHERE effective_to IS NULL AND organization_id IS NULL AND size IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_sla_current_default_nosize
  ON phase_sla_targets (tenant_id, phase)
  WHERE effective_to IS NULL AND organization_id IS NULL AND size IS NULL;

-- ---------------------------------------------------------------
-- 4. TABLA: billing_plans — Enterprise / Growth del Anexo C
-- ---------------------------------------------------------------
-- El Anexo C factura por CRÉDITOS POR TALLA, no por tickets. No es lo
-- mismo: 14 créditos pueden ser 14 ítems S o 3 ítems L.
--
-- Va en tabla propia y NO toca organization_support_contracts, que gobierna
-- la cuota de soporte (00048) y está en reportes entregados. Son dos
-- acuerdos sobre dos tipos de trabajo.
--
-- Vigencia abierta porque la fecha del cambio Enterprise → Growth todavía
-- no está definida: cuando se decida, se cierra esta vigencia y se abre la
-- siguiente, sin recalcular lo ya medido.

CREATE TABLE IF NOT EXISTS billing_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_name        text NOT NULL,
  -- Créditos del plan por ciclo. El Anexo C: Enterprise 14, Growth 8.
  monthly_credits  integer NOT NULL CHECK (monthly_credits > 0),
  monthly_fee_cop  numeric(14,2) NOT NULL CHECK (monthly_fee_cop >= 0),
  -- Umbral de entrega bajo el cual el cliente puede retener el pago del
  -- ciclo. El Anexo C: 50%.
  retention_threshold_pct numeric(5,2) NOT NULL DEFAULT 50
                            CHECK (retention_threshold_pct BETWEEN 0 AND 100),
  effective_from   date NOT NULL DEFAULT CURRENT_DATE,
  effective_to     date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE billing_plans IS
  'Plan de entrega por créditos del Anexo C (Enterprise/Growth), versionado por vigencia. Separado de organization_support_contracts, que gobierna la cuota de soporte: son dos acuerdos sobre dos tipos de trabajo.';

COMMENT ON COLUMN billing_plans.monthly_credits IS
  'Créditos facturables por ciclo. Distinto de effort_points (esfuerzo interno) y de credit_cop (descuento por incumplir el SLA de respuesta). Tres nombres para tres cosas.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_plans_current
  ON billing_plans (tenant_id, organization_id)
  WHERE effective_to IS NULL;

-- DROP antes de CREATE porque CREATE TRIGGER no admite IF NOT EXISTS, y sin
-- esto reaplicar la migración falla con "trigger already exists".
DROP TRIGGER IF EXISTS set_updated_at ON billing_plans;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON billing_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------
-- Patrón de effort_conversion (00067:95) para los catálogos de fases: el
-- personal lee para trabajar, solo admin escribe porque los plazos tienen
-- consecuencia económica.
--
-- Los GRANTs de is_staff_agent() y has_org_access() los puso 00068, que
-- existe precisamente porque 00043 creó las funciones y olvidó los grants,
-- lo que rompía TODA lectura con "permission denied for function".

ALTER TABLE delivery_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_phases FORCE ROW LEVEL SECURITY;

-- El catálogo de fases lo ve cualquiera del tenant, cliente incluido: el
-- portal muestra en qué fase va cada requerimiento, así que necesita leer
-- los nombres y el orden.
DROP POLICY IF EXISTS delivery_phases_select ON delivery_phases;
CREATE POLICY delivery_phases_select ON delivery_phases
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS delivery_phases_write ON delivery_phases;
CREATE POLICY delivery_phases_write ON delivery_phases
  FOR ALL TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  )
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  );

ALTER TABLE phase_sla_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_sla_targets FORCE ROW LEVEL SECURITY;

-- Un cliente ve los plazos que le aplican: los suyos y los del tenant.
-- Saber el plazo es la mitad de poder exigirlo.
DROP POLICY IF EXISTS phase_sla_targets_select ON phase_sla_targets;
CREATE POLICY phase_sla_targets_select ON phase_sla_targets
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (
      is_staff_agent()
      OR organization_id IS NULL
      OR has_org_access(organization_id)
    )
  );

DROP POLICY IF EXISTS phase_sla_targets_write ON phase_sla_targets;
CREATE POLICY phase_sla_targets_write ON phase_sla_targets
  FOR ALL TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  )
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  );

ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_plans FORCE ROW LEVEL SECURITY;

-- El cliente ve su propio plan: cuántos créditos tiene y qué paga. Es su
-- contrato.
DROP POLICY IF EXISTS billing_plans_select ON billing_plans;
CREATE POLICY billing_plans_select ON billing_plans
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (is_staff_agent() OR has_org_access(organization_id))
  );

-- Escritura solo admin: cambia lo que se cobra.
DROP POLICY IF EXISTS billing_plans_write ON billing_plans;
CREATE POLICY billing_plans_write ON billing_plans
  FOR ALL TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  )
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.user_id = auth.uid() AND a.is_active = true AND a.role = 'admin'
    )
  );

-- ---------------------------------------------------------------
-- 6. SIEMBRA: las fases del Anexo C
-- ---------------------------------------------------------------
-- El responsable de cada fase sale del proceso real, confirmado con el
-- equipo el 16-oct-2026:
--
--   "El documento funcional lo redactamos en TDX, luego de tener la reunión
--    de levantamiento con el cliente. Primero se agenda, luego se tiene la
--    reunión, se genera el documento, y luego se hace una serie de
--    revisiones. (...) En ese ida y vuelta máximo son 24 horas para
--    responder cada uno."
--
-- Por eso 'levantamiento' y 'documentacion' van separadas: la primera
-- depende de que el cliente se siente a la reunión, la segunda es trabajo
-- de TDX con turnos de ida y vuelta. Los turnos se registran en
-- phase_waits (migración 00078), no en la fase.

INSERT INTO delivery_phases (tenant_id, phase, sort_order, name, owner, generates_credit, is_terminal)
SELECT t.id, v.phase, v.ord, v.nombre, v.owner, v.credito, v.terminal
  FROM tenants t
 CROSS JOIN (VALUES
    ('propuesto'::requirement_phase,     0::smallint, 'Propuesto',                'cliente', false, false),
    ('levantamiento'::requirement_phase, 1::smallint, 'Levantamiento',            'cliente', false, false),
    ('documentacion'::requirement_phase, 2::smallint, 'Documentación funcional',  'tdx',     false, false),
    ('accesos'::requirement_phase,       3::smallint, 'Fundacional / accesos',    'cliente', false, false),
    ('desarrollo'::requirement_phase,    4::smallint, 'Desarrollo y pruebas',     'tdx',     true,  false),
    ('uat'::requirement_phase,           5::smallint, 'Pruebas de aceptación',    'cliente', false, false),
    ('despliegue'::requirement_phase,    6::smallint, 'Puesta en producción',     'ninguno', false, false),
    ('entregado'::requirement_phase,     7::smallint, 'Entregado',                'ninguno', false, true),
    ('descartado'::requirement_phase,    8::smallint, 'Descartado',               'ninguno', false, true)
 ) AS v(phase, ord, nombre, owner, credito, terminal)
ON CONFLICT (tenant_id, phase) DO NOTHING;

-- ---------------------------------------------------------------
-- 6.1 Los plazos del Anexo C, como valores por defecto del tenant
-- ---------------------------------------------------------------
--   Fase 1 · Documentación funcional     2 días hábiles   PODENZA
--   Fase 2 · Fundacional / accesos       1 día hábil      PODENZA / tercero
--   Fase 3 · Desarrollo y pruebas        S:3  M:4  L:5    TDX
--   Fase 4 · Pruebas de aceptación       2 días hábiles   PODENZA
--   Fase 5 · Puesta en producción        calendario       freeze / tercero
--
-- La fase 5 no lleva plazo: depende del calendario de freeze acordado, no
-- de un número de días.
--
-- El plazo de levantamiento (2 días) arranca el día de la reunión, como se
-- confirmó: "desde que se tiene la reunión, está bien, así debe ser la
-- fase". Los turnos de 24h del ida y vuelta se miden en phase_waits.

INSERT INTO phase_sla_targets (tenant_id, organization_id, phase, size, target_days)
SELECT t.id, NULL, v.phase, v.size, v.dias
  FROM tenants t
 CROSS JOIN (VALUES
    ('levantamiento'::requirement_phase, NULL::effort_size,     2.0),
    ('documentacion'::requirement_phase, NULL::effort_size,     2.0),
    ('accesos'::requirement_phase,       NULL::effort_size,     1.0),
    ('desarrollo'::requirement_phase,    'S'::effort_size,      3.0),
    ('desarrollo'::requirement_phase,    'M'::effort_size,      4.0),
    ('desarrollo'::requirement_phase,    'L'::effort_size,      5.0),
    ('uat'::requirement_phase,           NULL::effort_size,     2.0)
 ) AS v(phase, size, dias)
WHERE NOT EXISTS (
  SELECT 1 FROM phase_sla_targets p
   WHERE p.tenant_id = t.id
     AND p.phase = v.phase
     AND p.size IS NOT DISTINCT FROM v.size
     AND p.organization_id IS NULL
     AND p.effective_to IS NULL
);

-- NOTA SOBRE XL: el Anexo C no define talla XL, aunque effort_conversion
-- (00067) sí la tiene con 13 puntos. No se siembra plazo para XL a
-- propósito: si aparece un ítem XL, el cálculo no encontrará objetivo y lo
-- reportará como sin plazo en vez de inventarse uno. Alinear las tallas al
-- contrato (S=1 M=2 L=4, sin XL) es la fase G, que toca facturación y va en
-- su propia ventana.

-- NOTA SOBRE billing_plans: no se siembra ninguna fila. El contrato de
-- Podenza en la base es Professional / 30 tickets / $1.000.000, mientras el
-- Anexo C dice Enterprise / 14 créditos / $11.070.000. Decidir cuál rige es
-- la fase G. Sembrar el plan aquí implicaría tomar esa decisión por el
-- camino, y cambia lo que se cobra.

NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────────────────
-- ROLLBACK
-- ───────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS billing_plans;
-- DROP TABLE IF EXISTS phase_sla_targets;
-- DROP TABLE IF EXISTS delivery_phases;
-- ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_phase_only_project;
-- DROP INDEX IF EXISTS idx_tickets_requirement_phase;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS requirement_phase;
-- DROP TYPE IF EXISTS requirement_phase;
--
-- Reversible por completo, a diferencia de ALTER TYPE ADD VALUE sobre
-- ticket_status, que Postgres no permite deshacer.
