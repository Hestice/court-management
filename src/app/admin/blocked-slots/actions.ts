"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/actions";
import { listOverlappingBlocks } from "@/lib/data/blocked-slots";
import { listOverlappingBookings } from "@/lib/data/bookings";
import { getCourt } from "@/lib/data/courts";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { logError } from "@/lib/logger";
import {
  formatHour,
  formatHourRange as formatRange,
  todayInFacility,
} from "@/lib/timezone";
import { addDaysIso, BLOCK_DATE_MAX_DAYS } from "@/lib/zod-helpers";
import { createBlockSchema, type CreateBlockValues } from "./schema";

export type ActionResult = { success: true } | { success: false; error: string };

export async function createBlockedSlot(
  values: CreateBlockValues,
): Promise<ActionResult> {
  const parsed = createBlockSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { court_id, slot_date, start_hour, end_hour, reason } = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  // Validate court is active.
  const court = await getCourt(court_id);
  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) {
    return { success: false, error: "Court is not active." };
  }

  // Validate date is today or future (facility local date) and within the
  // allowed future window. 365 days is well beyond any legitimate block.
  const today = todayInFacility();
  if (slot_date < today) {
    return { success: false, error: "Date must be today or later." };
  }
  if (slot_date > addDaysIso(today, BLOCK_DATE_MAX_DAYS)) {
    return {
      success: false,
      error: `Date must be within ${BLOCK_DATE_MAX_DAYS} days.`,
    };
  }

  // Validate hours fall inside operating hours.
  const settings = await getFacilitySettings();
  const opStart = settings.operating_hours_start;
  const opEnd = settings.operating_hours_end;
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

  // Check overlap with bookings (pending/confirmed only) on same court+date.
  const conflictingBookings = await listOverlappingBookings({
    courtId: court_id,
    date: slot_date,
    startHour: start_hour,
    endHour: end_hour,
  });
  if (conflictingBookings.length > 0) {
    const ranges = conflictingBookings
      .map((b) => formatRange(b.start_hour, b.end_hour))
      .join(", ");
    return {
      success: false,
      error: `Conflicts with existing booking${conflictingBookings.length === 1 ? "" : "s"} at ${ranges}.`,
    };
  }

  // Check overlap with existing blocked slots on same court+date.
  const conflictingBlocks = await listOverlappingBlocks({
    courtId: court_id,
    date: slot_date,
    startHour: start_hour,
    endHour: end_hour,
  });
  if (conflictingBlocks.length > 0) {
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
    created_by: userId,
  });
  if (insertError) {
    logError("blocked_slot.insert_failed", insertError, { court_id, slot_date });
    return { success: false, error: "Couldn't create blocked slot." };
  }

  revalidatePath("/admin/blocked-slots");
  revalidatePath("/booking");
  revalidatePath("/admin/schedule");
  return { success: true };
}

export async function deleteBlockedSlot(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase.from("blocked_slots").delete().eq("id", id);
  if (error) {
    logError("blocked_slot.delete_failed", error, { id });
    return { success: false, error: "Couldn't delete blocked slot." };
  }

  revalidatePath("/admin/blocked-slots");
  revalidatePath("/booking");
  revalidatePath("/admin/schedule");
  return { success: true };
}

export type BulkDeleteResult = { deletedCount: number; failedCount: number };

export async function deleteBlockedSlots(
  ids: string[],
): Promise<BulkDeleteResult> {
  if (ids.length === 0) return { deletedCount: 0, failedCount: 0 };

  const auth = await requireAdmin();
  if (!auth.ok) return { deletedCount: 0, failedCount: ids.length };
  const { supabase } = auth;

  const { error, count } = await supabase
    .from("blocked_slots")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) {
    logError("blocked_slot.bulk_delete_failed", error, { count: ids.length });
    return { deletedCount: 0, failedCount: ids.length };
  }

  revalidatePath("/admin/blocked-slots");
  revalidatePath("/booking");
  revalidatePath("/admin/schedule");
  const deletedCount = count ?? ids.length;
  return { deletedCount, failedCount: Math.max(0, ids.length - deletedCount) };
}
