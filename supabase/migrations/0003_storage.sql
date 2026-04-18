-- Supabase Storage buckets + RLS policies for payment receipts and QR images.

-- ============================================================================
-- payment-receipts (private)
-- Users upload proof of payment to a folder named after their user id.
-- Only the owner and admins can read; only admins can delete.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

create policy "payment_receipts_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "payment_receipts_select_owner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "payment_receipts_select_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and public.is_admin()
  );

create policy "payment_receipts_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and public.is_admin()
  );

-- ============================================================================
-- payment-qrs (public)
-- Admin-uploaded QR images shown on the payment instructions page.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('payment-qrs', 'payment-qrs', true)
on conflict (id) do nothing;

create policy "payment_qrs_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-qrs'
    and public.is_admin()
  );

create policy "payment_qrs_update_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'payment-qrs'
    and public.is_admin()
  )
  with check (
    bucket_id = 'payment-qrs'
    and public.is_admin()
  );

create policy "payment_qrs_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-qrs'
    and public.is_admin()
  );
