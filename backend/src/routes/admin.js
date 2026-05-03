/**
 * Admin Routes — /api/admin/*
 * Protected by internalAuth (Supabase JWT) — must be secretary
 */
const router       = require('express').Router();
const internalAuth = require('../middleware/internalAuth');
const supabase     = require('../config/supabase-admin');

/**
 * POST /api/admin/create-user
 * Body: { name, email, phone, role, password }
 */
router.post('/create-user', internalAuth, async (req, res) => {
  // Only allow secretaries to create users
  if (req.authType !== 'jwt' || req.user.app_metadata?.role !== 'secretary') {
    return res.status(403).json({ error: 'Forbidden: Requires secretary role' });
  }

  const { name, email, phone, role, password } = req.body;

  if (!email || !name || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required' });
  }

  try {
    // 1. Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: password || 'Welcome@123', // Default password if not provided
      email_confirm: true,
      user_metadata: { name, phone },
      app_metadata: { role }
    });

    if (authError) throw authError;

    // 2. Insert into users table (profile)
    const { error: profileError } = await supabase.from('users').insert({
      id: authUser.user.id,
      name,
      email,
      phone,
      role,
      is_active: true
    });

    if (profileError) {
      // Rollback auth user creation if profile insert fails
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw profileError;
    }

    console.log(`[ADMIN] Created user ${email} with role ${role}`);
    res.json({ ok: true, user: { id: authUser.user.id, email, role } });
  } catch (err) {
    console.error('[ADMIN] Create user error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
