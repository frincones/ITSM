-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00056: QUOTA THRESHOLD NOTICES
-- ═══════════════════════════════════════════════════════════════
-- Contract cl. 6: "TDX avisará al alcanzar el 80% del cupo mensual." For the
-- Professional plan that is 24 of 30 tickets. An explicit obligation the client
-- can check against their own count at any moment, and one with no
-- instrumentation until now.
--
-- A second notice at 100% is not required by the contract, but it is the point
-- where overage billing starts (cl. 6) — and finding that out on the invoice is
-- how billing disputes begin.
--
-- Depends on: 00055 (support_cycle_usage).

-- ---------------------------------------------------------------
-- 1. COLUMN — per-cycle notice markers
-- ---------------------------------------------------------------
-- Bookkeeping, not contract terms, so it rides on the contract row rather than
-- earning a table. Shape: {"80": "2026-09-22:80", "100": "..."} where the value
-- carries the cycle start, so a new cycle starts clean without a reset job.
ALTER TABLE organization_support_contracts
  ADD COLUMN IF NOT EXISTS quota_notices jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organization_support_contracts.quota_notices IS
  'Which quota thresholds have already been announced for which cycle. Cleared per threshold when usage falls back below it, so a reclassification that restores quota (cl. 2) does not swallow a later crossing.';

-- ---------------------------------------------------------------
-- 1b. COLUMN — direct notice to the client
-- ---------------------------------------------------------------
-- The obligation in cl. 6 is to notify the CLIENT, but this defaults to FALSE:
-- the cron tells TDX and asks a human to pass it on. Auto-emailing a client a
-- number that drives billing, with copy nobody reviewed, is not something to
-- switch on silently.
--
-- Set it to TRUE once the wording is agreed, and the obligation is then met
-- with no human in the loop.
ALTER TABLE organization_support_contracts
  ADD COLUMN IF NOT EXISTS notify_client boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_support_contracts.notify_client IS
  'Whether quota threshold notices go directly to the client portal users. FALSE means TDX is told and forwards manually — the contractual obligation (cl. 6) is still on a human until this is enabled.';

-- ---------------------------------------------------------------
-- 2. pg_cron — twice per weekday
-- ---------------------------------------------------------------
-- 14:00 and 20:00 UTC = 09:00 and 15:00 America/Bogota, Mon-Fri.
--
-- Twice a day is the right resolution for this: the notice exists so the client
-- can decide whether to slow down or accept overage, and that decision is not
-- made in minutes. At 30 tickets a month, crossing 80% is a once-a-cycle event.
-- Deliberately frugal — the pg_cron HTTP jobs are what drained the Disk IO
-- budget before 00046 cut their cadence.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('quota-threshold-check')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quota-threshold-check');

    PERFORM cron.schedule(
      'quota-threshold-check',
      '0 14,20 * * 1-5',
      $job$SELECT public.call_cron_endpoint('/api/cron/quota-threshold-check')$job$
    );
    RAISE NOTICE '[00056] quota-threshold-check scheduled: 0 14,20 * * 1-5 (09:00 and 15:00 Bogota).';
  ELSE
    RAISE NOTICE '[00056] pg_cron not installed — schedule quota-threshold-check manually.';
  END IF;
END $cron$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   SELECT cron.unschedule('quota-threshold-check');
--   ALTER TABLE organization_support_contracts
--     DROP COLUMN IF EXISTS notify_client,
--     DROP COLUMN IF EXISTS quota_notices;
-- ═══════════════════════════════════════════════════════════════
