-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00052: COLOMBIAN PUBLIC HOLIDAYS 2026-2027
-- ═══════════════════════════════════════════════════════════════
-- The SLA clock runs "de lunes a viernes de 8:00 a.m. a 5:00 p.m., hora de
-- Colombia, excluyendo festivos" (contract cl. 4). The calendar created in
-- 00048 carries the weekly schedule; this adds the holidays it excludes.
--
-- A misplaced holiday shifts a whole month's compliance, so these are computed
-- rather than transcribed:
--
--   · Six FIXED dates that are never moved: 1 Jan, 1 May, 20 Jul, 7 Aug,
--     8 Dec, 25 Dec. Three of them fall on a Saturday in 2027 — correct, and
--     harmless here since Saturday is not a working day anyway.
--   · Seven moved to the following Monday under Ley 51 de 1983 (Ley Emiliani):
--     Reyes, San Jose, San Pedro, Asuncion, Dia de la Raza, Todos los Santos,
--     Independencia de Cartagena.
--   · Five Easter-derived. Jueves and Viernes Santo keep their date; Ascension
--     (+39), Corpus Christi (+60) and Sagrado Corazon (+68) move to the
--     following Monday.
--
-- Easter: 2026-04-05 and 2027-03-28. 18 holidays per year, which is the
-- expected count for Colombia.
--
-- MUST be applied BEFORE 00053, whose backfill computes SLA deadlines — a
-- deadline computed before these rows exist would run straight through them.
--
-- Depends on: 00048 (creates the calendar these attach to).

DO $holidays$
DECLARE
  v_calendar_id uuid;
  v_tenant_id   uuid;
  v_inserted    integer := 0;
  v_row         record;
BEGIN
  SELECT id, tenant_id INTO v_calendar_id, v_tenant_id
  FROM calendars
  WHERE name = 'Horario Hábil Colombia (L-V 8-17)'
  LIMIT 1;

  IF v_calendar_id IS NULL THEN
    RAISE NOTICE '[00052] Calendar "Horario Hábil Colombia (L-V 8-17)" not found — skipping. Apply 00048 first.';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      (DATE '2026-01-01', 'Ano Nuevo'),
      (DATE '2026-01-12', 'Reyes Magos'),
      (DATE '2026-03-23', 'San Jose'),
      (DATE '2026-04-02', 'Jueves Santo'),
      (DATE '2026-04-03', 'Viernes Santo'),
      (DATE '2026-05-01', 'Dia del Trabajo'),
      (DATE '2026-05-18', 'Ascension del Senor'),
      (DATE '2026-06-08', 'Corpus Christi'),
      (DATE '2026-06-15', 'Sagrado Corazon'),
      (DATE '2026-06-29', 'San Pedro y San Pablo'),
      (DATE '2026-07-20', 'Dia de la Independencia'),
      (DATE '2026-08-07', 'Batalla de Boyaca'),
      (DATE '2026-08-17', 'Asuncion de la Virgen'),
      (DATE '2026-10-12', 'Dia de la Raza'),
      (DATE '2026-11-02', 'Todos los Santos'),
      (DATE '2026-11-16', 'Independencia de Cartagena'),
      (DATE '2026-12-08', 'Inmaculada Concepcion'),
      (DATE '2026-12-25', 'Navidad'),
      (DATE '2027-01-01', 'Ano Nuevo'),
      (DATE '2027-01-11', 'Reyes Magos'),
      (DATE '2027-03-22', 'San Jose'),
      (DATE '2027-03-25', 'Jueves Santo'),
      (DATE '2027-03-26', 'Viernes Santo'),
      (DATE '2027-05-01', 'Dia del Trabajo'),
      (DATE '2027-05-10', 'Ascension del Senor'),
      (DATE '2027-05-31', 'Corpus Christi'),
      (DATE '2027-06-07', 'Sagrado Corazon'),
      (DATE '2027-07-05', 'San Pedro y San Pablo'),
      (DATE '2027-07-20', 'Dia de la Independencia'),
      (DATE '2027-08-07', 'Batalla de Boyaca'),
      (DATE '2027-08-16', 'Asuncion de la Virgen'),
      (DATE '2027-10-18', 'Dia de la Raza'),
      (DATE '2027-11-01', 'Todos los Santos'),
      (DATE '2027-11-15', 'Independencia de Cartagena'),
      (DATE '2027-12-08', 'Inmaculada Concepcion'),
      (DATE '2027-12-25', 'Navidad')
    ) AS t(d, name)
  LOOP
    -- calendar_holidays has no unique constraint on (calendar_id, date), so the
    -- guard is explicit and the migration stays re-runnable.
    IF NOT EXISTS (
      SELECT 1 FROM calendar_holidays
      WHERE calendar_id = v_calendar_id AND date = v_row.d
    ) THEN
      INSERT INTO calendar_holidays (tenant_id, calendar_id, name, date, is_recurring)
      VALUES (v_tenant_id, v_calendar_id, v_row.name, v_row.d, false);
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '[00052] % holidays inserted (of 36 for 2026-2027).', v_inserted;
END $holidays$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DELETE FROM calendar_holidays
--    WHERE date BETWEEN DATE '2026-01-01' AND DATE '2027-12-31'
--      AND calendar_id = (SELECT id FROM calendars
--                          WHERE name = 'Horario Hábil Colombia (L-V 8-17)');
--
-- 2028 onward is not covered. Before 2028 starts, re-run the generator in this
-- migration's history for the new year — is_recurring is deliberately false
-- because the Emiliani and Easter dates move every year.
-- ═══════════════════════════════════════════════════════════════
