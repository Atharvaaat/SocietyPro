-- ============================================================
--  SocietyPro — pg_cron Scheduled Jobs
--  Migration 004
--
--  Prerequisites:
--    1. Enable pg_cron in Supabase Dashboard:
--       Database → Extensions → pg_cron → Enable
--    2. Enable pg_net for HTTP calls:
--       Database → Extensions → pg_net → Enable
--
--  INTERNAL_TOKEN must match what is set in your
--  Render backend environment variables.
-- ============================================================

-- ── 1. Apply late payment penalties — runs midnight daily ──
SELECT cron.schedule(
  'societypro-apply-penalties',
  '0 0 * * *',
  $$
    SELECT apply_late_penalties();
  $$
);

-- ── 2. Send overdue reminders via backend — runs 9 AM daily ─
--    Backend endpoint: POST /api/jobs/send-overdue-reminders
--    Secured by X-Internal-Token header
SELECT cron.schedule(
  'societypro-overdue-reminders',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_BACKEND.onrender.com/api/jobs/send-overdue-reminders',
      headers := '{"Content-Type":"application/json","x-internal-token":"YOUR_INTERNAL_TOKEN"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── 3. AMC expiry alerts — runs 8 AM every Monday ─────────
SELECT cron.schedule(
  'societypro-amc-alerts',
  '0 8 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_BACKEND.onrender.com/api/jobs/send-amc-alerts',
      headers := '{"Content-Type":"application/json","x-internal-token":"YOUR_INTERNAL_TOKEN"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── 4. Auto-update asset expiry status — runs daily at 1 AM ─
SELECT cron.schedule(
  'societypro-asset-status',
  '0 1 * * *',
  $$
    UPDATE assets SET status = 'Expiring Soon'
    WHERE amc_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      AND status = 'OK';

    UPDATE assets SET status = 'Expired'
    WHERE amc_expiry < CURRENT_DATE
      AND status IN ('OK','Expiring Soon');
  $$
);

-- ── To view scheduled jobs ────────────────────────────────
-- SELECT * FROM cron.job;
-- ── To unschedule ─────────────────────────────────────────
-- SELECT cron.unschedule('societypro-apply-penalties');
