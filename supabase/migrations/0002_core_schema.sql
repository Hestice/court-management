-- Core domain tables for the Court Management System MVP.
-- Depends on migration 0001 for public.users and public.is_admin().

-- ============================================================================
-- courts
-- ============================================================================
create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'maintenance')),
  hourly_rate numeric not null,
  created_at timestamptz not null default now()
);

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

-- ============================================================================
-- bookings
-- ============================================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  court_id uuid not null references public.courts (id),
  booking_date date not null,
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour between 1 and 24),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  total_amount numeric not null,
  payment_receipt_url text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_hour_range check (end_hour > start_hour)
);

create index bookings_user_id_idx on public.bookings (user_id);
create index bookings_court_date_idx on public.bookings (court_id, booking_date);

alter table public.bookings enable row level security;

create policy "bookings_select_owner"
  on public.bookings for select
  to authenticated
  using (user_id = auth.uid());

create policy "bookings_select_admin"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

create policy "bookings_insert_owner"
  on public.bookings for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "bookings_update_admin"
  on public.bookings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "bookings_delete_admin"
  on public.bookings for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- blocked_slots
-- ============================================================================
create table public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts (id),
  slot_date date not null,
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour between 1 and 24),
  reason text,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  constraint blocked_slots_hour_range check (end_hour > start_hour)
);

create index blocked_slots_court_date_idx on public.blocked_slots (court_id, slot_date);

alter table public.blocked_slots enable row level security;

create policy "blocked_slots_select_authenticated"
  on public.blocked_slots for select
  to authenticated
  using (true);

create policy "blocked_slots_insert_admin"
  on public.blocked_slots for insert
  to authenticated
  with check (public.is_admin());

create policy "blocked_slots_update_admin"
  on public.blocked_slots for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "blocked_slots_delete_admin"
  on public.blocked_slots for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- entrance_passes
-- ============================================================================
create table public.entrance_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  pass_date date not null,
  guest_count int not null check (guest_count >= 1),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired')),
  total_amount numeric not null,
  payment_receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entrance_passes_user_id_idx on public.entrance_passes (user_id);

alter table public.entrance_passes enable row level security;

create policy "entrance_passes_select_owner"
  on public.entrance_passes for select
  to authenticated
  using (user_id = auth.uid());

create policy "entrance_passes_select_admin"
  on public.entrance_passes for select
  to authenticated
  using (public.is_admin());

create policy "entrance_passes_insert_owner"
  on public.entrance_passes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "entrance_passes_update_admin"
  on public.entrance_passes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "entrance_passes_delete_admin"
  on public.entrance_passes for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- pass_guests
-- ============================================================================
create table public.pass_guests (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.entrance_passes (id) on delete cascade,
  qr_code text not null unique,
  redeemed_at timestamptz,
  redeemed_by uuid references public.users (id)
);

create index pass_guests_pass_id_idx on public.pass_guests (pass_id);

alter table public.pass_guests enable row level security;

create policy "pass_guests_select_owner"
  on public.pass_guests for select
  to authenticated
  using (
    exists (
      select 1 from public.entrance_passes p
      where p.id = pass_guests.pass_id and p.user_id = auth.uid()
    )
  );

create policy "pass_guests_select_admin"
  on public.pass_guests for select
  to authenticated
  using (public.is_admin());

create policy "pass_guests_insert_admin"
  on public.pass_guests for insert
  to authenticated
  with check (public.is_admin());

create policy "pass_guests_update_admin"
  on public.pass_guests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "pass_guests_delete_admin"
  on public.pass_guests for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- payment_methods
-- ============================================================================
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  qr_image_url text,
  account_details text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

create policy "payment_methods_select_active"
  on public.payment_methods for select
  to authenticated
  using (is_active = true);

create policy "payment_methods_select_admin"
  on public.payment_methods for select
  to authenticated
  using (public.is_admin());

create policy "payment_methods_insert_admin"
  on public.payment_methods for insert
  to authenticated
  with check (public.is_admin());

create policy "payment_methods_update_admin"
  on public.payment_methods for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "payment_methods_delete_admin"
  on public.payment_methods for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- contact_inquiries
-- ============================================================================
create table public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.contact_inquiries enable row level security;

-- Anyone (including anonymous visitors) can submit an inquiry via the contact form.
create policy "contact_inquiries_insert_anyone"
  on public.contact_inquiries for insert
  to anon, authenticated
  with check (true);

create policy "contact_inquiries_select_admin"
  on public.contact_inquiries for select
  to authenticated
  using (public.is_admin());

create policy "contact_inquiries_update_admin"
  on public.contact_inquiries for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- facility_settings (singleton)
-- ============================================================================
create table public.facility_settings (
  id int primary key default 1 check (id = 1),
  facility_name text not null default 'Court Management',
  operating_hours_start int not null default 8 check (operating_hours_start between 0 and 23),
  operating_hours_end int not null default 22 check (operating_hours_end between 1 and 24),
  contact_email text,
  contact_phone text,
  updated_at timestamptz not null default now(),
  constraint facility_settings_hour_range check (operating_hours_end > operating_hours_start)
);

insert into public.facility_settings (id) values (1);

alter table public.facility_settings enable row level security;

create policy "facility_settings_select_authenticated"
  on public.facility_settings for select
  to authenticated
  using (true);

create policy "facility_settings_update_admin"
  on public.facility_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
