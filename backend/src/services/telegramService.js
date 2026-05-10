/**
 * Telegram Service — sends messages via Telegram Bot API
 */
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) {
    console.warn('[TELEGRAM] BOT_TOKEN not set — skipping');
    return { ok: false, error: 'BOT_TOKEN not configured' };
  }
  if (!chatId) {
    return { ok: false, error: 'No chat_id provided' };
  }
  try {
    const res = await axios.post(`${API_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    }, { timeout: 10000 });
    console.log(`[TELEGRAM] Sent to ${chatId}`);
    return { ok: true, data: res.data };
  } catch (err) {
    console.error('[TELEGRAM] Failed:', err.response?.data?.description || err.message);
    return { ok: false, error: err.response?.data?.description || err.message };
  }
}

module.exports = { sendTelegramMessage };
