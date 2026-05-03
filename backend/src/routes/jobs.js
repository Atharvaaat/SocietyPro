/**
 * Jobs Routes — /api/jobs/*
 * Called by Supabase pg_cron via pg_net HTTP requests.
 * Secured by INTERNAL_TOKEN only (no user JWT for cron).
 */
const router       = require('express').Router();
const internalAuth = require('../middleware/internalAuth');
const supabase     = require('../config/supabase-admin');
const { sendEmail, overdueReminderHtml } = require('../services/emailService');
const { sendSms }  = require('../services/smsService');

/**
 * POST /api/jobs/run-penalties
 * Calls the Postgres function apply_late_penalties()
 * Scheduled: daily at midnight via pg_cron
 */
router.post('/run-penalties', internalAuth, async (req, res) => {
  try {
    const { error } = await supabase.rpc('apply_late_penalties');
    if (error) throw error;
    console.log('[JOB] Penalties applied:', new Date().toISOString());
    res.json({ ok: true, job: 'apply_late_penalties' });
  } catch (err) {
    console.error('[JOB] Penalty error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/send-overdue-reminders
 * Fetches overdue invoices → sends email + SMS to each resident
 * Scheduled: daily at 9 AM via pg_cron
 */
router.post('/send-overdue-reminders', internalAuth, async (req, res) => {
  try {
    const { data: overdueInvoices, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, amount, total_amount, due_date,
        units ( unit_number ),
        members ( name, email, phone )
      `)
      .eq('status', 'Overdue');

    if (error) throw error;

    let emailsSent = 0;
    let smsSent    = 0;

    for (const inv of overdueInvoices || []) {
      const name   = inv.members?.name        || 'Resident';
      const email  = inv.members?.email;
      const phone  = inv.members?.phone;
      const unit   = inv.units?.unit_number   || '—';
      const amount = parseFloat(inv.total_amount || 0);

      if (email) {
        try {
          await sendEmail({
            to:      email,
            subject: `⚠️ Overdue Invoice ${inv.invoice_number} — SocietyPro`,
            html:    overdueReminderHtml({
              invoiceNumber: inv.invoice_number,
              unitNumber:    unit,
              residentName:  name,
              amount,
              dueDate:       inv.due_date,
            })
          });
          emailsSent++;
        } catch (e) { console.error('[JOB] Email failed:', e.message); }
      }

      if (phone) {
        try {
          await sendSms({
            phone,
            message: `Overdue: Invoice ${inv.invoice_number} ₹${amount.toLocaleString('en-IN')} was due ${new Date(inv.due_date).toLocaleDateString('en-IN')}. Pay now at SocietyPro.`
          });
          smsSent++;
        } catch (e) { console.error('[JOB] SMS failed:', e.message); }
      }
    }

    console.log(`[JOB] Overdue reminders: ${emailsSent} emails, ${smsSent} SMS`);
    res.json({ ok: true, total: overdueInvoices?.length || 0, emailsSent, smsSent });
  } catch (err) {
    console.error('[JOB] Overdue reminder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/send-amc-alerts
 * Finds assets expiring in 60 days → emails committee
 * Scheduled: every Monday 8 AM via pg_cron
 */
router.post('/send-amc-alerts', internalAuth, async (req, res) => {
  try {
    const { data: assets } = await supabase
      .from('assets')
      .select('*')
      .lte('amc_expiry', new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0])
      .order('amc_expiry');

    if (!assets?.length) return res.json({ ok: true, sent: 0 });

    // Get secretary emails
    const { data: secretaries } = await supabase
      .from('users')
      .select('email,name')
      .in('role', ['secretary','manager'])
      .eq('is_active', true)
      .not('email', 'is', null);

    const rows = assets.map(a =>
      `<tr><td style="padding:.4rem .75rem">${a.name}</td><td style="padding:.4rem .75rem">${a.location||'—'}</td><td style="padding:.4rem .75rem">${a.amc_vendor||'—'}</td><td style="padding:.4rem .75rem;color:#b91c1c">${a.amc_expiry}</td></tr>`
    ).join('');

    for (const s of secretaries || []) {
      await sendEmail({
        to:      s.email,
        subject: `⚠️ ${assets.length} Asset(s) AMC Expiring Soon — SocietyPro`,
        html:    `<div style="font-family:sans-serif;padding:24px;max-width:600px;margin:auto;">
          <h2>⚠️ AMC Expiry Alert</h2>
          <p>The following society assets have AMC expiring within 60 days:</p>
          <table style="width:100%;border-collapse:collapse;">
            <thead style="background:#f5f3ef;"><tr><th style="padding:.4rem .75rem;text-align:left">Asset</th><th style="padding:.4rem .75rem;text-align:left">Location</th><th style="padding:.4rem .75rem;text-align:left">Vendor</th><th style="padding:.4rem .75rem;text-align:left">Expiry</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:1.5rem;">Please arrange renewal before expiry.</p>
        </div>`
      });
    }

    console.log(`[JOB] AMC alerts: ${assets.length} assets, notified ${secretaries?.length} secretaries`);
    res.json({ ok: true, assets: assets.length, notified: secretaries?.length || 0 });
  } catch (err) {
    console.error('[JOB] AMC alert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
