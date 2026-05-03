-- ============================================================
--  SocietyPro — pg_cron Scheduled Jobs
--  Migration 004
--
--  Prerequisites:
--    1. Enable pg_cron in Supabase Dashboard → Database → Extensions
--    2. Enable pg_net in Supabase Dashboard → Database → Extensions
--
--  Replace YOUR_BACKEND_URL and YOUR_INTERNAL_TOKEN with actual values.
-- ============================================================

-- ── 1. Apply progressive late penalties — daily at midnight ──
SELECT cron.schedule(
  'societypro-apply-penalties',
  '0 0 * * *',
  $$ SELECT apply_late_penalties(); $$
);

-- ── 2. Auto-generate recurring invoices — 1st of every month at 6 AM ──
SELECT cron.schedule(
  'societypro-generate-recurring',
  '0 6 1 * *',
  $$ SELECT generate_recurring_invoices(); $$
);

-- ── 3. Send pre-due-date reminders (5 days before) — daily at 9 AM ──
SELECT cron.schedule(
  'societypro-predue-reminders',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_BACKEND_URL/api/jobs/send-predue-reminders',
      headers := '{"Content-Type":"application/json","x-internal-token":"YOUR_INTERNAL_TOKEN"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── 4. Send overdue reminders — daily at 9:30 AM ──
SELECT cron.schedule(
  'societypro-overdue-reminders',
  '30 9 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_BACKEND_URL/api/jobs/send-overdue-reminders',
      headers := '{"Content-Type":"application/json","x-internal-token":"YOUR_INTERNAL_TOKEN"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── 5. Process notification queue — every 5 minutes ──
SELECT cron.schedule(
  'societypro-process-notif-queue',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_BACKEND_URL/api/jobs/process-notification-queue',
      headers := '{"Content-Type":"application/json","x-internal-token":"YOUR_INTERNAL_TOKEN"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── 6. AMC expiry alerts — every Monday at 8 AM ──
SELECT cron.schedule(
  'societypro-amc-alerts',
  '0 8 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_BACKEND_URL/api/jobs/send-amc-alerts',
      headers := '{"Content-Type":"application/json","x-internal-token":"YOUR_INTERNAL_TOKEN"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── 7. Auto-update asset expiry status — daily at 1 AM ──
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
