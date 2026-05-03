-- ============================================================
--  SocietyPro — Initial Schema (Supabase / PostgreSQL)
--  Migration 001
-- ============================================================

-- Extensions (Supabase enables uuid-ossp by default; pgcrypto for passwords)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS & AUTH
-- NOTE: Auth is handled by Supabase Auth (auth.users table).
--       This table stores app-level profile & role metadata.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  role          VARCHAR(30) NOT NULL CHECK (role IN ('secretary','treasurer','manager','security','technician','resident')),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE users IS 'App profile linked to Supabase auth.users. Role stored here and in auth.users.app_metadata for RLS.';

-- ============================================================
-- 2. UNITS & RESIDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS units (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_number   VARCHAR(20) UNIQUE NOT NULL,
  wing          VARCHAR(10),
  floor         VARCHAR(20),
  area_sqft     NUMERIC(8,2),
  unit_type     VARCHAR(30) DEFAULT 'Residential',
  status        VARCHAR(30) DEFAULT 'Vacant' CHECK (status IN ('Occupied','Vacant','Under Renovation')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id                UUID REFERENCES units(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  member_type            VARCHAR(20) NOT NULL CHECK (member_type IN ('Owner','Tenant')),
  name                   VARCHAR(120) NOT NULL,
  email                  VARCHAR(150),
  phone                  VARCHAR(20),
  alternate_phone        VARCHAR(20),
  family_members         TEXT,
  emergency_contact_name  VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  move_in_date           DATE,
  move_out_date          DATE,
  is_active              BOOLEAN DEFAULT TRUE,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id      UUID REFERENCES units(id) ON DELETE CASCADE,
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  vehicle_no   VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(20) CHECK (vehicle_type IN ('2-Wheeler','4-Wheeler','Other')),
  make_model   VARCHAR(60),
  parking_slot VARCHAR(20),
  rfid_sticker VARCHAR(40),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id      UUID REFERENCES units(id) ON DELETE SET NULL,
  category     VARCHAR(50) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  storage_path TEXT NOT NULL,      -- Supabase Storage path (bucket/path)
  file_size    BIGINT,
  mime_type    VARCHAR(80),
  uploaded_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON COLUMN documents.storage_path IS 'Supabase Storage object path, e.g. documents/unit-123/file.pdf';

-- ============================================================
-- 3. BILLING & FINANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  VARCHAR(30) UNIQUE NOT NULL,
  unit_id         UUID REFERENCES units(id),
  member_id       UUID REFERENCES members(id),
  invoice_type    VARCHAR(60) NOT NULL,
  billing_month   DATE,
  amount          NUMERIC(12,2) NOT NULL,
  penalty         NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) GENERATED ALWAYS AS (amount + penalty) STORED,
  due_date        DATE NOT NULL,
  status          VARCHAR(30) DEFAULT 'Pending'
                  CHECK (status IN ('Pending','Paid','Overdue','Cancelled','Partially Paid','Pending Verification')),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id       UUID REFERENCES invoices(id),
  unit_id          UUID REFERENCES units(id),
  member_id        UUID REFERENCES members(id),
  amount           NUMERIC(12,2) NOT NULL,
  payment_mode     VARCHAR(30) CHECK (payment_mode IN ('UPI','NetBanking','Credit Card','Debit Card','Cash','NEFT','RTGS','Cheque')),
  transaction_id   VARCHAR(100),            -- UTR / ref entered by resident
  status           VARCHAR(30) DEFAULT 'Pending Verification'
                   CHECK (status IN ('Success','Failed','Pending','Refunded','Pending Verification')),
  -- Manual verification workflow
  submitted_by     UUID REFERENCES users(id),
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  verified_by      UUID REFERENCES users(id),
  verified_at      TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON COLUMN payments.transaction_id IS 'UTR / UPI transaction ID entered by resident when marking payment';

CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category     VARCHAR(60) NOT NULL,
  vendor_id    UUID,
  description  TEXT NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  voucher_path TEXT,                 -- Supabase Storage path
  status       VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending','Paid','Rejected')),
  approved_by  UUID REFERENCES users(id),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. HELPDESK / TICKETING
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  unit_id       UUID REFERENCES units(id),
  raised_by     UUID REFERENCES members(id),
  category      VARCHAR(40) NOT NULL,
  description   TEXT NOT NULL,
  priority      VARCHAR(20) DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','Urgent')),
  status        VARCHAR(30) DEFAULT 'Open' CHECK (status IN ('Open','Assigned','In-Progress','Resolved','Closed','Reopened')),
  assigned_to   UUID REFERENCES users(id),
  sla_hours     INT DEFAULT 24,
  resolved_at   TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_updates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id  UUID REFERENCES tickets(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES users(id),
  status     VARCHAR(30),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID REFERENCES tickets(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,        -- Supabase Storage path
  mime_type    VARCHAR(80),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. COMMUNICATION
-- ============================================================
CREATE TABLE IF NOT EXISTS notices (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        VARCHAR(200) NOT NULL,
  body         TEXT NOT NULL,
  category     VARCHAR(40),
  priority     VARCHAR(20) DEFAULT 'Normal' CHECK (priority IN ('Normal','Urgent')),
  posted_by    UUID REFERENCES users(id),
  is_published BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id  UUID REFERENCES notices(id) ON DELETE CASCADE,
  member_id  UUID REFERENCES members(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (notice_id, member_id)
);

CREATE TABLE IF NOT EXISTS polls (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question     TEXT NOT NULL,
  options      JSONB NOT NULL,
  deadline     DATE,
  is_active    BOOLEAN DEFAULT TRUE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    UUID REFERENCES polls(id) ON DELETE CASCADE,
  member_id  UUID REFERENCES members(id) ON DELETE CASCADE,
  option_idx INT NOT NULL,
  voted_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (poll_id, member_id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        VARCHAR(200) NOT NULL,
  agenda       TEXT,
  venue        VARCHAR(150),
  meeting_date TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) DEFAULT 'Upcoming' CHECK (status IN ('Upcoming','Completed','Cancelled')),
  mom_path     TEXT,                -- Supabase Storage path for Minutes of Meeting
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. FACILITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS amenities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  booking_fee  NUMERIC(8,2) DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS amenity_bookings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  amenity_id   UUID REFERENCES amenities(id),
  unit_id      UUID REFERENCES units(id),
  member_id    UUID REFERENCES members(id),
  booking_date DATE NOT NULL,
  time_slot    VARCHAR(40),
  purpose      TEXT,
  fee_charged  NUMERIC(8,2) DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'Confirmed' CHECK (status IN ('Confirmed','Cancelled','Completed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(150) NOT NULL,
  location     VARCHAR(150),
  amc_vendor   VARCHAR(100),
  amc_expiry   DATE,
  last_service DATE,
  status       VARCHAR(30) DEFAULT 'OK' CHECK (status IN ('OK','Expiring Soon','Expired','Under Repair')),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(150) NOT NULL,
  service_type    VARCHAR(80),
  contact_name    VARCHAR(100),
  phone           VARCHAR(20),
  email           VARCHAR(150),
  address         TEXT,
  rating          SMALLINT DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  contract_status VARCHAR(20) DEFAULT 'Active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. SECURITY & VISITORS
-- ============================================================
CREATE TABLE IF NOT EXISTS visitors (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(120) NOT NULL,
  phone        VARCHAR(20),
  purpose      VARCHAR(50) CHECK (purpose IN ('Guest','Delivery','Cab/Driver','Repair Work','Other')),
  host_unit_id UUID REFERENCES units(id),
  vehicle_no   VARCHAR(20),
  id_proof     VARCHAR(60),
  check_in     TIMESTAMPTZ DEFAULT NOW(),
  check_out    TIMESTAMPTZ,
  qr_token     VARCHAR(100),
  status       VARCHAR(20) DEFAULT 'Checked In' CHECK (status IN ('Pre-Approved','Checked In','Checked Out')),
  logged_by    UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_name VARCHAR(120) NOT NULL,
  role       VARCHAR(60),
  unit_id    UUID REFERENCES units(id),
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in   TIME,
  check_out  TIME,
  status     VARCHAR(20) DEFAULT 'Present' CHECK (status IN ('Present','Absent','Half Day')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID REFERENCES units(id),
  member_id   UUID REFERENCES members(id),
  message     TEXT DEFAULT 'Panic/Emergency alert',
  is_drill    BOOLEAN DEFAULT FALSE,
  resolved    BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(60),
  entity_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEQUENCES (for invoice and ticket numbering)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1001 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS ticket_seq  START 1    INCREMENT 1;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_units_status       ON units(status);
CREATE INDEX IF NOT EXISTS idx_members_unit        ON members(unit_id);
CREATE INDEX IF NOT EXISTS idx_members_active      ON members(is_active);
CREATE INDEX IF NOT EXISTS idx_invoices_unit       ON invoices(unit_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due        ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice    ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_unit        ON tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_visitors_checkin    ON visitors(check_in);
CREATE INDEX IF NOT EXISTS idx_audit_user          ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity        ON audit_logs(entity, entity_id);

-- ============================================================
-- HELPER FUNCTION: Apply late penalties (called by pg_cron)
-- ============================================================
CREATE OR REPLACE FUNCTION apply_late_penalties()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE invoices
  SET status     = 'Overdue',
      penalty    = ROUND(amount * 0.015, 2),
      updated_at = NOW()
  WHERE status   = 'Pending'
    AND due_date < CURRENT_DATE - INTERVAL '10 days';
END;
$$;
