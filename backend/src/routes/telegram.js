/**
 * Telegram / Notification Routes
 * POST /api/notify/telegram — send a single message
 * POST /api/notify/flush     — process all pending notifications in queue
 * GET  /api/notify/queue     — get notification queue (for admin console)
 * POST /api/notify/resend/:id — resend a specific notification
 * POST /api/notify/cancel/:id — cancel a pending notification
 */
const router = require('express').Router();
const internalAuth = require('../middleware/internalAuth');
const supabase = require('../config/supabase-admin');
const { sendTelegramMessage } = require('../services/telegramService');

// Send a single telegram message directly
router.post('/telegram', internalAuth, async (req, res) => {
  const { chat_id, message } = req.body;
  if (!chat_id || !message) return res.status(400).json({ error: 'chat_id and message required' });
  const result = await sendTelegramMessage(chat_id, message);
  res.json(result);
});

// Flush: process all pending notifications
router.post('/flush', internalAuth, async (req, res) => {
  try {
    const { data: queue, error } = await supabase
      .from('notifications')
      .select('*, users:user_id(telegram_chat_id, name, email)')
      .eq('status', 'pending')
      .order('created_at')
      .limit(100);

    if (error) throw error;
    if (!queue?.length) return res.json({ message: 'Queue empty', sent: 0, failed: 0 });

    let sent = 0, failed = 0;
    for (const notif of queue) {
      const chatId = notif.users?.telegram_chat_id;
      if (!chatId) {
        await supabase.from('notifications').update({
          status: 'failed', error: 'No telegram_chat_id for user',
          attempts: notif.attempts + 1
        }).eq('id', notif.id);
        failed++;
        continue;
      }

      const text = `🔔 *${notif.title}*\n\n${notif.message}`;
      const result = await sendTelegramMessage(chatId, text);

      if (result.ok) {
        await supabase.from('notifications').update({
          status: 'sent', sent_at: new Date().toISOString(),
          attempts: notif.attempts + 1
        }).eq('id', notif.id);
        sent++;
      } else {
        const attempts = notif.attempts + 1;
        await supabase.from('notifications').update({
          status: attempts >= notif.max_attempts ? 'failed' : 'pending',
          error: result.error, attempts
        }).eq('id', notif.id);
        failed++;
      }
    }
    res.json({ processed: queue.length, sent, failed });
  } catch (err) {
    console.error('[FLUSH] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get queue for admin console
router.get('/queue', internalAuth, async (req, res) => {
  try {
    const status = req.query.status || null;
    let q = supabase.from('notifications')
      .select('*, users:user_id(name, telegram_chat_id)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resend a specific notification
router.post('/resend/:id', internalAuth, async (req, res) => {
  try {
    await supabase.from('notifications').update({
      status: 'pending', attempts: 0, error: null
    }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a notification
router.post('/cancel/:id', internalAuth, async (req, res) => {
  try {
    await supabase.from('notifications').update({
      status: 'cancelled'
    }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
