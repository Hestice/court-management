-- Payment flow support:
--   * Let a customer overwrite their own payment receipt at the fixed path
--     {user_id}/{booking_id}/receipt.webp — Supabase's upsert upload performs
--     an update when the object exists, so the owner needs both UPDATE and
--     DELETE on storage.objects inside the payment-receipts bucket.
--   * Harden payment_methods with length checks that match the UI (label 50,
--     account_details 500) so a direct SQL tamper can't store oversized text.
--   * Index payment_methods.display_order for the common ORDER BY query.

-- ============================================================================
-- payment-receipts — owner overwrite + owner delete
-- ============================================================================
create policy "payment_receipts_update_owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "payment_receipts_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- payment_methods — length guards + ordering index
-- ============================================================================
alter table public.payment_methods
  add constraint payment_methods_label_length
    check (char_length(label) between 1 and 50);

alter table public.payment_methods
  add constraint payment_methods_account_details_length
    check (char_length(account_details) between 1 and 500);

create index if not exists payment_methods_display_order_idx
  on public.payment_methods (display_order);
