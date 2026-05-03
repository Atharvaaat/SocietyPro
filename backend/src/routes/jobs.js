/**
 * Scheduled Jobs (Cron Webhooks)
 * backend/src/routes/jobs.js
 *
 * Triggered by pg_cron (or external cron) with x-internal-token.
 */
const router = require('express').Router();
const internalAuth = require('../middleware/internalAuth');
const supabase = require('../config/supabase-admin');
const { sendSms } = require('../services/smsService');
const { sendEmail } = require('../services/emailService');

// Apply internal auth to all job routes
router.use(internalAuth);

/**
 * Send pre-due date reminders (5 days before)
 * POST /api/jobs/send-predue-reminders
 */
router.post('/send-predue-reminders', async (req, res) => {
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 5);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, members(users(name, email, phone)), units(unit_number)')
      .eq('status', 'Pending')
      .eq('due_date', targetDateStr);

    if (error) throw error;
    if (!invoices?.length) return res.json({ message: 'No pre-due reminders needed' });

    for (const inv of invoices) {
      const user = inv.members?.users;
      if (!user) continue;

      const message = `Reminder: Invoice ${inv.invoice_number} for Unit ${inv.units.unit_number} (Rs ${inv.total_amount}) is due on ${targetDateStr}. Please pay to avoid penalties.`;

      // Notifications disabled as per request
      /*
      // Enqueue Email
      if (user.email) {
        await enqueueNotification('email', {
          to: user.email,
          subject: 'Upcoming Invoice Due - SocietyPro',
          text: message
        });
      }
      
      // Enqueue SMS
      if (user.phone) {
        await enqueueNotification('sms', {
          phone: user.phone,
          message: message
        });
      }
      */
    }

    res.json({ processed: invoices.length });
  } catch (err) {
    console.error('[JOB] pre-due reminders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Send overdue reminders (daily)
 * POST /api/jobs/send-overdue-reminders
 */
router.post('/send-overdue-reminders', async (req, res) => {
  try {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, members(users(name, email, phone)), units(unit_number)')
      .eq('status', 'Overdue');

    if (error) throw error;
    if (!invoices?.length) return res.json({ message: 'No overdue invoices' });

    for (const inv of invoices) {
      const user = inv.members?.users;
      if (!user) continue;

      const message = `URGENT: Invoice ${inv.invoice_number} for Unit ${inv.units.unit_number} is Overdue. Total amount including penalty: Rs ${inv.total_amount}. Please pay immediately.`;

      // Notifications disabled as per request
      /*
      // Enqueue Email
      if (user.email) {
        await enqueueNotification('email', {
          to: user.email,
          subject: 'OVERDUE: Invoice Payment Required - SocietyPro',
          text: message
        });
      }
      
      // Enqueue SMS
      if (user.phone) {
        await enqueueNotification('sms', {
          phone: user.phone,
          message: message
        });
      }
      */
    }

    res.json({ processed: invoices.length });
  } catch (err) {
    console.error('[JOB] overdue reminders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Process the notification queue
 * POST /api/jobs/process-notification-queue
 */
router.post('/process-notification-queue', async (req, res) => {
  try {
    // Get up to 50 pending notifications ready to retry
    const { data: queue, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry', new Date().toISOString())
      .limit(50);

    if (error) throw error;
    if (!queue?.length) return res.json({ message: 'Queue empty' });

    let sent = 0;
    let failed = 0;

    for (const job of queue) {
      try {
        /* Notifications disabled for now
        if (job.type === 'email') {
          await sendEmail(job.payload);
        } else if (job.type === 'sms') {
          await sendSms(job.payload);
        }
        */

        // Success
        await supabase.from('notification_queue').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          attempts: job.attempts + 1
        }).eq('id', job.id);
        sent++;
      } catch (sendErr) {
        // Failure handling (exponential backoff)
        const attempts = job.attempts + 1;
        const isMax = attempts >= job.max_attempts;
        const nextRetry = new Date(Date.now() + Math.pow(2, attempts) * 60000); // 2^n minutes

        await supabase.from('notification_queue').update({
          status: isMax ? 'failed' : 'pending',
          error: sendErr.message,
          attempts: attempts,
          next_retry: nextRetry.toISOString()
        }).eq('id', job.id);
        failed++;
      }
    }

    res.json({ processed: queue.length, sent, failed });
  } catch (err) {
    console.error('[JOB] process queue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper function to enqueue
async function enqueueNotification(type, payload) {
  await supabase.from('notification_queue').insert({ type, payload });
}

module.exports = router;
