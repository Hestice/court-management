-- public.users mirrors auth.users and stores role + display name.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-create a public.users row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    'customer'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the caller an admin? Runs as definer to avoid recursive RLS
-- evaluation when a policy on public.users needs to look up the caller's role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.users enable row level security;

create policy "users_select_self"
  on public.users for select
  to authenticated
  using (id = auth.uid());

create policy "users_select_admin"
  on public.users for select
  to authenticated
  using (public.is_admin());

-- Self-updates are allowed, but the role column is locked down at the column
-- level below so customers can't promote themselves.
create policy "users_update_self"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users_update_admin"
  on public.users for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Column-level lock: only admins can write to the role column.
revoke update (role) on public.users from authenticated;
grant update (role) on public.users to authenticated;

create or replace function public.prevent_role_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only admins can change user role';
  end if;
  return new;
end;
$$;

create trigger users_prevent_role_self_update
  before update on public.users
  for each row execute function public.prevent_role_self_update();
