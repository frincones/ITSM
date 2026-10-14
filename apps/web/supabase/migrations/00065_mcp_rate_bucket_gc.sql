-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00065: MCP RATE BUCKET GARBAGE COLLECTION
-- NovaDesk ITSM — MCP Platform, Phase 1
-- ═══════════════════════════════════════════════════════════════
-- Problem this solves
-- -------------------
-- `increment_rate_bucket()` (00039) runs a DELETE over mcp_rate_buckets on
-- EVERY authenticated MCP call:
--
--     DELETE FROM mcp_rate_buckets
--      WHERE bucket_minute < (now() - interval '10 minutes');
--
-- That turns every read into a write transaction against a table that is
-- simultaneously taking concurrent UPSERTs, adding lock contention and WAL
-- for no functional benefit. On this deployment it matters more than usual:
-- per 00046, the instance is ~1 GB with a small Disk IO budget, and runaway
-- background writes already took the database offline (522) on 2026-06-14.
--
-- Solution
-- --------
-- Strip the DELETE out of the hot path and reclaim the rows from a single
-- scheduled job. Buckets are tiny (one row per key per minute) and only the
-- current minute is ever read, so sweeping a few times a day is ample.
--
-- Cadence rationale: following 00046's reasoning, this is deliberately a
-- low-frequency job (4x/day, ~4 runs added) rather than hourly, because the
-- table cannot grow meaningfully at this call volume and IO budget is the
-- binding constraint.
--
-- The function keeps its exact signature and return contract, so no
-- application code changes — route handlers call it unchanged.
--
-- Depends on: 00039_api_keys_and_mcp.sql, 00035_pg_cron_http_jobs.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. increment_rate_bucket — same contract, no inline DELETE
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_rate_bucket(
  p_api_key_id uuid,
  p_window_seconds integer DEFAULT 60
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket timestamptz;
  v_count  integer;
BEGIN
  -- p_window_seconds is accepted for signature compatibility; the bucket
  -- granularity is one minute, matching api_keys.rate_limit_rpm.
  v_bucket := date_trunc('minute', now());

  INSERT INTO mcp_rate_buckets (api_key_id, bucket_minute, call_count)
       VALUES (p_api_key_id, v_bucket, 1)
  ON CONFLICT (api_key_id, bucket_minute)
  DO UPDATE SET call_count = mcp_rate_buckets.call_count + 1
  RETURNING call_count INTO v_count;

  -- Reclamation is handled by the 'mcp-rate-bucket-gc' cron job below.
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION increment_rate_bucket(uuid, integer) FROM PUBLIC;

COMMENT ON FUNCTION increment_rate_bucket(uuid, integer) IS
  'Atomically increments the per-key, per-minute call counter and returns the new count. Caller compares against api_keys.rate_limit_rpm. Stale buckets are reclaimed by the mcp-rate-bucket-gc cron job, not inline.';

-- ---------------------------------------------------------------
-- 2. GC function
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION gc_mcp_rate_buckets(
  p_older_than interval DEFAULT interval '1 hour'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM mcp_rate_buckets
   WHERE bucket_minute < (now() - p_older_than);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION gc_mcp_rate_buckets(interval) FROM PUBLIC;

COMMENT ON FUNCTION gc_mcp_rate_buckets(interval) IS
  'Deletes rate-limit buckets older than the given interval. Returns the row count. Scheduled as mcp-rate-bucket-gc; safe to run manually.';

-- ---------------------------------------------------------------
-- 3. SCHEDULE (idempotent)
-- ---------------------------------------------------------------
-- Every 6 hours on the hour (UTC): 00:00, 06:00, 12:00, 18:00.
-- Adds ~4 cron runs/day against the ~34/day baseline set by 00046.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mcp-rate-bucket-gc') THEN
      PERFORM cron.unschedule('mcp-rate-bucket-gc');
    END IF;

    PERFORM cron.schedule(
      'mcp-rate-bucket-gc',
      '0 */6 * * *',
      $cron$ SELECT gc_mcp_rate_buckets(interval '1 hour'); $cron$
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 4. One-off sweep of whatever accumulated before this migration
-- ---------------------------------------------------------------

SELECT gc_mcp_rate_buckets(interval '1 hour');

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   SELECT cron.unschedule('mcp-rate-bucket-gc');
--   DROP FUNCTION IF EXISTS gc_mcp_rate_buckets(interval);
--   -- then restore the 00039 body of increment_rate_bucket
--   -- (the variant containing the inline DELETE)
-- ═══════════════════════════════════════════════════════════════
