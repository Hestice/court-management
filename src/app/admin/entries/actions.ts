"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, type SimpleActionResult } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import {
  getWalkInEntryForDelete,
  getWalkInEntryForNotes,
} from "@/lib/data/walk-in-entries";
import { logError } from "@/lib/logger";
import { todayInFacility } from "@/lib/timezone";
import { addDaysIso, BLOCK_DATE_MAX_DAYS } from "@/lib/zod-helpers";

import {
  entryNotesSchema,
  walkInEntrySchema,
  type EntryNotesValues,
  type WalkInEntryValues,
} from "./schema";

type ActionOk = { success: true };
type ActionErr = { success: false; error: string };
export type ActionResult = ActionOk | ActionErr;

export type CreateEntryResult =
  | { success: true; entryId: string }
  | { success: false; error: string };

function revalidateEntryRoutes(entryId?: string) {
  revalidatePath("/admin/entries");
  if (entryId) revalidatePath(`/admin/entries/${entryId}`);
}

// ============================================================================
// CREATE WALK-IN ENTRY
// ============================================================================
export async function createWalkInEntry(
  values: WalkInEntryValues,
): Promise<CreateEntryResult> {
  const parsed = walkInEntrySchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const {
    entry_date,
    guest_count,
    walk_in_name,
    walk_in_phone,
    linked_booking_id,
    notes,
  } = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  // Allow back-logging within a modest window; future dates also allowed up
  // to the same cap used by blocked slots so admins can log advance entries
  // (e.g. event pre-payment) if needed.
  const today = todayInFacility();
  const earliest = addDaysIso(today, -30);
  const latest = addDaysIso(today, BLOCK_DATE_MAX_DAYS);
  if (entry_date < earliest) {
    return { success: false, error: "Entry date is too far in the past." };
  }
  if (entry_date > latest) {
    return { success: false, error: "Entry date is too far in the future." };
  }

  const settings = await getFacilitySettings();
  const total_amount =
    Number(settings.entrance_pass_price_per_guest) * guest_count;

  const name = walk_in_name?.trim() || null;
  const phone = walk_in_phone?.trim() || null;
  const noteText = notes?.trim() || null;

  const { data: inserted, error: insertError } = await supabase
    .from("walk_in_entries")
    .insert({
      entry_date,
      guest_count,
      walk_in_name: name,
      walk_in_phone: phone,
      linked_booking_id: linked_booking_id ?? null,
      total_amount,
      notes: noteText,
      created_by: userId,
    })
    .select("id")
    .single();

  if (insertError) {
    logError("walk_in_entry.create_failed", insertError, {
      entry_date,
      guest_count,
    });
    return { success: false, error: "Couldn't log walk-in entry." };
  }

  await logAuditEvent("walk_in_entry.created", {
    actorUserId: userId,
    metadata: {
      entry_id: inserted.id,
      entry_date,
      guest_count,
      total_amount,
      linked_booking_id: linked_booking_id ?? null,
    },
  });

  revalidateEntryRoutes(inserted.id);
  return { success: true, entryId: inserted.id };
}

// ============================================================================
// SAVE ENTRY NOTES (admin autosave)
// ============================================================================
export async function saveWalkInEntryNotes(
  entryId: string,
  values: EntryNotesValues,
): Promise<SimpleActionResult> {
  const parsed = entryNotesSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const entry = await getWalkInEntryForNotes(entryId);
  if (!entry) return { success: false, error: "Entry not found." };

  const next = parsed.data.notes.trim();
  // Skip the write + audit when nothing actually changed — autosave fires
  // aggressively and would otherwise flood the activity feed.
  if ((entry.notes ?? "") === next) {
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from("walk_in_entries")
    .update({ notes: next.length === 0 ? null : next })
    .eq("id", entryId);
  if (updateError) {
    logError("walk_in_entry.notes_save_failed", updateError, { entryId });
    return { success: false, error: "Couldn't save notes." };
  }

  await logAuditEvent("walk_in_entry.note_updated", {
    actorUserId: userId,
    metadata: { entry_id: entryId },
  });

  revalidateEntryRoutes(entryId);
  return { success: true };
}

// ============================================================================
// DELETE ENTRY
// ============================================================================
export async function deleteWalkInEntry(
  entryId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const entry = await getWalkInEntryForDelete(entryId);
  if (!entry) return { success: false, error: "Entry not found." };

  const { error: deleteError } = await supabase
    .from("walk_in_entries")
    .delete()
    .eq("id", entryId);
  if (deleteError) {
    logError("walk_in_entry.delete_failed", deleteError, { entryId });
    return { success: false, error: "Couldn't delete entry." };
  }

  await logAuditEvent("walk_in_entry.deleted", {
    actorUserId: userId,
    metadata: { entry_id: entryId },
  });

  revalidatePath("/admin/entries");
  return { success: true };
}
