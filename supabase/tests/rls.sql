-- =============================================================================
-- RLS + policy regression tests for Court Management System
-- =============================================================================
--
-- How to run:
--   1. Open the Supabase SQL Editor for this project.
--   2. Run the "Setup" block ONCE as service_role (the default when you open
--      the editor). This seeds deterministic test rows.
--   3. For each TEST block, use the "Impersonate user" dropdown to switch to
--      the indicated UUID, then highlight the TEST block and run it.
--   4. Compare the output to the Expected comment in each block. "Denied"
--      means you should see zero rows returned or a row-level-security error.
--   5. Run the "Cleanup" block as service_role when done.
--
-- Running via psql locally also works if you set the JWT claim manually:
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--   ...query...
--   reset role;
--
-- The test IDs below are fixed UUIDs so the script is idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SETUP (run once as service_role)
-- -----------------------------------------------------------------------------

insert into public.users (id, email, name, role) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local', 'User A', 'customer'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@test.local', 'User B', 'customer'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local',  'Admin',  'admin')
  on conflict (id) do nothing;

insert into public.courts (id, name, hourly_rate, is_active) values
  ('c0000000-0000-0000-0000-000000000000', 'RLS Test Court', 100, true)
  on conflict (id) do nothing;

insert into public.bookings
  (id, user_id, court_id, booking_date, start_hour, end_hour, status, total_amount)
values
  ('b1111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000000',
   current_date + 10, 8, 10, 'pending', 200),
  ('b2222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   'c0000000-0000-0000-0000-000000000000',
   current_date + 11, 10, 12, 'pending', 200)
  on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- TEST 1 — Anon cannot read bookings
-- Impersonate: anon role
-- -----------------------------------------------------------------------------
select 'TEST 1 anon bookings read' as test,
       count(*) as rows_visible from public.bookings;
-- Expected: rows_visible = 0

-- -----------------------------------------------------------------------------
-- TEST 2 — User A sees only their own booking
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
select 'TEST 2 user A own bookings' as test, id, user_id
from public.bookings
where id in ('b1111111-1111-1111-1111-111111111111',
             'b2222222-2222-2222-2222-222222222222');
-- Expected: 1 row returned (b1111111...); b2222222 is hidden by RLS

-- -----------------------------------------------------------------------------
-- TEST 3 — User A cannot read User B's bookings
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
select 'TEST 3 user A reads user B' as test, count(*)
from public.bookings
where user_id = '22222222-2222-2222-2222-222222222222';
-- Expected: 0

-- -----------------------------------------------------------------------------
-- TEST 4 — User A cannot update User B's booking
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
update public.bookings set status = 'cancelled'
where id = 'b2222222-2222-2222-2222-222222222222';
-- Expected: UPDATE 0 (no rows match; policy hides them first)

-- -----------------------------------------------------------------------------
-- TEST 5 — User A CANNOT self-promote to admin
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    update public.users set role = 'admin'
    where id = '11111111-1111-1111-1111-111111111111';
    raise notice 'TEST 5 FAIL: role update succeeded without exception';
  exception when others then
    raise notice 'TEST 5 PASS: %', sqlerrm;
  end;
end $$;
-- Expected: NOTICE shows "TEST 5 PASS: only admins can change user role"

select 'TEST 5 final role' as test, role
from public.users
where id = '11111111-1111-1111-1111-111111111111';
-- Expected: role = 'customer'

-- -----------------------------------------------------------------------------
-- TEST 6 — Anon cannot insert a booking
-- Impersonate: anon role
-- -----------------------------------------------------------------------------
insert into public.bookings
  (user_id, court_id, booking_date, start_hour, end_hour, status, total_amount)
values
  (null, 'c0000000-0000-0000-0000-000000000000',
   current_date + 20, 8, 9, 'pending', 100);
-- Expected: ERROR new row violates row-level security policy

-- -----------------------------------------------------------------------------
-- TEST 7 — Admin reads all bookings + inserts a walk-in
-- Impersonate user: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- -----------------------------------------------------------------------------
select 'TEST 7 admin reads all' as test, count(*) from public.bookings;
-- Expected: >= 2 (User A's + User B's seed rows)

insert into public.bookings
  (court_id, booking_date, start_hour, end_hour, status, total_amount,
   walk_in_name, walk_in_phone)
values
  ('c0000000-0000-0000-0000-000000000000',
   current_date + 30, 9, 10, 'pending', 100,
   'RLS Walk-In', '555-0000');
-- Expected: INSERT 0 1 (admin can insert walk-in via bookings_insert_admin)

-- -----------------------------------------------------------------------------
-- TEST 8 — User A CANNOT see walk-in (user_id = null) bookings
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
select 'TEST 8 user A sees walk-ins' as test, count(*)
from public.bookings where user_id is null;
-- Expected: 0 (null != auth.uid() and non-admin has no admin policy hit)

-- -----------------------------------------------------------------------------
-- TEST 9 — Non-admin cannot insert blocked_slots or update courts
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
insert into public.blocked_slots
  (court_id, slot_date, start_hour, end_hour, reason, created_by)
values
  ('c0000000-0000-0000-0000-000000000000', current_date + 40, 8, 9,
   'attempted', '11111111-1111-1111-1111-111111111111');
-- Expected: ERROR new row violates row-level security policy

update public.courts set hourly_rate = 1
where id = 'c0000000-0000-0000-0000-000000000000';
-- Expected: UPDATE 0

-- -----------------------------------------------------------------------------
-- TEST 10 — rate_limits direct access is denied; RPC works
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
select 'TEST 10 direct rate_limits read' as test, count(*) from public.rate_limits;
-- Expected: 0 (RLS enabled, no policies)

select 'TEST 10 rpc call' as test,
       public.check_rate_limit('rls-test:user-a', 5, 60);
-- Expected: { "allowed": true, "retry_after_seconds": 0 }

-- -----------------------------------------------------------------------------
-- TEST 11 — Anon + authenticated CAN insert contact_inquiries (public form)
-- Impersonate: anon role
-- -----------------------------------------------------------------------------
insert into public.contact_inquiries (name, email, message)
values ('Anon Tester', 'anon@test.local', 'hello');
-- Expected: INSERT 0 1

-- -----------------------------------------------------------------------------
-- TEST 12 — Non-admin cannot read contact_inquiries
-- Impersonate user: 11111111-1111-1111-1111-111111111111
-- -----------------------------------------------------------------------------
select 'TEST 12 user A reads inquiries' as test, count(*)
from public.contact_inquiries;
-- Expected: 0

-- =============================================================================
-- CLEANUP (run as service_role)
-- =============================================================================
-- delete from public.bookings
--   where user_id in (
--     '11111111-1111-1111-1111-111111111111',
--     '22222222-2222-2222-2222-222222222222'
--   )
--   or walk_in_name = 'RLS Walk-In';
-- delete from public.contact_inquiries where email = 'anon@test.local';
-- delete from public.rate_limits where key like 'rls-test:%';
-- delete from public.courts where id = 'c0000000-0000-0000-0000-000000000000';
-- delete from public.users where id in (
--   '11111111-1111-1111-1111-111111111111',
--   '22222222-2222-2222-2222-222222222222',
--   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
-- );
