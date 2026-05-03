/**
 * SocietyPro — Supabase Client + Backend Bridge
 * frontend/lib/supabase.js
 *
 * ANON KEY is safe to expose — all data access is enforced
 * server-side via Row-Level Security (RLS). This key cannot bypass RLS.
 *
 * API_BASE points to your home server running the backend.
 * If the home server is offline, email/SMS notifications are
 * silently skipped — all other app features continue working normally.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── Replace these with your actual values ────────────────────────────────────
// GitHub Actions injects these from Secrets at deploy time.
// For local testing, update them directly here.
export const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
export const SUPABASE_ANON = 'YOUR_ANON_KEY';

/**
 * Your home server URL — where the backend (SendGrid + MSG91) runs.
 * Must be HTTPS if served from GitHub Pages (mixed-content restriction).
 * Options:
 *   - ngrok / Cloudflare Tunnel: https://xxxx.ngrok.io
 *   - Dynamic DNS + Let's Encrypt: https://home.yourdomain.com
 *   - Local testing only: http://localhost:3001 (won't work on GitHub Pages)
 */
export const API_BASE = 'https://YOUR_HOME_SERVER_URL';

// ── Supabase Client ───────────────────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  }
});

// ── Backend Health Check with caching ────────────────────────────────────────
// We cache the result for 30 seconds to avoid hammering the home server
// with a health check on every notification attempt.
let _healthCache = { ok: null, checkedAt: 0 };
const HEALTH_TTL_MS = 30_000; // 30 seconds
const TIMEOUT_MS    =  4_000; // 4 second timeout for health + API calls

/**
 * Check if the home server backend is reachable.
 * Returns true/false. Result cached for 30 seconds.
 * NEVER throws — failures return false.
 */
export async function isBackendOnline() {
  const now = Date.now();
  if (now - _healthCache.checkedAt < HEALTH_TTL_MS && _healthCache.ok !== null) {
    return _healthCache.ok;
  }

  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ok = res.ok;
    _healthCache = { ok, checkedAt: now };
    if (ok) {
      _setNotifBanner(false);            // hide offline banner
      console.info('[Backend] Home server online ✓');
    } else {
      _setNotifBanner(true);
    }
    return ok;
  } catch {
    _healthCache = { ok: false, checkedAt: now };
    _setNotifBanner(true);
    console.warn('[Backend] Home server offline — notifications paused');
    return false;
  }
}

/**
 * Force-reset the health cache (call after user manually reconnects).
 */
export function resetBackendHealthCache() {
  _healthCache = { ok: null, checkedAt: 0 };
}

/**
 * Call a backend API endpoint (email/SMS/cron).
 *
 * IMPORTANT BEHAVIOUR:
 *   - Checks backend health first (cached 30s)
 *   - If backend is offline → returns { ok: false, skipped: true, reason: 'backend_offline' }
 *   - If request fails      → returns { ok: false, skipped: true, reason: 'request_failed' }
 *   - NEVER throws — callers don't need try/catch (but it's fine if they have it)
 *   - The calling code (billing, helpdesk, etc.) completes its DB operation regardless
 *
 * @param {string} path  - e.g. '/api/notify/email'
 * @param {object} body  - JSON body
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason?: string}>}
 */
export async function callBackend(path, body = {}) {
  const online = await isBackendOnline();

  if (!online) {
    return { ok: false, skipped: true, reason: 'backend_offline' };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${API_BASE}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`[Backend] ${path} → HTTP ${res.status}`, detail);
      return { ok: false, skipped: true, reason: `http_${res.status}` };
    }

    return await res.json();
  } catch (err) {
    console.warn(`[Backend] ${path} failed:`, err.message);
    _healthCache = { ok: false, checkedAt: Date.now() }; // mark offline
    _setNotifBanner(true);
    return { ok: false, skipped: true, reason: 'request_failed' };
  }
}

/**
 * Convenience: send notification without blocking the caller.
 * Use this when you want fire-and-forget (don't need to await result).
 * The notification is silently dropped if the backend is offline.
 */
export function notify(path, body = {}) {
  callBackend(path, body).then(result => {
    if (result.skipped) {
      console.info(`[Notify] Skipped (${result.reason}): ${path}`);
    }
  });
}

// ── Supabase Storage helpers ──────────────────────────────────────────────────

/**
 * Get a signed URL for a private Storage file (valid 1 hour by default).
 */
export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Upload a File/Blob to Supabase Storage.
 * Returns the storage path on success.
 */
export async function uploadFile(bucket, path, file) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });
  if (error) throw error;
  return data.path;
}

// ── Notification Status Banner (subtle UI indicator) ─────────────────────────
// Shows a small top banner when the home server is offline.
// Disappears automatically when server comes back online.

function _setNotifBanner(offline) {
  let banner = document.getElementById('notif-offline-banner');

  if (offline) {
    if (banner) return; // already showing
    banner = document.createElement('div');
    banner.id = 'notif-offline-banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'background:#92400e', 'color:#fef3c7', 'font-size:.8rem',
      'padding:.35rem 1rem', 'text-align:center', 'display:flex',
      'align-items:center', 'justify-content:center', 'gap:.5rem',
    ].join(';');
    banner.innerHTML = [
      '<i class="fa-solid fa-triangle-exclamation"></i>',
      'Notification server offline — email &amp; SMS paused.',
      'All other features work normally.',
      `<button onclick="window._retryBackend()" style="margin-left:.75rem;background:rgba(255,255,255,.15);`,
      `border:none;color:inherit;padding:.15rem .6rem;border-radius:4px;cursor:pointer;font-size:.8rem;">`,
      'Retry</button>',
    ].join('');
    document.body.prepend(banner);

    // Expose retry function
    window._retryBackend = () => {
      resetBackendHealthCache();
      isBackendOnline();
    };
  } else {
    banner?.remove();
  }
}
