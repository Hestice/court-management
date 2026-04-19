-- Merge entrance-pass purchases into the booking flow. After this migration:
--   * bookings get a guest_count column (1..50) for per-head entrance.
--   * pass_guests becomes booking_guests, always keyed to a booking.
--   * entrance_passes becomes walk_in_entries — an admin-side log of people
--     entering the facility without their own booking (spectators, friends
--     joining an existing booking, casual use). No payment flow, no QR codes.
--
-- No production data exists on these tables, so the cleanest path is to wipe
-- and recreate rather than chain a dozen incremental alters.

-- ============================================================================
-- Wipe affected tables FIRST (before touching structure)
-- ============================================================================
-- entrance_passes has ON DELETE CASCADE to pass_guests in 0002, so truncating
-- the parent clears the children too.
truncate table public.pass_guests restart identity;
truncate table public.entrance_passes restart identity cascade;

-- ============================================================================
-- bookings: guest_count
-- ============================================================================
alter table public.bookings
  add column guest_count int not null default 1
    check (guest_count between 1 and 50);

-- ============================================================================
-- pass_guests → booking_guests
-- ============================================================================
-- Drop every policy on pass_guests first; they reference entrance_passes and
-- would break when we restructure the parent table below.
drop policy if exists "pass_guests_insert_owner" on public.pass_guests;
drop policy if exists "pass_guests_insert_admin" on public.pass_guests;
drop policy if exists "pass_guests_update_admin" on public.pass_guests;
drop policy if exists "pass_guests_delete_admin" on public.pass_guests;
drop policy if exists "pass_guests_select_owner" on public.pass_guests;
drop policy if exists "pass_guests_select_admin" on public.pass_guests;

-- Drop the FK that points at entrance_passes before we restructure that table.
alter table public.pass_guests drop constraint pass_guests_pass_id_fkey;

alter table public.pass_guests rename to booking_guests;
alter index pass_guests_pass_id_idx rename to booking_guests_booking_id_idx;
alter table public.booking_guests rename column pass_id to booking_id;

alter table public.booking_guests
  add constraint booking_guests_booking_id_fkey
    foreign key (booking_id) references public.bookings (id) on delete cascade;

-- Rename the 0013 unique-per-parent constraint.
alter table public.booking_guests
  rename constraint pass_guests_pass_guest_number_unique
    to booking_guests_booking_guest_number_unique;

-- New RLS: customers see + insert for their own booking; admins full access.
-- Mirrors the bookings_* split so customer-initiated guest inserts don't need
-- the service role.
create policy "booking_guests_select_owner"
  on public.booking_guests for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_guests.booking_id and b.user_id = auth.uid()
    )
  );

create policy "booking_guests_select_admin"
  on public.booking_guests for select
  to authenticated
  using (public.is_admin());

create policy "booking_guests_insert_owner"
  on public.booking_guests for insert
  to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_guests.booking_id and b.user_id = auth.uid()
    )
  );

create policy "booking_guests_insert_admin"
  on public.booking_guests for insert
  to authenticated
  with check (public.is_admin());

create policy "booking_guests_update_admin"
  on public.booking_guests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "booking_guests_delete_admin"
  on public.booking_guests for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- entrance_passes → walk_in_entries (restructured)
-- ============================================================================
drop policy if exists "entrance_passes_select_owner" on public.entrance_passes;
drop policy if exists "entrance_passes_select_admin" on public.entrance_passes;
drop policy if exists "entrance_passes_insert_owner" on public.entrance_passes;
drop policy if exists "entrance_passes_insert_admin" on public.entrance_passes;
drop policy if exists "entrance_passes_update_admin" on public.entrance_passes;
drop policy if exists "entrance_passes_delete_admin" on public.entrance_passes;

drop index if exists public.entrance_passes_user_id_idx;
drop index if exists public.entrance_passes_pass_date_idx;
drop index if exists public.entrance_passes_status_idx;

-- Drop named constraints we won't carry forward.
alter table public.entrance_passes
  drop constraint if exists entrance_passes_status_check,
  drop constraint if exists entrance_passes_user_or_walkin,
  drop constraint if exists entrance_passes_guest_count_max,
  drop constraint if exists entrance_passes_guest_count_check;

-- Drop columns that no longer belong on a walk-in entry log.
alter table public.entrance_passes
  drop column if exists user_id,
  drop column if exists status,
  drop column if exists payment_receipt_url,
  drop column if exists expires_at,
  drop column if exists admin_notes,
  drop column if exists updated_at;

-- pass_date → entry_date; add the new columns.
alter table public.entrance_passes rename column pass_date to entry_date;

alter table public.entrance_passes
  add column linked_booking_id uuid references public.bookings (id) on delete set null,
  add column notes text,
  add column created_by uuid references public.users (id);

-- created_by is not-null going forward. Safe to set now because we truncated
-- the table above.
alter table public.entrance_passes
  alter column created_by set not null;

alter table public.entrance_passes rename to walk_in_entries;

-- Re-add the guest_count bound under a name that matches the new table.
alter table public.walk_in_entries
  add constraint walk_in_entries_guest_count_check
    check (guest_count between 1 and 50);

create index walk_in_entries_entry_date_idx
  on public.walk_in_entries (entry_date);
create index walk_in_entries_linked_booking_id_idx
  on public.walk_in_entries (linked_booking_id);

-- Admin-only: internal log, customers never read or write it.
create policy "walk_in_entries_select_admin"
  on public.walk_in_entries for select
  to authenticated
  using (public.is_admin());

create policy "walk_in_entries_insert_admin"
  on public.walk_in_entries for insert
  to authenticated
  with check (public.is_admin());

create policy "walk_in_entries_update_admin"
  on public.walk_in_entries for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "walk_in_entries_delete_admin"
  on public.walk_in_entries for delete
  to authenticated
  using (public.is_admin());
