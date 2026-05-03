/**
 * internalAuth middleware
 * Accepts either:
 *   1. x-internal-token header (for pg_cron / cron jobs)
 *   2. Supabase JWT in Authorization Bearer (for user-triggered notifications)
 */
const jwt = require('jsonwebtoken');

module.exports = function internalAuth(req, res, next) {
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
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, {
        algorithms: ['HS256']
      });
      req.user    = decoded;
      req.authType = 'jwt';
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token', detail: err.message });
    }
  }

  return res.status(401).json({ error: 'Unauthorized — no valid token' });
};
