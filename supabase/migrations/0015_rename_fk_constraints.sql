-- Postgres doesn't rename foreign-key constraint names when a table is
-- renamed. The renames in 0014 left three FKs with stale names; rename them
-- so PostgREST's embedding syntax (`rel:target!fk_name(...)`) matches the
-- current table names and future readers aren't confused.

alter table public.booking_guests
  rename constraint pass_guests_redeemed_by_fkey
    to booking_guests_redeemed_by_fkey;

alter table public.walk_in_entries
  rename constraint entrance_passes_created_by_fkey
    to walk_in_entries_created_by_fkey;

alter table public.walk_in_entries
  rename constraint entrance_passes_linked_booking_id_fkey
    to walk_in_entries_linked_booking_id_fkey;
