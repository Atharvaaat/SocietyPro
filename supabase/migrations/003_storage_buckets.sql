-- ============================================================
--  SocietyPro — Storage Buckets
--  Migration 003
-- ============================================================

-- Documents bucket (unit docs, agreements, etc.)
INSERT INTO storage.buckets (id, name, public) VALUES
  ('documents', 'documents', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Ticket attachments
INSERT INTO storage.buckets (id, name, public) VALUES
  ('tickets', 'tickets', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Meeting minutes
INSERT INTO storage.buckets (id, name, public) VALUES
  ('meetings', 'meetings', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Expense vouchers
INSERT INTO storage.buckets (id, name, public) VALUES
  ('vouchers', 'vouchers', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── Storage Policies ─────────────────────────────────────────

-- Documents: auth users can read, secretary can write
CREATE POLICY "documents_read_auth" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "documents_write_secretary" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'secretary'
  );

-- Tickets: auth users can read and upload
CREATE POLICY "tickets_read_auth" ON storage.objects
  FOR SELECT USING (bucket_id = 'tickets' AND auth.uid() IS NOT NULL);

CREATE POLICY "tickets_write_auth" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'tickets' AND auth.uid() IS NOT NULL);

-- Meetings: auth users can read, secretary can write
CREATE POLICY "meetings_read_auth" ON storage.objects
  FOR SELECT USING (bucket_id = 'meetings' AND auth.uid() IS NOT NULL);

CREATE POLICY "meetings_write_secretary" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meetings'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'secretary'
  );

-- Vouchers: auth users can read and upload
CREATE POLICY "vouchers_read_auth" ON storage.objects
  FOR SELECT USING (bucket_id = 'vouchers' AND auth.uid() IS NOT NULL);

CREATE POLICY "vouchers_write_auth" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'vouchers' AND auth.uid() IS NOT NULL);
