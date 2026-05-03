/**
 * Email Service — Twilio SendGrid
 * API key is ONLY here, never in frontend code
 */
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.SENDGRID_FROM      || 'noreply@societypro.in',
  name:  process.env.SENDGRID_FROM_NAME || 'SocietyPro'
};

async function sendEmail({ to, subject, html, text }) {
  await sgMail.send({
    from:     FROM,
    to,
    subject,
    html:     html   || `<p>${text || subject}</p>`,
    text:     text   || subject,
  });
}

/* ── Email Templates ── */

function invoiceHtml({ invoiceNumber, unitNumber, residentName, amount, dueDate, invoiceType }) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;background:#fff;">
      <div style="background:#1a1714;padding:24px 32px;">
        <h2 style="color:#fff;margin:0;">🏢 SocietyPro</h2>
      </div>
      <div style="padding:28px 32px;border:1px solid #e2ddd6;border-top:none;">
        <h3 style="color:#1a1714;">Invoice ${invoiceNumber}</h3>
        <p>Dear <strong>${residentName || 'Resident'}</strong>,</p>
        <p>A new invoice has been generated for your unit <strong>${unitNumber}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
          <tr style="background:#f5f3ef;"><td style="padding:.5rem 1rem;">Type</td><td style="padding:.5rem 1rem;">${invoiceType}</td></tr>
          <tr><td style="padding:.5rem 1rem;">Amount</td><td style="padding:.5rem 1rem;"><strong>₹${amount?.toLocaleString('en-IN')}</strong></td></tr>
          <tr style="background:#f5f3ef;"><td style="padding:.5rem 1rem;">Due Date</td><td style="padding:.5rem 1rem;color:#e05c22;">${new Date(dueDate).toLocaleDateString('en-IN')}</td></tr>
        </table>
        <p>Please log in to the portal to pay or mark as paid.</p>
      </div>
      <div style="background:#f5f3ef;padding:14px 32px;font-size:12px;color:#888;text-align:center;">SocietyPro — Automated Billing System</div>
    </div>`;
}

function paymentReceiptHtml({ invoiceNumber, residentName, amount, paidOn, paymentMode }) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;background:#fff;">
      <div style="background:#065f46;padding:24px 32px;">
        <h2 style="color:#fff;margin:0;">✅ Payment Confirmed</h2>
      </div>
      <div style="padding:28px 32px;border:1px solid #d1fae5;border-top:none;">
        <p>Dear <strong>${residentName || 'Resident'}</strong>,</p>
        <p>Your payment has been verified and the invoice is now marked <strong>Paid</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
          <tr style="background:#f0fdf4;"><td style="padding:.5rem 1rem;">Invoice #</td><td>${invoiceNumber}</td></tr>
          <tr><td style="padding:.5rem 1rem;">Amount</td><td><strong>₹${amount?.toLocaleString('en-IN')}</strong></td></tr>
          <tr style="background:#f0fdf4;"><td style="padding:.5rem 1rem;">Payment Mode</td><td>${paymentMode}</td></tr>
          <tr><td style="padding:.5rem 1rem;">Paid On</td><td>${new Date(paidOn).toLocaleDateString('en-IN')}</td></tr>
        </table>
        <p>Thank you for your timely payment.</p>
      </div>
      <div style="background:#f5f3ef;padding:14px 32px;font-size:12px;color:#888;text-align:center;">SocietyPro — Automated Billing System</div>
    </div>`;
}

function overdueReminderHtml({ invoiceNumber, unitNumber, residentName, amount, dueDate }) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;background:#fff;">
      <div style="background:#b91c1c;padding:24px 32px;">
        <h2 style="color:#fff;margin:0;">⚠️ Overdue Invoice Reminder</h2>
      </div>
      <div style="padding:28px 32px;border:1px solid #fee2e2;border-top:none;">
        <p>Dear <strong>${residentName || 'Resident'}</strong>,</p>
        <p>Your invoice <strong>${invoiceNumber}</strong> for unit <strong>${unitNumber}</strong> is overdue.</p>
        <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
          <tr style="background:#fef2f2;"><td style="padding:.5rem 1rem;">Amount</td><td><strong style="color:#b91c1c;">₹${amount?.toLocaleString('en-IN')}</strong></td></tr>
          <tr><td style="padding:.5rem 1rem;">Due Date</td><td style="color:#b91c1c;">${new Date(dueDate).toLocaleDateString('en-IN')}</td></tr>
        </table>
        <p>Please pay immediately to avoid further penalties. Log in to SocietyPro to pay.</p>
      </div>
    </div>`;
}

module.exports = { sendEmail, invoiceHtml, paymentReceiptHtml, overdueReminderHtml };
