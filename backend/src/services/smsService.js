/**
 * SMS Service — MSG91 (India)
 * Auth key is ONLY here, never in frontend code.
 *
 * Prerequisites:
 *  1. Register on msg91.com and complete KYC
 *  2. Register sender ID (e.g. SCTYPR) on TRAI DLT portal
 *  3. Register message templates on DLT (required by TRAI for transactional SMS)
 *  4. Add APPROVED template IDs to .env as MSG91_TEMPLATE_ID_xxx
 */
const axios = require('axios');

const AUTH_KEY   = process.env.MSG91_AUTH_KEY;
const SENDER_ID  = process.env.MSG91_SENDER_ID  || 'SCTYPR';
const TMPL_ID    = process.env.MSG91_TEMPLATE_ID; // default template

/**
 * Send a single SMS via MSG91 Flow API
 * @param {string} phone - 10-digit Indian mobile (or 91XXXXXXXXXX)
 * @param {string} message - SMS text (must match DLT template)
 * @param {string} [templateId] - override default template
 */
async function sendSms({ phone, message, templateId }) {
  if (!AUTH_KEY) {
    console.warn('[SMS] MSG91_AUTH_KEY not set — skipping SMS');
    return;
  }

  // Normalise to 91XXXXXXXXXX format
  const mobile = phone.startsWith('91') ? phone : `91${phone.replace(/\D/g,'')}`;

  const payload = {
    template_id: templateId || TMPL_ID,
    sender:      SENDER_ID,
    recipients: [{ mobiles: mobile, message }]
  };

  try {
    const res = await axios.post('https://api.msg91.com/api/v5/flow/', payload, {
      headers: {
        'authkey':      AUTH_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    });
    console.log(`[SMS] Sent to ${mobile}:`, res.data?.message);
    return res.data;
  } catch (err) {
    // Log but don't throw — SMS failure shouldn't crash the app
    console.error('[SMS] Failed:', err.response?.data || err.message);
  }
}

/**
 * Bulk SMS — send same message to multiple phones
 */
async function sendBulkSms({ phones, message, templateId }) {
  const results = await Promise.allSettled(
    phones.map(phone => sendSms({ phone, message, templateId }))
  );
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed) console.warn(`[SMS] ${failed}/${phones.length} failed`);
  return results;
}

module.exports = { sendSms, sendBulkSms };
