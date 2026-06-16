-- Migration: 00046_cron_frequency_reduce.sql
-- Description: Right-size pg_cron cadence to actual volume. The schedules in
--              00035 were copied from high-volume helpdesk defaults
--              (csat every 5 min, reconcile every 10 min). This deployment
--              handles ~4 tickets/day created, 6-10 closed, <=3 users/day, on a
--              ~1 GB (Micro/Free) instance whose Disk IO budget is small. The
--              constant cron wake-ups (~456 runs/day) drained the IO budget 24/7
--              and took the DB offline (522) on 2026-06-14. This cuts background
--              cron load ~93% (~456 -> ~34 runs/day).
--
--              NOTE: the live DB was already altered via cron.alter_job on
--              2026-06-16; this migration only versions that change. Idempotent
--              (unschedule-by-name then reschedule), safe to re-run.
--
--              Schedules are UTC. Deployment timezone is America/Guatemala (UTC-6).
-- Date: 2026-06-16
-- Author: emma.castillo

-- ========================================
-- SECTION 1: UNSCHEDULE (idempotent)
-- ========================================
DO $$
DECLARE j_name text;
BEGIN
  FOREACH j_name IN ARRAY ARRAY['csat-dispatcher', 'inbound-email-reconcile']
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j_name) THEN
      PERFORM cron.unschedule(j_name);
    END IF;
  END LOOP;
END $$;

-- ========================================
-- SECTION 2: RESCHEDULE AT REDUCED CADENCE
-- ========================================
-- CSAT/NPS dispatcher: 2x/day at 09:00 and 16:00 America/Guatemala
-- (15:00 and 22:00 UTC). Surveys are queued on ticket close and flushed here;
-- a few hours' delay before the survey email is fine at this volume.
SELECT cron.schedule(
  'csat-dispatcher',
  '0 15,22 * * *',
  $$SELECT public.call_cron_endpoint('/api/cron/csat-dispatcher')$$
);

-- Inbound-email reconciler: every 3 hours. This is only the safety net for the
-- ~15% of inbound emails the Resend webhook misses; the webhook still creates
-- tickets in real time, so a 3h reconcile window is plenty.
SELECT cron.schedule(
  'inbound-email-reconcile',
  '0 */3 * * *',
  $$SELECT public.call_cron_endpoint('/api/cron/reconcile-inbound-emails')$$
);

-- testing-strike-check (hourly, from 00035) is left unchanged.

-- ========================================
-- SECTION 3: ROLLBACK (commented) — restores the old high-volume cadence
-- ========================================
/*
SELECT cron.unschedule('csat-dispatcher');
SELECT cron.unschedule('inbound-email-reconcile');
SELECT cron.schedule('csat-dispatcher', '*/5 * * * *',
  $$SELECT public.call_cron_endpoint('/api/cron/csat-dispatcher')$$);
SELECT cron.schedule('inbound-email-reconcile', '*/10 * * * *',
  $$SELECT public.call_cron_endpoint('/api/cron/reconcile-inbound-emails')$$);
*/
