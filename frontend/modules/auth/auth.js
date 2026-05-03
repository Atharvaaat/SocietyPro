/**
 * SocietyPro — Auth Module
 * frontend/modules/auth/auth.js
 *
 * Handles login, logout, session management via Supabase Auth.
 * No custom JWT logic needed — Supabase handles refresh tokens.
 */
import { supabase } from '../../lib/supabase.js';

export let currentUser  = null;
export let currentRole  = null;
export let currentSession = null;

/** Bootstrap: called once at app startup */
export async function initAuth(onAuth, onNoAuth) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await _loadUser(session);
    onAuth(currentUser, currentRole);
  } else {
    onNoAuth();
  }

  // React to login/logout/token-refresh events
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      await _loadUser(session);
      onAuth(currentUser, currentRole);
    } else if (event === 'SIGNED_OUT') {
      currentUser = currentRole = currentSession = null;
      onNoAuth();
    }
  });
}

async function _loadUser(session) {
  currentSession = session;
  // Role lives in app_metadata (set by admin, not editable by user)
  currentRole = session.user.app_metadata?.role || 'resident';

  // Fetch display profile from our users table
  const { data } = await supabase
    .from('users')
    .select('id, name, email, phone, role, is_active')
    .eq('id', session.user.id)
    .single();

  currentUser = data || {
    id:    session.user.id,
    email: session.user.email,
    name:  session.user.email,
    role:  currentRole
  };

  // Update last_login in background
  supabase.from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', session.user.id)
    .then(() => {});
}

/** Sign in with email + password */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Sign out */
export async function logout() {
  await supabase.auth.signOut();
}

/** Check if current user has one of the given roles */
export function hasRole(...roles) {
  return roles.includes(currentRole);
}

/** Render the login form into #login-container */
export function renderLoginForm() {
  const container = document.getElementById('login-container');
  container.style.display = 'flex';

  const form = document.getElementById('login-form');
  const btn  = document.getElementById('login-submit-btn');
  const errEl = document.getElementById('login-error');

  form.onsubmit = async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
    if (errEl) errEl.textContent = '';

    try {
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      await login(email, password);
      // onAuthStateChange will fire and call onAuth → router takes over
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Invalid email or password';
      btn.disabled = false;
      btn.innerHTML = 'Sign In <i class="fa-solid fa-arrow-right ml-2"></i>';
    }
  };
}
