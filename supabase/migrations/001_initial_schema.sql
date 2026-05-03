-- ============================================================
--  SocietyPro — Complete Schema (Fresh Install)
--  Migration 001 — Run on a clean Supabase project
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS & AUTH
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  role          VARCHAR(30) NOT NULL DEFAULT 'resident'
                CHECK (role IN ('secretary','resident')),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE users IS 'App profile linked to Supabase auth.users. Only 2 roles: secretary (admin) and resident.';

-- ============================================================
-- 2. UNITS & MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS units (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_number   VARCHAR(20) UNIQUE NOT NULL,
  wing          VARCHAR(10),            -- optional
  floor         VARCHAR(20),
  area_sqft     NUMERIC(8,2),           -- optional
  unit_type     VARCHAR(30) DEFAULT 'Residential',
  status        VARCHAR(30) DEFAULT 'Vacant'
                CHECK (status IN ('Occupied','Vacant','Under Renovation')),
  description   TEXT,                   -- optional description
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id                 UUID REFERENCES units(id) ON DELETE CASCADE,
  user_id                 UUID REFERENCES users(id) ON DELETE SET NULL,
  member_type             VARCHAR(20) NOT NULL
                          CHECK (member_type IN ('Owner','Resident')),
  is_active               BOOLEAN DEFAULT TRUE,
  move_in_date            DATE,
  move_out_date           DATE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  -- Each unit can have only ONE active owner
  CONSTRAINT one_owner_per_unit EXCLUDE USING btree (unit_id WITH =)
    WHERE (member_type = 'Owner' AND is_active = TRUE)
);
COMMENT ON TABLE members IS 'Links users to units. Each unit has exactly one Owner and zero or more Residents.';

CREATE TABLE IF NOT EXISTS vehicles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id      UUID REFERENCES units(id) ON DELETE CASCADE,
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  vehicle_no   VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(20) CHECK (vehicle_type IN ('2-Wheeler','4-Wheeler','Other')),
  make_model   VARCHAR(60),
  parking_slot VARCHAR(20),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id      UUID REFERENCES units(id) ON DELETE SET NULL,
  category     VARCHAR(50) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  storage_path TEXT NOT NULL,
  file_size    BIGINT,
  mime_type    VARCHAR(80),
  uploaded_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. BILLING & FINANCE
-- ============================================================

-- Recurring expense templates — admin creates once, auto-generates monthly
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(150) NOT NULL,        -- e.g. "Water Tax", "Maintenance"
  description   TEXT,
  amount        NUMERIC(12,2) NOT NULL,
  frequency     VARCHAR(20) DEFAULT 'monthly'
                CHECK (frequency IN ('monthly','quarterly','yearly')),
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE recurring_expenses IS 'Templates for recurring society expenses. Admin adds once; cron auto-generates invoices.';

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  VARCHAR(30) UNIQUE NOT NULL,
  unit_id         UUID REFERENCES units(id),
  member_id       UUID REFERENCES members(id),
  invoice_type    VARCHAR(60) NOT NULL,       -- e.g. 'Water Tax', 'Maintenance', 'Custom Expense'
  billing_month   DATE,
  amount          NUMERIC(12,2) NOT NULL,
  penalty         NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) GENERATED ALWAYS AS (amount + penalty) STORED,
  due_date        DATE NOT NULL,
  status          VARCHAR(30) DEFAULT 'Pending'
                  CHECK (status IN ('Pending','Paid','Overdue','Cancelled','Partially Paid','Pending Verification')),
  notes           TEXT,
  recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  expense_id      UUID,                        -- FK added after expenses table
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id       UUID REFERENCES invoices(id),
  unit_id          UUID REFERENCES units(id),
  member_id        UUID REFERENCES members(id),
  amount           NUMERIC(12,2) NOT NULL,
  payment_mode     VARCHAR(30)
                   CHECK (payment_mode IN ('UPI','NetBanking','Credit Card','Debit Card','Cash','NEFT','RTGS','Cheque')),
  transaction_id   VARCHAR(100),
  status           VARCHAR(30) DEFAULT 'Pending Verification'
                   CHECK (status IN ('Success','Failed','Pending','Refunded','Pending Verification')),
  submitted_by     UUID REFERENCES users(id),
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  verified_by      UUID REFERENCES users(id),
  verified_at      TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses (custom + recurring tracking)
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200) NOT NULL,
  category      VARCHAR(60),
  description   TEXT NOT NULL,
  expense_type  VARCHAR(20) NOT NULL DEFAULT 'custom'
                CHECK (expense_type IN ('custom','recurring')),
  amount        NUMERIC(12,2) NOT NULL,
  due_date      DATE,
  expense_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  split_type    VARCHAR(20) DEFAULT 'none'
                CHECK (split_type IN ('none','equal','custom')),
  voucher_path  TEXT,
  status        VARCHAR(20) DEFAULT 'Pending'
                CHECK (status IN ('Pending','Approved','Paid','Rejected')),
  approved_by   UUID REFERENCES users(id),
  raised_by     UUID REFERENCES users(id),
  created_by    UUID REFERENCES users(id),
  recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE expenses IS 'All expenses — custom (raised by anyone, optionally split across units) and recurring (auto-generated from templates).';

-- Add FK from invoices to expenses
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_expense
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;

-- Expense splits — distributes a custom expense across selected units
CREATE TABLE IF NOT EXISTS expense_splits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id  UUID REFERENCES expenses(id) ON DELETE CASCADE,
  unit_id     UUID REFERENCES units(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  status      VARCHAR(20) DEFAULT 'Pending'
              CHECK (status IN ('Pending','Paid')),
  invoice_id  UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE expense_splits IS 'Per-unit share of a split expense. Each split generates an invoice for that unit.';

-- ============================================================
-- 4. HELPDESK / TICKETING
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  unit_id       UUID REFERENCES units(id),
  raised_by     UUID REFERENCES users(id),
  category      VARCHAR(40) NOT NULL,
  description   TEXT NOT NULL,
  priority      VARCHAR(20) DEFAULT 'Normal'
                CHECK (priority IN ('Low','Normal','Urgent')),
  status        VARCHAR(30) DEFAULT 'Open'
                CHECK (status IN ('Open','Assigned','In-Progress','Resolved','Closed','Reopened')),
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
  storage_path TEXT NOT NULL,
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
  priority     VARCHAR(20) DEFAULT 'Normal'
               CHECK (priority IN ('Normal','Urgent')),
  posted_by    UUID REFERENCES users(id),
  is_published BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id  UUID REFERENCES notices(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (notice_id, user_id)
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
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  option_idx INT NOT NULL,
  voted_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        VARCHAR(200) NOT NULL,
  agenda       TEXT,
  venue        VARCHAR(150),
  meeting_date TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) DEFAULT 'Upcoming'
               CHECK (status IN ('Upcoming','Completed','Cancelled')),
  mom_path     TEXT,
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
  booked_by    UUID REFERENCES users(id),
  booking_date DATE NOT NULL,
  time_slot    VARCHAR(40),
  purpose      TEXT,
  fee_charged  NUMERIC(8,2) DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'Confirmed'
               CHECK (status IN ('Confirmed','Cancelled','Completed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(150) NOT NULL,
  location     VARCHAR(150),
  amc_vendor   VARCHAR(100),
  amc_expiry   DATE,
  last_service DATE,
  status       VARCHAR(30) DEFAULT 'OK'
               CHECK (status IN ('OK','Expiring Soon','Expired','Under Repair')),
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
  purpose      VARCHAR(50)
               CHECK (purpose IN ('Guest','Delivery','Cab/Driver','Repair Work','Other')),
  host_unit_id UUID REFERENCES units(id),
  vehicle_no   VARCHAR(20),
  id_proof     VARCHAR(60),
  check_in     TIMESTAMPTZ DEFAULT NOW(),
  check_out    TIMESTAMPTZ,
  qr_token     VARCHAR(100),
  status       VARCHAR(20) DEFAULT 'Checked In'
               CHECK (status IN ('Pre-Approved','Checked In','Checked Out')),
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
  status     VARCHAR(20) DEFAULT 'Present'
             CHECK (status IN ('Present','Absent','Half Day')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID REFERENCES units(id),
  triggered_by UUID REFERENCES users(id),
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
-- 10. NOTIFICATION QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_queue (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         VARCHAR(20) NOT NULL CHECK (type IN ('email','sms')),
  payload      JSONB NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending'
               CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts     INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  next_retry   TIMESTAMPTZ DEFAULT NOW(),
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);
COMMENT ON TABLE notification_queue IS 'Queue for email/SMS. Backend polls and retries until max_attempts.';

-- ============================================================
-- SEQUENCES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1001 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS ticket_seq  START 1    INCREMENT 1;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_role            ON users(role);
CREATE INDEX IF NOT EXISTS idx_units_status          ON units(status);
CREATE INDEX IF NOT EXISTS idx_members_unit          ON members(unit_id);
CREATE INDEX IF NOT EXISTS idx_members_user          ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_active        ON members(is_active);
CREATE INDEX IF NOT EXISTS idx_invoices_unit         ON invoices(unit_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due          ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_recurring    ON invoices(recurring_expense_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice      ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status);
CREATE INDEX IF NOT EXISTS idx_expenses_type         ON expenses(expense_type);
CREATE INDEX IF NOT EXISTS idx_expenses_raised_by    ON expenses(raised_by);
CREATE INDEX IF NOT EXISTS idx_expense_splits_exp    ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_unit   ON expense_splits(unit_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status        ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_unit          ON tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_visitors_checkin      ON visitors(check_in);
CREATE INDEX IF NOT EXISTS idx_audit_user            ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity          ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created         ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notif_queue_status    ON notification_queue(status, next_retry);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Progressive penalty: 5% after due date, +2% every 10 days
CREATE OR REPLACE FUNCTION apply_late_penalties()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  inv RECORD;
  days_overdue INT;
  penalty_pct NUMERIC;
  new_penalty NUMERIC;
BEGIN
  FOR inv IN
    SELECT id, amount, due_date, penalty
    FROM invoices
    WHERE status IN ('Pending', 'Overdue')
      AND due_date < CURRENT_DATE
  LOOP
    days_overdue := CURRENT_DATE - inv.due_date;

    -- Base: 5% after due date
    penalty_pct := 5.0;

    -- Add 2% for every 10 days past due date
    IF days_overdue > 10 THEN
      penalty_pct := penalty_pct + (FLOOR((days_overdue - 1) / 10.0) * 2.0);
    END IF;

    new_penalty := ROUND(inv.amount * penalty_pct / 100.0, 2);

    -- Only update if penalty changed
    IF new_penalty <> COALESCE(inv.penalty, 0) THEN
      UPDATE invoices
      SET penalty    = new_penalty,
          status     = 'Overdue',
          updated_at = NOW()
      WHERE id = inv.id;
    ELSIF inv.penalty = 0 THEN
      -- Mark overdue even if penalty didn't change (first time)
      UPDATE invoices
      SET status = 'Overdue', updated_at = NOW()
      WHERE id = inv.id AND status = 'Pending';
    END IF;
  END LOOP;
END;
$$;

-- Auto-generate invoices from recurring expense templates
CREATE OR REPLACE FUNCTION generate_recurring_invoices()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  unit_rec RECORD;
  inv_num VARCHAR;
  billing DATE;
  due DATE;
BEGIN
  billing := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  due := (billing + INTERVAL '1 month' - INTERVAL '5 days')::DATE;  -- due 5 days before month end

  FOR rec IN
    SELECT * FROM recurring_expenses WHERE is_active = TRUE
  LOOP
    -- Skip if frequency doesn't match
    IF rec.frequency = 'quarterly' AND EXTRACT(MONTH FROM CURRENT_DATE)::INT % 3 != 1 THEN
      CONTINUE;
    END IF;
    IF rec.frequency = 'yearly' AND EXTRACT(MONTH FROM CURRENT_DATE)::INT != 1 THEN
      CONTINUE;
    END IF;

    -- Generate invoice for each occupied unit
    FOR unit_rec IN
      SELECT u.id AS unit_id, m.id AS member_id
      FROM units u
      LEFT JOIN members m ON m.unit_id = u.id AND m.member_type = 'Owner' AND m.is_active = TRUE
      WHERE u.status = 'Occupied'
    LOOP
      -- Skip if already generated for this unit this month
      IF EXISTS (
        SELECT 1 FROM invoices
        WHERE unit_id = unit_rec.unit_id
          AND recurring_expense_id = rec.id
          AND billing_month = billing
      ) THEN
        CONTINUE;
      END IF;

      inv_num := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(nextval('invoice_seq')::TEXT, 4, '0');

      INSERT INTO invoices (
        invoice_number, unit_id, member_id, invoice_type,
        billing_month, amount, due_date, recurring_expense_id,
        status, created_at
      ) VALUES (
        inv_num, unit_rec.unit_id, unit_rec.member_id, rec.name,
        billing, rec.amount, due, rec.id,
        'Pending', NOW()
      );
    END LOOP;
  END LOOP;
END;
$$;

-- Trigger: sync role to auth.users.app_metadata when users.role changes
CREATE OR REPLACE FUNCTION sync_role_to_auth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', NEW.role)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_role
  AFTER UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION sync_role_to_auth();

-- Trigger: set role in app_metadata on insert
CREATE OR REPLACE FUNCTION set_role_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_role_insert
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION set_role_on_insert();
