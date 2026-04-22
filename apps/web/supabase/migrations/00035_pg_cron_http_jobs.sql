-- Migration: 00035_pg_cron_http_jobs.sql
-- Description: Move Vercel Hobby-incompatible crons to Supabase pg_cron + pg_net.
--              Vercel Hobby allows only 1 run/day per cron; testing-strike-check
--              runs hourly and csat-dispatcher every 5 min, so both were blocking
--              every deployment after commit 59ab4ed with cron_jobs_limits_reached.
--              pg_cron is unbounded on the Supabase Free tier.
-- Date: 2026-04-21
-- Author: arquitecto

-- ========================================
-- SECTION 1: EXTENSIONS
-- ========================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ========================================
-- SECTION 2: CRON SECRET STORAGE
-- ========================================
-- The CRON_SECRET matches Vercel's env var so both Vercel-triggered and
-- pg_cron-triggered runs authenticate against the same value. Stored in a
-- dedicated table (RLS forced, service_role only) rather than a GUC so it
-- survives pooler restarts.
CREATE TABLE IF NOT EXISTS cron_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cron_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_config FORCE ROW LEVEL SECURITY;
-- no policies → only service_role (bypass RLS) can read. Keep it sealed.

-- ========================================
-- SECTION 3: HELPER
-- ========================================
CREATE OR REPLACE FUNCTION call_cron_endpoint(endpoint text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_secret FROM cron_config WHERE key = 'cron_secret';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'cron_secret not configured in cron_config';
  END IF;

  SELECT net.http_get(
    url := 'https://itsm.tdxcore.com' || endpoint,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- ========================================
-- SECTION 4: UNSCHEDULE OLD JOBS (idempotent)
-- ========================================
DO $$
DECLARE j_name text;
BEGIN
  FOREACH j_name IN ARRAY ARRAY['testing-strike-check', 'csat-dispatcher']
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j_name) THEN
      PERFORM cron.unschedule(j_name);
    END IF;
  END LOOP;
END $$;

-- ========================================
-- SECTION 5: SCHEDULE JOBS
-- ========================================
-- Hourly strike check (24h/48h/72h thresholds on tickets parked in 'testing')
SELECT cron.schedule(
  'testing-strike-check',
  '0 * * * *',
  $$SELECT public.call_cron_endpoint('/api/cron/testing-strike-check')$$
);

-- Every 5 min CSAT/NPS dispatcher (flushes rows queued ≥5 min ago)
SELECT cron.schedule(
  'csat-dispatcher',
  '*/5 * * * *',
  $$SELECT public.call_cron_endpoint('/api/cron/csat-dispatcher')$$
);

-- ========================================
-- SECTION 6: ROLLBACK (commented)
-- ========================================
/*
SELECT cron.unschedule('testing-strike-check');
SELECT cron.unschedule('csat-dispatcher');
DROP FUNCTION IF EXISTS public.call_cron_endpoint(text);
DROP TABLE IF EXISTS public.cron_config;
*/
