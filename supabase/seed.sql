-- ============================================================
--  SocietyPro — Seed Data
--  Run after migrations to create the default admin user.
--
--  IMPORTANT: Do NOT run this in production until you
--  have changed the password via Supabase Auth dashboard.
-- ============================================================

-- Step 1: Create user in Supabase Auth (run via Supabase CLI or Dashboard)
-- supabase auth admin create-user --email admin@societypro.in --password Admin@123

-- Step 2: Get the UUID from auth.users, then insert app profile:
-- The INSERT below uses a placeholder UUID — replace with the actual
-- UUID from auth.users after creating the user above.

-- After running `supabase auth admin create-user`, copy the id from output
-- and run:

/*
INSERT INTO users (id, name, email, phone, role)
VALUES (
  '<UUID-FROM-AUTH-USERS>',    -- replace this
  'Rajesh Kumar',
  'admin@societypro.in',
  '9876543210',
  'secretary'
) ON CONFLICT (id) DO NOTHING;
*/

-- Step 3: Set role in app_metadata so RLS functions can read it
-- Run in Supabase Dashboard → Auth → Users → Edit User → app_metadata:
-- { "role": "secretary" }

-- Or via Supabase CLI:
-- supabase auth admin update-user <UUID> --app-metadata '{"role":"secretary"}'

-- ── Sample amenities (optional) ───────────────────────────
INSERT INTO amenities (name, description, booking_fee, is_active) VALUES
  ('Swimming Pool',    'Olympic-size pool. Lifeguard on duty.', 0,   true),
  ('Clubhouse',        'AC clubhouse with catering kitchen.',    500, true),
  ('Badminton Court',  'Two synthetic courts. Lights included.', 0,   true),
  ('Children Play Area','Soft-floor play zone for kids.',        0,   true),
  ('Gym',              'Fully equipped gym. 6 AM – 10 PM.',      0,   true)
ON CONFLICT DO NOTHING;

-- ── Emergency contacts in settings ───────────────────────
INSERT INTO settings (key, value) VALUES
  ('society_name',    'PitruSmruti CHS'),
  ('society_address', 'Pune, Maharashtra'),
  ('maintenance_rate_per_sqft', '3.50'),
  ('penalty_rate_pct',         '1.5'),
  ('grace_period_days',        '10')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
