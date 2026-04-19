-- Minimal audit log for security-relevant events. Kept intentionally narrow:
-- auth, role changes, and rate-limit hits. Booking/court lifecycle events are
-- excluded for MVP — they'd flood the table with no incremental security
-- value.

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  metadata jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs (actor_user_id);
create index audit_logs_action_idx on public.audit_logs (action);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

-- Admin SELECT only. No INSERT/UPDATE/DELETE policies: direct writes from
-- authenticated/anon are denied; the SECURITY DEFINER RPC below is the only
-- legitimate writer.
create policy "audit_logs_select_admin"
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());

-- Writer function. SECURITY DEFINER so callers with no table grants can
-- still append; search_path is pinned to avoid hijack via injected schemas.
create or replace function public.log_audit_event(
  p_action text,
  p_actor_user_id uuid default null,
  p_metadata jsonb default null,
  p_ip_address text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (actor_user_id, action, metadata, ip_address)
  values (p_actor_user_id, p_action, p_metadata, p_ip_address);
$$;

grant execute on function public.log_audit_event(text, uuid, jsonb, text)
  to anon, authenticated;
