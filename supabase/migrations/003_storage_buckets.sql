-- ============================================================
--  SocietyPro — Storage Bucket Policies
--  Migration 003
--
--  Run this in Supabase SQL editor after creating buckets
--  via Dashboard: Storage → New Bucket
--  OR use Supabase CLI: supabase storage create <bucket>
-- ============================================================

-- NOTE: Bucket creation is done via Supabase Dashboard UI or CLI.
-- These SQL policies assume buckets already exist:
--   documents, tickets, vouchers, meetings, profiles

-- ── documents bucket ─────────────────────────────────────
-- Authenticated users can upload; secretary can delete
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "documents_upload_auth"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "documents_read_auth"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "documents_delete_secretary"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND (auth.jwt() ->> 'role') = 'secretary');

-- ── tickets bucket ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets', 'tickets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tickets_upload_auth"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tickets' AND auth.uid() IS NOT NULL);

CREATE POLICY "tickets_read_auth"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tickets' AND auth.uid() IS NOT NULL);

-- ── vouchers bucket ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vouchers', 'vouchers', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "vouchers_upload_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vouchers' AND
    (auth.jwt() ->> 'role') IN ('secretary','treasurer','manager'));

CREATE POLICY "vouchers_read_admin"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vouchers' AND
    (auth.jwt() ->> 'role') IN ('secretary','treasurer','manager'));

-- ── meetings bucket (MoM files) ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('meetings', 'meetings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "meetings_upload_secretary"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'meetings' AND (auth.jwt() ->> 'role') = 'secretary');

CREATE POLICY "meetings_read_auth"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'meetings' AND auth.uid() IS NOT NULL);

-- ── profiles bucket (avatars) ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('profiles', 'profiles', true)   -- public so avatars load without signed URL
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "profiles_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profiles' AND auth.uid() IS NOT NULL);

CREATE POLICY "profiles_read_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profiles');
