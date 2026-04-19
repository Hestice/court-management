"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  facilitySettingsSchema,
  type FacilitySettingsValues,
} from "./schema";

export type ActionResult = { success: boolean; error?: string };

export async function updateFacilitySettings(
  values: FacilitySettingsValues,
): Promise<ActionResult> {
  const parsed = facilitySettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings");
  return { success: true };
}
