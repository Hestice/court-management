"use server";

import { revalidatePath, updateTag } from "next/cache";

import { requireAdmin } from "@/lib/actions";
import { FACILITY_SETTINGS_TAG } from "@/lib/data/facility-settings";
import { logError } from "@/lib/logger";
import {
  facilitySettingsSchema,
  type FacilitySettingsValues,
} from "./schema";

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateFacilitySettings(
  values: FacilitySettingsValues,
): Promise<ActionResult> {
  const parsed = facilitySettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("facility_settings")
    .update({
      facility_name: parsed.data.facility_name,
      operating_hours_start: parsed.data.operating_hours_start,
      operating_hours_end: parsed.data.operating_hours_end,
      contact_email: parsed.data.contact_email?.trim() || null,
      contact_phone: parsed.data.contact_phone?.trim() || null,
      pending_expiry_hours: parsed.data.pending_expiry_hours,
      max_booking_duration_hours: parsed.data.max_booking_duration_hours,
      entrance_pass_price_per_guest: parsed.data.entrance_pass_price_per_guest,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    logError("facility_settings.update_failed", error);
    return { success: false, error: "Couldn't save settings." };
  }

  // Settings feed every page that renders operating hours / max duration —
  // updateTag immediately expires the unstable_cache layer (read-your-own-
  // writes: admin sees their change on next load), and revalidatePath drops
  // the admin form's cached render.
  updateTag(FACILITY_SETTINGS_TAG);
  revalidatePath("/admin/settings");
  return { success: true };
}
