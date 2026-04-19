-- storage.buckets has RLS enabled but no policies, so the authenticated role
-- can't see any bucket rows. The FK from storage.objects.bucket_id →
-- storage.buckets.id is enforced with the calling role's privileges, so every
-- upload fails with "new row violates row-level security policy for table
-- 'objects'" even when the policy on objects itself permits the write.
--
-- Allowing all authenticated users to SELECT bucket metadata matches Supabase's
-- default when buckets are created via the dashboard. Bucket rows are already
-- non-sensitive (name, public flag, file size limit) — the real access control
-- happens on storage.objects.
create policy "buckets_select_authenticated"
  on storage.buckets for select
  to authenticated, anon
  using (true);
