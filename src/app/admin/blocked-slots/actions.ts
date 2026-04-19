"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createBlockSchema, type CreateBlockValues } from "./schema";

export type ActionResult = { success: boolean; error?: string };

// e.g. 14 → "2pm", 0 → "12am", 12 → "12pm", 24 → "12am"
function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized < 12 ? "am" : "pm";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display}${suffix}`;
}

function formatRange(start: number, end: number): string {
  return `${formatHour(start)}–${formatHour(end)}`;
}

export async function createBlockedSlot(
  values: CreateBlockValues,
): Promise<ActionResult> {
  const parsed = createBlockSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { court_id, slot_date, start_hour, end_hour, reason } = parsed.data;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  // Validate court is active.
  const { data: court, error: courtError } = await supabase
    .from("courts")
    .select("id, is_active")
    .eq("id", court_id)
    .maybeSingle();
  if (courtError) return { success: false, error: courtError.message };
  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) {
    return { success: false, error: "Court is not active." };
  }

  // Validate date is today or future (facility local date).
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = `${todayParts.find((p) => p.type === "year")!.value}-${
    todayParts.find((p) => p.type === "month")!.value
  }-${todayParts.find((p) => p.type === "day")!.value}`;
  if (slot_date < today) {
    return { success: false, error: "Date must be today or later." };
  }

  // Validate hours fall inside operating hours.
  const { data: settings, error: settingsError } = await supabase
    .from("facility_settings")
    .select("operating_hours_start, operating_hours_end")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError) return { success: false, error: settingsError.message };
  const opStart = settings?.operating_hours_start ?? 8;
  const opEnd = settings?.operating_hours_end ?? 22;
  if (start_hour < opStart || start_hour >= opEnd) {
    return {
      success: false,
      error: `Start hour must be within operating hours (${formatHour(opStart)}–${formatHour(opEnd)}).`,
    };
  }
  if (end_hour <= opStart || end_hour > opEnd) {
    return {
      success: false,
      error: `End hour must be within operating hours (${formatHour(opStart)}–${formatHour(opEnd)}).`,
    };
  }

  // Check overlap with bookings (pending/confirmed only). We filter by
  // start_hour < end and end_hour > start to catch any overlap on same court+date.
  const { data: conflictingBookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, start_hour, end_hour, status, walk_in_name")
    .eq("court_id", court_id)
    .eq("booking_date", slot_date)
    .in("status", ["pending", "confirmed"])
    .lt("start_hour", end_hour)
    .gt("end_hour", start_hour);
  if (bookingsError) return { success: false, error: bookingsError.message };
  if (conflictingBookings && conflictingBookings.length > 0) {
    const ranges = conflictingBookings
      .map((b) => formatRange(b.start_hour, b.end_hour))
      .join(", ");
    return {
      success: false,
      error: `Conflicts with existing booking${conflictingBookings.length === 1 ? "" : "s"} at ${ranges}.`,
    };
  }

  // Check overlap with existing blocked slots on same court+date.
  const { data: conflictingBlocks, error: blocksError } = await supabase
    .from("blocked_slots")
    .select("id, start_hour, end_hour")
    .eq("court_id", court_id)
    .eq("slot_date", slot_date)
    .lt("start_hour", end_hour)
    .gt("end_hour", start_hour);
  if (blocksError) return { success: false, error: blocksError.message };
  if (conflictingBlocks && conflictingBlocks.length > 0) {
    const ranges = conflictingBlocks
      .map((b) => formatRange(b.start_hour, b.end_hour))
      .join(", ");
    return {
      success: false,
      error: `Overlaps with existing block${conflictingBlocks.length === 1 ? "" : "s"} at ${ranges}.`,
    };
  }

  const { error: insertError } = await supabase.from("blocked_slots").insert({
    court_id,
    slot_date,
    start_hour,
    end_hour,
    reason: reason?.trim() ? reason.trim() : null,
    created_by: user.id,
  });
  if (insertError) return { success: false, error: insertError.message };

  revalidatePath("/admin/blocked-slots");
  return { success: true };
}

export async function deleteBlockedSlot(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("blocked_slots").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/blocked-slots");
  return { success: true };
}

export type BulkDeleteResult = { deletedCount: number; failedCount: number };

export async function deleteBlockedSlots(
  ids: string[],
): Promise<BulkDeleteResult> {
  if (ids.length === 0) return { deletedCount: 0, failedCount: 0 };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("blocked_slots")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) {
    return { deletedCount: 0, failedCount: ids.length };
  }

  revalidatePath("/admin/blocked-slots");
  const deletedCount = count ?? ids.length;
  return { deletedCount, failedCount: Math.max(0, ids.length - deletedCount) };
}
