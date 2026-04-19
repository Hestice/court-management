import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

export type Court = {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
};

export type CourtSummary = Pick<
  Court,
  "id" | "name" | "hourly_rate" | "is_active"
>;

export type CourtOption = Pick<Court, "id" | "name">;

function byNameNumeric<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

// Every court regardless of status, ordered by name numerically (so "Court 10"
// sorts after "Court 9"). Used by the admin courts and floor-plan pages.
export const listCourts = cache(async (): Promise<Court[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select(
      "id, name, hourly_rate, is_active, position_x, position_y, created_at",
    );
  if (error) throwDataError("data.courts.list", error);
  return (data ?? []).slice().sort(byNameNumeric);
});

// Active courts only, name-sorted. The canonical shape consumed by customer
// availability grids, the admin reschedule picker, and blocked-slots setup.
export const listActiveCourts = cache(async (): Promise<CourtSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select("id, name, hourly_rate, is_active")
    .eq("is_active", true);
  if (error) throwDataError("data.courts.list_active", error);
  return (data ?? []).slice().sort(byNameNumeric);
});

// Active court options — thin shape for filters/dropdowns.
export const listActiveCourtOptions = cache(
  async (): Promise<CourtOption[]> => {
    const rows = await listActiveCourts();
    return rows.map((c) => ({ id: c.id, name: c.name }));
  },
);

// All court options (active + inactive). Used by admin filters where the
// historical bookings list may reference a since-deactivated court.
export const listAllCourtOptions = cache(async (): Promise<CourtOption[]> => {
  const rows = await listCourts();
  return rows.map((c) => ({ id: c.id, name: c.name }));
});

export const getCourt = cache(async (id: string): Promise<Court | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select(
      "id, name, hourly_rate, is_active, position_x, position_y, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.courts.get", error, { id });
  return data ?? null;
});

// Most-recently-created court's hourly rate — used by the "create N courts"
// form to prefill a sensible default. Returns 0 when the table is empty.
export const getLatestCourtHourlyRate = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select("hourly_rate")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwDataError("data.courts.latest_hourly_rate", error);
  return data?.hourly_rate ?? 0;
});

// Names-by-id map for bulk ops (e.g. "Court 3 couldn't be deleted").
export async function mapCourtNames(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select("id, name")
    .in("id", ids);
  if (error) throwDataError("data.courts.map_names", error, { count: ids.length });
  return new Map((data ?? []).map((r) => [r.id, r.name]));
}

// Layout-time snapshot consumed by the auto-placement algorithm. Intentionally
// not memoized — callers pair it with a write and want the freshest view.
export async function listCourtPositions(): Promise<
  Array<{ name: string; position_x: number | null; position_y: number | null }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select("name, position_x, position_y");
  if (error) throwDataError("data.courts.list_positions", error);
  return data ?? [];
}
