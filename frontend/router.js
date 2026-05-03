/**
 * SocietyPro — Client-side Router
 * frontend/router.js
 *
 * Hash-based SPA router. Works perfectly with GitHub Pages.
 * GitHub Pages cannot handle server-side rewriting, so we use #/route.
 */
import { currentRole, hasRole } from './modules/auth/auth.js';

const routes = {
  '/dashboard':     () => import('./modules/dashboard/dashboard.js'),
  '/units':         () => import('./modules/units/units.js'),
  '/billing':       () => import('./modules/billing/billing.js'),
  '/helpdesk':      () => import('./modules/helpdesk/helpdesk.js'),
  '/communication': () => import('./modules/communication/communication.js'),
  '/facilities':    () => import('./modules/facilities/facilities.js'),
  '/security':      () => import('./modules/security/security.js'),
  '/admin':         () => import('./modules/admin/admin.js'),
};

/** Navigate to a hash route */
export function navigate(path) {
  window.location.hash = path;
}

/** Bootstrap the router */
export function initRouter() {
  window.addEventListener('hashchange', _handleRoute);
  _handleRoute(); // handle initial load
}

async function _handleRoute() {
  const hash  = window.location.hash || '#/dashboard';
  const path  = hash.replace('#', '') || '/dashboard';
  const route = routes[path] || routes['/dashboard'];

  // Guard: /admin only for secretary
  if (path === '/admin' && !hasRole('secretary')) {
    navigate('/dashboard');
    return;
  }

  // Mark active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === path);
  });

  // Update topbar title
  const titles = {
    '/dashboard':     'Dashboard',
    '/units':         'Units & Residents',
    '/billing':       'Billing & Finance',
    '/helpdesk':      'Helpdesk',
    '/communication': 'Communication',
    '/facilities':    'Facilities',
    '/security':      'Security',
    '/admin':         'Admin Settings',
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[path] || 'SocietyPro';

  // Render module
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';

  try {
    const mod = await route();
    await mod.render(content);
  } catch (err) {
    console.error('Route error:', err);
    content.innerHTML = `<div class="card" style="padding:2rem;text-align:center;">
      <i class="fa-solid fa-circle-exclamation fa-2x" style="color:var(--status-danger);margin-bottom:1rem;"></i>
      <p>Failed to load page. <a href="#/dashboard">Go to Dashboard</a></p>
    </div>`;
  }
}
