/**
 * Supabase Admin Client (service_role key)
 * Used ONLY in the backend — NEVER expose this key to the frontend.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    }
  }
);

module.exports = supabase;
