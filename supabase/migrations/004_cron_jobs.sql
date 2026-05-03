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

-- ── 3. Auto-update asset expiry status — daily at 1 AM ──
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
