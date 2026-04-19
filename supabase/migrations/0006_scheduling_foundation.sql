-- Scheduling foundation: drop time_slots, enable btree_gist for range-based
-- exclusion constraints, extend bookings to support walk-ins + expiry and
-- prevent overlaps at the DB level, and extend facility_settings with
-- pending-expiry and max-duration knobs.
--
-- public.time_slots was never created in prior migrations; the IF EXISTS keeps
-- the DROP idempotent and satisfies the design intent ("no materialized slots
-- table, availability is derived").

drop table if exists public.time_slots;

create extension if not exists btree_gist;

-- ============================================================================
-- bookings: walk-in support, expiry, overlap prevention
-- ============================================================================

alter table public.bookings alter column user_id drop not null;

alter table public.bookings add column walk_in_name text;
alter table public.bookings add column walk_in_phone text;
alter table public.bookings add column expires_at timestamptz;

-- Exactly one of (user_id, walk_in_name) must be populated. user_id => customer
-- self-booking; walk_in_name => admin-created walk-in with no account.
alter table public.bookings
  add constraint bookings_user_or_walkin check (
    (user_id is not null and walk_in_name is null)
    or (user_id is null and walk_in_name is not null)
  );

-- DB-level guard against double-booking. Only pending/confirmed block each
-- other — cancelled/completed are excluded from the index predicate so
-- historical rows don't block new bookings on the same court/date/range.
alter table public.bookings
  add constraint bookings_no_overlap exclude using gist (
    court_id with =,
    booking_date with =,
    int4range(start_hour, end_hour) with &&
  ) where (status in ('pending', 'confirmed'));

-- ============================================================================
-- bookings RLS: allow admin inserts (e.g. walk-ins with user_id = null)
-- ============================================================================

create policy "bookings_insert_admin"
  on public.bookings for insert
  to authenticated
  with check (public.is_admin());

-- ============================================================================
-- facility_settings: pending expiry + max booking duration
-- ============================================================================

alter table public.facility_settings
  add column pending_expiry_hours int not null default 24
    check (pending_expiry_hours > 0);

alter table public.facility_settings
  add column max_booking_duration_hours int not null default 5
    check (max_booking_duration_hours between 1 and 24);

update public.facility_settings
set pending_expiry_hours = 24,
    max_booking_duration_hours = 5
where id = 1;
