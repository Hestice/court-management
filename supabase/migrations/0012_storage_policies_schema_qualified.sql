-- Supabase Storage evaluates RLS on storage.objects inside the storage
-- service's connection, which uses a narrower search_path than the default
-- (typically `storage, public` but sometimes only `storage`). Calling
-- `is_admin()` unqualified from a policy in that context can fail to resolve
-- to `public.is_admin()` and silently returns NULL — which RLS treats as
-- false, producing "new row violates row-level security policy" even when
-- the caller is a real admin. Re-create every storage policy that references
-- `is_admin()` so the call is fully schema-qualified.

-- payment-qrs
drop policy if exists "payment_qrs_insert_admin" on storage.objects;
create policy "payment_qrs_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-qrs'
    and public.is_admin()
  );

drop policy if exists "payment_qrs_update_admin" on storage.objects;
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

drop policy if exists "payment_qrs_delete_admin" on storage.objects;
create policy "payment_qrs_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-qrs'
    and public.is_admin()
  );

-- payment-receipts (admin SELECT and DELETE paths)
drop policy if exists "payment_receipts_select_admin" on storage.objects;
create policy "payment_receipts_select_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and public.is_admin()
  );

drop policy if exists "payment_receipts_delete_admin" on storage.objects;
create policy "payment_receipts_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and public.is_admin()
  );
