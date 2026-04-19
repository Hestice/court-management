-- Entrance pass feature: extend the schema introduced in 0002 so that passes
-- support the same flows as bookings (walk-ins, pending expiry, admin cancel/
-- reject, admin notes) plus per-guest redemption tracking.
--
-- Shape mirrors bookings deliberately: same status vocabulary (with 'cancelled'
-- added for explicit admin reject/cancel), same walk-in exclusivity constraint,
-- same facility_settings price knob pattern.

-- ============================================================================
-- facility_settings: per-guest entrance pass price
-- ============================================================================

alter table public.facility_settings
  add column entrance_pass_price_per_guest numeric not null default 100
    check (entrance_pass_price_per_guest >= 0);

update public.facility_settings
set entrance_pass_price_per_guest = 100
where id = 1;

-- ============================================================================
-- entrance_passes: walk-in support, expiry, admin notes, 'cancelled' status
-- ============================================================================

-- Allow admin-created walk-in passes (no user_id).
alter table public.entrance_passes alter column user_id drop not null;

-- Drop the old CHECK that locked status to (pending, confirmed, expired) so we
-- can widen it to include 'cancelled' — the state admin reject/cancel land on.
alter table public.entrance_passes drop constraint if exists entrance_passes_status_check;
alter table public.entrance_passes
  add constraint entrance_passes_status_check
    check (status in ('pending', 'confirmed', 'cancelled', 'expired'));

alter table public.entrance_passes add column walk_in_name text;
alter table public.entrance_passes add column walk_in_phone text;
alter table public.entrance_passes add column expires_at timestamptz;
alter table public.entrance_passes add column admin_notes text;

-- Upper-bound guest_count to match the UI / zod validator (GUEST_COUNT_MAX=50).
-- Lower bound (>=1) was already enforced in 0002.
alter table public.entrance_passes
  add constraint entrance_passes_guest_count_max check (guest_count <= 50);

-- Exactly one of (user_id, walk_in_name) must be populated — same invariant as
-- bookings_user_or_walkin. user_id => customer self-purchase; walk_in_name =>
-- admin-created walk-in paid in person, status='confirmed' immediately.
alter table public.entrance_passes
  add constraint entrance_passes_user_or_walkin check (
    (user_id is not null and walk_in_name is null)
    or (user_id is null and walk_in_name is not null)
  );

create index entrance_passes_pass_date_idx
  on public.entrance_passes (pass_date);
create index entrance_passes_status_idx
  on public.entrance_passes (status);

-- Admin inserts (walk-ins where user_id is null) need an explicit policy; the
-- existing entrance_passes_insert_owner requires user_id = auth.uid().
create policy "entrance_passes_insert_admin"
  on public.entrance_passes for insert
  to authenticated
  with check (public.is_admin());

-- ============================================================================
-- pass_guests: stable per-pass numbering + let owners insert their own rows
-- ============================================================================
--
-- guest_number gives the UI a stable "Guest 1 of N" label without relying on
-- uuid ordering. Assigned at insert by the creating action (1..guest_count).
-- The unique constraint on (pass_id, guest_number) prevents duplicates from a
-- buggy client or replay.
alter table public.pass_guests
  add column guest_number int not null default 1
    check (guest_number between 1 and 50);

alter table public.pass_guests
  add constraint pass_guests_pass_guest_number_unique
    unique (pass_id, guest_number);

-- 0002 only gave admins INSERT/UPDATE on pass_guests, which would force every
-- customer-initiated pass to round-trip through the service role. Customers
-- should be able to insert guest rows for a pass they own (same principle as
-- bookings_insert_owner). Admin INSERT policy from 0002 already covers walk-
-- ins; admin UPDATE from 0002 covers manual "mark redeemed" actions.
create policy "pass_guests_insert_owner"
  on public.pass_guests for insert
  to authenticated
  with check (
    exists (
      select 1 from public.entrance_passes p
      where p.id = pass_guests.pass_id
        and p.user_id = auth.uid()
    )
  );
