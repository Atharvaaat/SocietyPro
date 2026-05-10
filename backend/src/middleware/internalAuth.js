/**
 * internalAuth middleware
 * Accepts either:
 *   1. x-internal-token header (for pg_cron / cron jobs)
 *   2. Supabase JWT in Authorization Bearer (for user-triggered notifications)
 */
const jwt = require('jsonwebtoken');

module.exports = async function internalAuth(req, res, next) {
  // 1. Cron/internal token auth
  const internalToken = req.headers['x-internal-token'];
  if (internalToken && internalToken === process.env.INTERNAL_TOKEN) {
    req.authType = 'internal';
    return next();
  }

  // 2. Supabase JWT auth (user triggered from frontend)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const supabase = require('../config/supabase-admin');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token', detail: error?.message });
      }
      
      req.user = user;
      req.authType = 'jwt';
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Token verification failed', detail: err.message });
    }
  }

  return res.status(401).json({ error: 'Unauthorized — no valid token' });
};
