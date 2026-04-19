import "server-only";

import { createClient as createAnonClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { throwDataError } from "./_shared";

// Tag used by unstable_cache. Exported so the settings update action can call
// revalidateTag(FACILITY_SETTINGS_TAG) after a successful mutation.
export const FACILITY_SETTINGS_TAG = "facility-settings";

export type FacilitySettings = {
  facility_name: string;
  operating_hours_start: number;
  operating_hours_end: number;
  contact_email: string | null;
  contact_phone: string | null;
  pending_expiry_hours: number;
  max_booking_duration_hours: number;
};

// Defaults mirrored from the DB column defaults so a fresh install (or a
// transient read error surfaced as null) still produces a usable shape.
const DEFAULTS: FacilitySettings = {
  facility_name: "Court Management",
  operating_hours_start: 8,
  operating_hours_end: 22,
  contact_email: null,
  contact_phone: null,
  pending_expiry_hours: 24,
  max_booking_duration_hours: 5,
};

// Read the settings row through a bare anon client. The server client isn't
// usable here because unstable_cache disallows cookies() inside its callback;
// the settings row has a public RLS policy so a cookie-less anon read returns
// the same data to every caller, which is exactly what we want to cache.
async function fetchFacilitySettings(): Promise<FacilitySettings> {
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase
    .from("facility_settings")
    .select(
      "facility_name, operating_hours_start, operating_hours_end, contact_email, contact_phone, pending_expiry_hours, max_booking_duration_hours",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throwDataError("data.facility_settings.get", error);
  if (!data) return DEFAULTS;
  return {
    facility_name: data.facility_name ?? DEFAULTS.facility_name,
    operating_hours_start:
      data.operating_hours_start ?? DEFAULTS.operating_hours_start,
    operating_hours_end:
      data.operating_hours_end ?? DEFAULTS.operating_hours_end,
    contact_email: data.contact_email ?? null,
    contact_phone: data.contact_phone ?? null,
    pending_expiry_hours:
      data.pending_expiry_hours ?? DEFAULTS.pending_expiry_hours,
    max_booking_duration_hours:
      data.max_booking_duration_hours ?? DEFAULTS.max_booking_duration_hours,
  };
}

// Cross-request cache. Invalidated by revalidateTag(FACILITY_SETTINGS_TAG) in
// updateFacilitySettings. Time-based revalidation set generously — the tag is
// the real invalidation mechanism.
const cachedFetch = unstable_cache(fetchFacilitySettings, ["facility-settings-v1"], {
  tags: [FACILITY_SETTINGS_TAG],
  revalidate: 3600,
});

// There is always exactly one row (id=1, guarded by a check constraint). The
// function returns a fully-populated object so callers never have to re-apply
// defaults. React.cache() dedupes within a single render; unstable_cache
// dedupes across renders/requests.
export const getFacilitySettings = cache(
  async (): Promise<FacilitySettings> => cachedFetch(),
);
