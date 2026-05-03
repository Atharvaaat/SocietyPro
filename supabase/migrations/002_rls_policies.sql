-- ============================================================
--  SocietyPro — Row-Level Security Policies
--  Migration 002
--
--  Role is read from: auth.jwt() ->> 'role'
--  which is set in auth.users.app_metadata.role
--  by the admin via Supabase Dashboard or Edge Function.
-- ============================================================

-- Enable RLS on every table
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE units              ENABLE ROW LEVEL SECURITY;
ALTER TABLE members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_updates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenity_bookings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_alerts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: role check functions (shorthand)
-- ============================================================
CREATE OR REPLACE FUNCTION is_secretary()   RETURNS boolean LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT (auth.jwt() ->> 'role') = 'secretary' $$;

CREATE OR REPLACE FUNCTION is_admin_role()  RETURNS boolean LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT (auth.jwt() ->> 'role') IN ('secretary','treasurer','manager') $$;

CREATE OR REPLACE FUNCTION is_auth()        RETURNS boolean LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT auth.uid() IS NOT NULL $$;

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE POLICY "users_select_authenticated" ON users
  FOR SELECT USING (is_auth());

CREATE POLICY "users_update_own"           ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_update_secretary"     ON users
  FOR UPDATE USING (is_secretary());

-- ============================================================
-- UNITS
-- ============================================================
CREATE POLICY "units_select_all_auth"      ON units FOR SELECT USING (is_auth());
CREATE POLICY "units_insert_admin"         ON units FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "units_update_admin"         ON units FOR UPDATE USING (is_admin_role());

-- ============================================================
-- MEMBERS
-- ============================================================
CREATE POLICY "members_select_all_auth"    ON members FOR SELECT USING (is_auth());
CREATE POLICY "members_insert_admin"       ON members FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "members_update_admin"       ON members FOR UPDATE USING (is_admin_role());

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE POLICY "vehicles_select_auth"       ON vehicles FOR SELECT USING (is_auth());
CREATE POLICY "vehicles_insert_admin"      ON vehicles FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "vehicles_update_admin"      ON vehicles FOR UPDATE USING (is_admin_role());

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE POLICY "documents_select_auth"      ON documents FOR SELECT USING (is_auth());
CREATE POLICY "documents_insert_auth"      ON documents FOR INSERT WITH CHECK (is_auth());
CREATE POLICY "documents_delete_secretary" ON documents FOR DELETE USING (is_secretary());

-- ============================================================
-- INVOICES
-- ============================================================
CREATE POLICY "invoices_select_auth"       ON invoices FOR SELECT USING (is_auth());
CREATE POLICY "invoices_insert_finance"    ON invoices FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') IN ('secretary','treasurer'));
CREATE POLICY "invoices_update_finance"    ON invoices FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('secretary','treasurer'));

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE POLICY "payments_select_auth"       ON payments FOR SELECT USING (is_auth());

-- Residents can INSERT their own payment submission
CREATE POLICY "payments_insert_auth"       ON payments FOR INSERT WITH CHECK (is_auth());

-- Only secretary/treasurer can verify (UPDATE verified_by, verified_at, status→Success)
CREATE POLICY "payments_update_finance"    ON payments FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('secretary','treasurer'));

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE POLICY "expenses_select_auth"       ON expenses FOR SELECT USING (is_auth());
CREATE POLICY "expenses_insert_admin"      ON expenses FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "expenses_update_admin"      ON expenses FOR UPDATE USING (is_admin_role());

-- ============================================================
-- TICKETS
-- ============================================================
CREATE POLICY "tickets_select_auth"        ON tickets FOR SELECT USING (is_auth());
CREATE POLICY "tickets_insert_auth"        ON tickets FOR INSERT WITH CHECK (is_auth());
CREATE POLICY "tickets_update_auth"        ON tickets FOR UPDATE USING (is_auth());
CREATE POLICY "tickets_delete_admin"       ON tickets FOR DELETE USING (is_admin_role());

CREATE POLICY "ticket_updates_select_auth" ON ticket_updates FOR SELECT USING (is_auth());
CREATE POLICY "ticket_updates_insert_auth" ON ticket_updates FOR INSERT WITH CHECK (is_auth());

CREATE POLICY "ticket_attach_select_auth"  ON ticket_attachments FOR SELECT USING (is_auth());
CREATE POLICY "ticket_attach_insert_auth"  ON ticket_attachments FOR INSERT WITH CHECK (is_auth());

-- ============================================================
-- NOTICES
-- ============================================================
CREATE POLICY "notices_select_auth"        ON notices FOR SELECT USING (is_auth() AND is_published = TRUE);
CREATE POLICY "notices_insert_admin"       ON notices FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "notices_update_admin"       ON notices FOR UPDATE USING (is_admin_role());
CREATE POLICY "notices_delete_secretary"   ON notices FOR DELETE USING (is_secretary());

CREATE POLICY "notice_reads_select_auth"   ON notice_reads FOR SELECT USING (is_auth());
CREATE POLICY "notice_reads_insert_auth"   ON notice_reads FOR INSERT WITH CHECK (is_auth());

-- ============================================================
-- POLLS
-- ============================================================
CREATE POLICY "polls_select_auth"          ON polls FOR SELECT USING (is_auth());
CREATE POLICY "polls_insert_admin"         ON polls FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "polls_update_admin"         ON polls FOR UPDATE USING (is_admin_role());

CREATE POLICY "poll_votes_select_auth"     ON poll_votes FOR SELECT USING (is_auth());
CREATE POLICY "poll_votes_insert_auth"     ON poll_votes FOR INSERT WITH CHECK (is_auth());

-- ============================================================
-- MEETINGS
-- ============================================================
CREATE POLICY "meetings_select_auth"       ON meetings FOR SELECT USING (is_auth());
CREATE POLICY "meetings_insert_secretary"  ON meetings FOR INSERT WITH CHECK (is_secretary());
CREATE POLICY "meetings_update_secretary"  ON meetings FOR UPDATE USING (is_secretary());

-- ============================================================
-- FACILITIES
-- ============================================================
CREATE POLICY "amenities_select_auth"      ON amenities FOR SELECT USING (is_auth());
CREATE POLICY "amenities_insert_admin"     ON amenities FOR INSERT WITH CHECK (is_admin_role());

CREATE POLICY "bookings_select_auth"       ON amenity_bookings FOR SELECT USING (is_auth());
CREATE POLICY "bookings_insert_auth"       ON amenity_bookings FOR INSERT WITH CHECK (is_auth());
CREATE POLICY "bookings_update_auth"       ON amenity_bookings FOR UPDATE USING (is_auth());

CREATE POLICY "assets_select_auth"         ON assets FOR SELECT USING (is_auth());
CREATE POLICY "assets_insert_admin"        ON assets FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "assets_update_admin"        ON assets FOR UPDATE USING (is_admin_role());

CREATE POLICY "vendors_select_auth"        ON vendors FOR SELECT USING (is_auth());
CREATE POLICY "vendors_insert_admin"       ON vendors FOR INSERT WITH CHECK (is_admin_role());
CREATE POLICY "vendors_update_admin"       ON vendors FOR UPDATE USING (is_admin_role());

-- ============================================================
-- SECURITY
-- ============================================================
CREATE POLICY "visitors_select_auth"       ON visitors FOR SELECT USING (is_auth());
CREATE POLICY "visitors_insert_auth"       ON visitors FOR INSERT WITH CHECK (is_auth());
CREATE POLICY "visitors_update_auth"       ON visitors FOR UPDATE USING (is_auth());

CREATE POLICY "attendance_select_auth"     ON staff_attendance FOR SELECT USING (is_auth());
CREATE POLICY "attendance_insert_auth"     ON staff_attendance FOR INSERT WITH CHECK (is_auth());

CREATE POLICY "sos_select_auth"            ON sos_alerts FOR SELECT USING (is_auth());
CREATE POLICY "sos_insert_auth"            ON sos_alerts FOR INSERT WITH CHECK (is_auth());
CREATE POLICY "sos_update_security"        ON sos_alerts FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('secretary','manager','security'));

-- ============================================================
-- AUDIT LOGS (secretary only)
-- ============================================================
CREATE POLICY "audit_select_secretary"     ON audit_logs FOR SELECT USING (is_secretary());
CREATE POLICY "audit_insert_auth"          ON audit_logs FOR INSERT WITH CHECK (is_auth());

-- ============================================================
-- SETTINGS (secretary only)
-- ============================================================
CREATE POLICY "settings_select_secretary"  ON settings FOR SELECT USING (is_secretary());
CREATE POLICY "settings_upsert_secretary"  ON settings FOR ALL USING (is_secretary());
