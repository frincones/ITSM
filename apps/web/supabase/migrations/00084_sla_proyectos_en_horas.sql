-- ---------------------------------------------------------------------------
-- 00084 · El reloj del Anexo C pasa a horas hábiles
-- ---------------------------------------------------------------------------
-- Medir en días enteros falsea los veredictos. Caso real: la reunión de
-- levantamiento de R1 fue el martes a las 12:00 y el documento salió esa misma
-- noche a las 00:25. En días son dos; en horas hábiles son cuatro, y la fase
-- pasa de «incumple» a «en plazo» holgado.
--
-- LO QUE NO SE TOCA, Y ES DELIBERADO:
--
--   working_days_between() se queda como está. La usa agent_capacity_status
--   para las horas disponibles del equipo, que SÍ se cuentan por días hábiles.
--   Mutarla multiplicaría la capacidad por ~480 y ningún test lo vería.
--
--   El SLA de soporte no comparte ninguna función con este. Verificado:
--   business_minutes_between solo la usa ticket_paused_business_minutes, y
--   working_days_between solo las cuatro de proyectos más la de capacidad.
--
-- Se añaden columnas NUEVAS en vez de reinterpretar las viejas, para que no
-- puedan convivir días y minutos en la misma cuenta sin que nadie lo note.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. El calendario de proyectos
-- ---------------------------------------------------------------------------
-- Propio, no el de soporte: el calendario «Colombia 8-17» lo usa el contrato
-- de soporte de Podenza y tocarlo movería las cifras de ese SLA.
--
-- 8:00–16:00 son las 8 horas efectivas de la jornada, con el almuerzo ya
-- descontado. Se modela seguido porque calendar_schedules tiene UNIQUE
-- (calendar_id, day_of_week) y solo admite un tramo por día; partirlo en
-- mañana y tarde exigiría tocar esa restricción, que es de soporte. Lo que
-- importa del contrato es que la jornada sume 8 horas, no dónde cae el
-- almuerzo.

INSERT INTO calendars (tenant_id, name, description, timezone)
SELECT t.id,
       'Proyectos · Anexo C',
       'Jornada de 8 horas hábiles (almuerzo descontado), lunes a viernes, '
       || 'hora de Colombia, sin festivos. Solo para el SLA de entregas.',
       'America/Bogota'
  FROM tenants t
 WHERE NOT EXISTS (
         SELECT 1 FROM calendars c
          WHERE c.tenant_id = t.id AND c.name = 'Proyectos · Anexo C'
       );

INSERT INTO calendar_schedules (tenant_id, calendar_id, day_of_week, start_time, end_time)
SELECT c.tenant_id, c.id, d.dow, '08:00'::time, '16:00'::time
  FROM calendars c
 CROSS JOIN generate_series(1, 5) AS d(dow)
 WHERE c.name = 'Proyectos · Anexo C'
   AND NOT EXISTS (
         SELECT 1 FROM calendar_schedules s
          WHERE s.calendar_id = c.id AND s.day_of_week = d.dow
       );

-- Los mismos festivos que ya están cargados para Colombia: si un día no es
-- hábil para soporte, tampoco lo es para proyectos.
INSERT INTO calendar_holidays (tenant_id, calendar_id, name, date)
SELECT h.tenant_id, dst.id, h.name, h.date
  FROM calendar_holidays h
  JOIN calendars src ON src.id = h.calendar_id AND src.name ILIKE '%colombia%'
  JOIN calendars dst ON dst.tenant_id = h.tenant_id
                    AND dst.name = 'Proyectos · Anexo C'
 WHERE NOT EXISTS (
         SELECT 1 FROM calendar_holidays x
          WHERE x.calendar_id = dst.id AND x.date = h.date
       );

-- ---------------------------------------------------------------------------
-- 2. Minutos hábiles para proyectos
-- ---------------------------------------------------------------------------
-- Envuelve business_minutes_between (la de soporte, ya probada) resolviendo el
-- calendario del tenant. Así proyectos no necesita saber qué calendar_id usar
-- y soporte sigue pasando el suyo.

CREATE OR REPLACE FUNCTION project_business_minutes(
  p_tenant_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cal uuid;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_cal
    FROM calendars
   WHERE tenant_id = p_tenant_id AND name = 'Proyectos · Anexo C'
   LIMIT 1;

  -- Sin calendario no se inventa un número: 0 es visible y no miente.
  IF v_cal IS NULL THEN
    RETURN 0;
  END IF;

  RETURN business_minutes_between(v_cal, p_from, p_to);
END;
$$;

COMMENT ON FUNCTION project_business_minutes IS
  'Minutos hábiles entre dos instantes según el calendario de proyectos '
  '(L-V, 8 horas al día, festivos de Colombia fuera). Para el SLA del Anexo C. '
  'El SLA de soporte usa business_minutes_between con su propio calendario.';

GRANT EXECUTE ON FUNCTION project_business_minutes(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Las columnas en minutos
-- ---------------------------------------------------------------------------
-- Nuevas, en paralelo. Las viejas en días se quedan para no romper nada
-- mientras se migra el código, y quedan obsoletas al terminar.
--
-- numeric(7,2) y no (5,2): un desarrollo L son 40 h = 2400 min, y (5,2) tiene
-- un máximo de 999,99. Probado: 1440 no cabe.

ALTER TABLE ticket_phase_log
  ADD COLUMN IF NOT EXISTS business_minutes integer,
  ADD COLUMN IF NOT EXISTS paused_minutes   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_minutes   numeric(7,2);

ALTER TABLE phase_waits
  ADD COLUMN IF NOT EXISTS business_minutes integer,
  ADD COLUMN IF NOT EXISTS target_minutes   numeric(7,2);

ALTER TABLE phase_sla_targets
  ADD COLUMN IF NOT EXISTS target_minutes numeric(7,2);

COMMENT ON COLUMN ticket_phase_log.business_minutes IS
  'Minutos hábiles del tramo, congelados al cerrarlo. Sustituye a business_days.';
COMMENT ON COLUMN ticket_phase_log.paused_minutes IS
  'Minutos que el tramo estuvo en espera y no se imputan. Sustituye a paused_days.';
COMMENT ON COLUMN ticket_phase_log.target_minutes IS
  'Plazo en minutos hábiles, congelado al abrir el tramo. Una jornada son 480.';

-- ---------------------------------------------------------------------------
-- 4. Los plazos, convertidos
-- ---------------------------------------------------------------------------
-- 1 día hábil = 480 minutos. Documentación y aprobación reparten las 24 horas
-- del contrato en una jornada cada una.

UPDATE phase_sla_targets
   SET target_minutes = target_days * 480
 WHERE target_minutes IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Lo que ya existe, convertido
-- ---------------------------------------------------------------------------
-- Son nueve tramos, todos abiertos y ninguno con business_days: no hay
-- historial que convertir, solo el plazo congelado de cada uno.

UPDATE ticket_phase_log
   SET target_minutes = target_days * 480
 WHERE target_minutes IS NULL AND target_days IS NOT NULL;

UPDATE phase_waits
   SET target_minutes = target_days * 480
 WHERE target_minutes IS NULL AND target_days IS NOT NULL;
