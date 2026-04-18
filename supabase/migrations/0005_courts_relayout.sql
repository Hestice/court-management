-- Re-lay all existing courts into the new 3×5-stride floor-plan grid
-- (2-cell wide × 4-cell tall court + 1 cell gap). Earlier auto-placement
-- stepped 1×1 so adjacent courts overlapped on /admin/floor-plan. We sort by
-- "Court N" numeric suffix (natural order) and fall back to alphabetical name
-- for any renamed courts.

with ordered as (
  select
    id,
    row_number() over (
      order by
        substring(name from '^Court\s+(\d+)$')::int nulls last,
        name
    ) - 1 as idx
  from public.courts
)
update public.courts as c
set
  position_x = ((o.idx % 10) * 3)::int,
  position_y = ((o.idx / 10) * 5)::int
from ordered as o
where c.id = o.id;
