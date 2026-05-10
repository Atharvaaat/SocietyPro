-- ============================================================
--  SocietyPro — Billing Enhancements & Notifications
--  Migration 005
-- ============================================================

-- ── 1. Recurring Expenses: add scheduling & penalty config ──
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS notify_day INT DEFAULT 1;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS notify_time TIME DEFAULT '12:00';
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS due_days INT DEFAULT 10;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS penalty_percent NUMERIC(5,2) DEFAULT 5.0;

-- ── 2. Users: add telegram_chat_id for notifications ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50);

-- ── 3. Notifications table (Telegram-first queue) ──
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  type         VARCHAR(30) NOT NULL CHECK (type IN ('expense','payment','penalty','ticket','general','reminder')),
  title        VARCHAR(200) NOT NULL,
  message      TEXT NOT NULL,
  channel      VARCHAR(20) DEFAULT 'telegram' CHECK (channel IN ('telegram','email','sms')),
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts     INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  error        TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_secretary" ON notifications
  FOR SELECT USING (is_secretary());

CREATE POLICY "notifications_insert_auth" ON notifications
  FOR INSERT WITH CHECK (is_auth());

CREATE POLICY "notifications_update_secretary" ON notifications
  FOR UPDATE USING (is_secretary());

-- ── 4. Allow users to update their own invoice status (for "Pay Now") ──
CREATE POLICY "invoices_update_own_status" ON invoices
  FOR UPDATE USING (
    member_id IN (SELECT id FROM members WHERE user_id = auth.uid())
  );

-- ── 5. Replace apply_late_penalties() — now uses per-expense penalty_percent ──
CREATE OR REPLACE FUNCTION apply_late_penalties()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  inv RECORD;
  days_overdue INT;
  penalty_pct NUMERIC;
  new_penalty NUMERIC;
BEGIN
  FOR inv IN
    SELECT i.id, i.amount, i.due_date, i.penalty, i.recurring_expense_id,
           COALESCE(re.penalty_percent, 5.0) AS cfg_penalty_pct
    FROM invoices i
    LEFT JOIN recurring_expenses re ON re.id = i.recurring_expense_id
    WHERE i.status IN ('Pending', 'Overdue')
      AND i.due_date < CURRENT_DATE
  LOOP
    days_overdue := CURRENT_DATE - inv.due_date;
    penalty_pct := inv.cfg_penalty_pct;

    new_penalty := ROUND(inv.amount * penalty_pct / 100.0, 2);

    IF new_penalty <> COALESCE(inv.penalty, 0) THEN
      UPDATE invoices
      SET penalty    = new_penalty,
          status     = 'Overdue',
          updated_at = NOW()
      WHERE id = inv.id;
    ELSIF inv.penalty = 0 THEN
      UPDATE invoices
      SET status = 'Overdue', updated_at = NOW()
      WHERE id = inv.id AND status = 'Pending';
    END IF;
  END LOOP;
END;
$$;

-- ── 6. Replace generate_recurring_invoices() — rollover unpaid + configurable due days ──
CREATE OR REPLACE FUNCTION generate_recurring_invoices()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  unit_rec RECORD;
  inv_num VARCHAR;
  billing DATE;
  due DATE;
  unpaid_total NUMERIC;
  unpaid_penalty NUMERIC;
  final_amount NUMERIC;
BEGIN
  billing := DATE_TRUNC('month', CURRENT_DATE)::DATE;

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

    -- Calculate due date from configurable due_days
    due := (billing + (COALESCE(rec.due_days, 10) || ' days')::INTERVAL)::DATE;

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

      -- Calculate rollover: sum of unpaid invoices from previous months
      SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(penalty), 0)
      INTO unpaid_total, unpaid_penalty
      FROM invoices
      WHERE unit_id = unit_rec.unit_id
        AND recurring_expense_id = rec.id
        AND status IN ('Pending', 'Overdue')
        AND billing_month < billing;

      final_amount := rec.amount + unpaid_total + unpaid_penalty;

      inv_num := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(nextval('invoice_seq')::TEXT, 4, '0');

      INSERT INTO invoices (
        invoice_number, unit_id, member_id, invoice_type,
        billing_month, amount, due_date, recurring_expense_id,
        status, notes, created_at
      ) VALUES (
        inv_num, unit_rec.unit_id, unit_rec.member_id, rec.name,
        billing, final_amount, due, rec.id,
        'Pending',
        CASE WHEN unpaid_total > 0
          THEN 'Includes rollover: ₹' || unpaid_total::TEXT || ' + penalty ₹' || unpaid_penalty::TEXT
          ELSE NULL
        END,
        NOW()
      );

      -- Mark old unpaid invoices as rolled over
      IF unpaid_total > 0 THEN
        UPDATE invoices
        SET status = 'Cancelled', notes = 'Rolled over to ' || inv_num, updated_at = NOW()
        WHERE unit_id = unit_rec.unit_id
          AND recurring_expense_id = rec.id
          AND status IN ('Pending', 'Overdue')
          AND billing_month < billing;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
