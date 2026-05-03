-- ============================================================
--  SocietyPro — Seed Data
--  Run after migrations to bootstrap the default admin + settings.
-- ============================================================

-- ── Default Settings ─────────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('society_name',    'SocietyPro'),
  ('society_address', '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── Sample Amenities ─────────────────────────────────────────
INSERT INTO amenities (name, description, booking_fee, is_active) VALUES
  ('Swimming Pool',     'Olympic-size pool. Lifeguard on duty.', 0,   TRUE),
  ('Clubhouse',         'AC clubhouse with catering kitchen.',   500, TRUE),
  ('Badminton Court',   'Two synthetic courts. Lights included.',0,   TRUE),
  ('Children Play Area','Soft-floor play zone for kids.',        0,   TRUE),
  ('Gym',               'Fully equipped gym. 6 AM – 10 PM.',    0,   TRUE)
ON CONFLICT DO NOTHING;

-- ── Instructions for Admin User ──────────────────────────────
-- 1. Create user via Supabase Dashboard → Authentication → Users → Add User
--    Email: admin@societypro.in, Password: Admin@123
--
-- 2. Copy the UUID, then run:
--    INSERT INTO users (id, name, email, phone, role)
--    VALUES ('<UUID>', 'Admin', 'admin@societypro.in', '9876543210', 'secretary');
--
-- 3. Or use the "Add User" button in Admin Settings (it does both steps).
