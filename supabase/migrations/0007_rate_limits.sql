-- Rate limiting primitive backed by a single table + atomic RPC.
--
-- Design:
--   - One row per (bucket) key. Identifier "key" is the entire bucket name
--     chosen by callers, e.g. "login:203.0.113.5" or "booking:user-abc".
--   - Each check upserts the key, advancing window_start whenever the prior
--     window has elapsed.
--   - The RPC is SECURITY DEFINER so application code (anon + authenticated)
--     can invoke it without direct table grants. RLS on the table is enabled
--     with no policies, so direct reads/writes are denied.
--
-- Trade-off (documented in /docs): this is a database-backed limiter — not
-- as fast as Redis, and slow clients can create contention under heavy
-- write traffic. Swap the function body in src/lib/rate-limit.ts when
-- traffic warrants.

create table public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies: direct access is denied; RPC with SECURITY DEFINER is the
-- only legitimate reader/writer.

create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_window_start timestamptz;
  v_now timestamptz := now();
  v_window_duration interval := make_interval(secs => p_window_seconds);
  v_retry_after int;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
    set
      count = case
        when rl.window_start < v_now - v_window_duration then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < v_now - v_window_duration then v_now
        else rl.window_start
      end
  returning rate_limits.count, rate_limits.window_start
  into v_count, v_window_start;

  if v_count > p_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_start + v_window_duration - v_now)))::int
    );
    return json_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after
    );
  end if;

  return json_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

grant execute on function public.check_rate_limit(text, int, int)
  to anon, authenticated;

-- Opportunistic cleanup: callers that detect a very old window may
-- occasionally trigger a sweep via this function. Not scheduled — low
-- traffic on free tier makes accumulation irrelevant.
create or replace function public.sweep_rate_limits(older_than_seconds int)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits
  where window_start < now() - make_interval(secs => older_than_seconds);
$$;

grant execute on function public.sweep_rate_limits(int)
  to anon, authenticated;
