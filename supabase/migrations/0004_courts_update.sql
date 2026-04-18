-- Rework public.courts for the floor-plan editor: drop is_active legacy status column,
-- add position_x/position_y grid coordinates, tighten hourly_rate check. No production
-- data exists so we can drop and recreate. Temporarily drop FKs from bookings and
-- blocked_slots, then restore them after recreation.

alter table public.bookings drop constraint bookings_court_id_fkey;
alter table public.blocked_slots drop constraint blocked_slots_court_id_fkey;

drop table public.courts;

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_rate numeric not null check (hourly_rate >= 0),
  is_active boolean not null default true,
  position_x int,
  position_y int,
  created_at timestamptz not null default now()
);

alter table public.bookings
  add constraint bookings_court_id_fkey
  foreign key (court_id) references public.courts (id);

alter table public.blocked_slots
  add constraint blocked_slots_court_id_fkey
  foreign key (court_id) references public.courts (id);

alter table public.courts enable row level security;

create policy "courts_select_authenticated"
  on public.courts for select
  to authenticated
  using (true);

create policy "courts_insert_admin"
  on public.courts for insert
  to authenticated
  with check (public.is_admin());

create policy "courts_update_admin"
  on public.courts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "courts_delete_admin"
  on public.courts for delete
  to authenticated
  using (public.is_admin());
