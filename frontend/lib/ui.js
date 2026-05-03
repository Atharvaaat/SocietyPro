/**
 * SocietyPro — Shared UI Utilities
 * frontend/lib/ui.js
 */

/* ── TOAST NOTIFICATIONS ── */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
  toast.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, duration);
}

/* ── GLOBAL MODAL ── */
let _modalActionHandlers = [];

export function openModal(title, bodyHtml, actions = []) {
  const overlay = document.getElementById('global-modal-overlay');
  const modal   = document.getElementById('global-modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl  = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');

  titleEl.textContent = title;
  bodyEl.innerHTML    = bodyHtml;

  // Build footer buttons
  footerEl.innerHTML = '';
  _modalActionHandlers = [];
  actions.forEach((action, i) => {
    const btn = document.createElement('button');
    btn.className = action.class || 'btn btn-outline';
    btn.textContent = action.label;
    btn.id = `modal-action-${i}`;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const result = await action.action?.();
      if (result !== false) btn.disabled = false; // re-enable only if action didn't close modal
    });
    footerEl.appendChild(btn);
    _modalActionHandlers.push(btn);
  });

  // Add close button action
  if (!actions.length) footerEl.innerHTML = '<button class="btn btn-outline" onclick="document.getElementById(\'modal-close-btn\').click()">Close</button>';

  overlay.classList.add('active');
  modal.classList.add('active');
}

export function closeModal() {
  const overlay = document.getElementById('global-modal-overlay');
  const modal   = document.getElementById('global-modal');
  overlay.classList.remove('active');
  modal.classList.remove('active');
}

/** Bind the global close button once at startup */
export function initModal() {
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('global-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

/* ── FORMAT HELPERS ── */
export function formatCurrency(amount) {
  return `₹${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
}

/* ── DEBOUNCE ── */
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
