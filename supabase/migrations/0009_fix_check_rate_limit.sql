-- Fix for 0007_rate_limits.sql: the RETURNING clause referenced the original
-- table name (`rate_limits.count`) while the INSERT declared an alias (`rl`).
-- Postgres rejects this with:
--   42P01 invalid reference to FROM-clause entry for table "rate_limits"
--   HINT: Perhaps you meant to reference the table alias "rl".
-- Replace the function body with the alias-consistent version. No schema
-- change — just a redefinition via CREATE OR REPLACE.

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
  returning rl.count, rl.window_start
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
