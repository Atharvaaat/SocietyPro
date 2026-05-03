/**
 * Notify Routes — /api/notify/email and /api/notify/sms
 * Protected by internalAuth (Supabase JWT or INTERNAL_TOKEN)
 */
const router       = require('express').Router();
const internalAuth = require('../middleware/internalAuth');
const { sendEmail } = require('../services/emailService');
const { sendSms }   = require('../services/smsService');

/**
 * POST /api/notify/email
 * Body: { to, subject, html, text? }
 */
router.post('/email', internalAuth, async (req, res) => {
  const { to, subject, html, text } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ error: 'to and subject are required' });
  }

  // Rate-limit guard: only allow sending to a valid email format
  if (typeof to !== 'string' || (!to.includes('@') && !Array.isArray(to))) {
    return res.status(400).json({ error: 'Invalid "to" address' });
  }

  try {
    await sendEmail({ to, subject, html, text });
    console.log(`[EMAIL] Sent "${subject}" to ${Array.isArray(to) ? to.length + ' recipients' : to}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[EMAIL] Error:', err.response?.body || err.message);
    res.status(500).json({ error: 'Email delivery failed', detail: err.message });
  }
});

/**
 * POST /api/notify/sms
 * Body: { phone, message, templateId? }
 */
router.post('/sms', internalAuth, async (req, res) => {
  const { phone, message, templateId } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'Message too long (max 500 chars)' });
  }

  try {
    await sendSms({ phone, message, templateId });
    console.log(`[SMS] Sent to ${phone}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[SMS] Error:', err.message);
    res.status(500).json({ error: 'SMS delivery failed', detail: err.message });
  }
});

module.exports = router;
