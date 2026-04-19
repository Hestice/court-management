"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, type SimpleActionResult } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import {
  getPassForApprove,
  getPassForCancel,
  getPassForNotes,
  getPassGuestForRedeem,
} from "@/lib/data/entrance-passes";
import { logError } from "@/lib/logger";
import { deletePassReceipt } from "@/lib/receipt";
import { todayInFacility } from "@/lib/timezone";
import { addDaysIso, PASS_DATE_MAX_DAYS } from "@/lib/zod-helpers";

import {
  cancelPassSchema,
  passNotesSchema,
  rejectPassSchema,
  walkinPassSchema,
  type CancelPassValues,
  type PassNotesValues,
  type RejectPassValues,
  type WalkinPassValues,
} from "../../entrance/schema";

type ActionOk = { success: true };
type ActionErr = { success: false; error: string };
export type ActionResult = ActionOk | ActionErr;

// Mirror booking's appendNote — timestamped free-form trail for reject/cancel
// reasons. Kept independent of the booking helper so the two feeds can evolve
// separately if the product ever asks for different formatting.
function appendNote(prev: string | null, entry: string): string {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${entry}`.trim();
  return prev ? `${prev}\n${line}` : line;
}

function revalidatePassRoutes(passId: string) {
  revalidatePath("/admin/passes");
  revalidatePath(`/admin/passes/${passId}`);
  revalidatePath("/my-passes");
  revalidatePath(`/payment/${passId}`);
}

function newQrCode(): string {
  return `pass_${crypto.randomUUID()}`;
}

// Generate QR codes for N guests of a pass — used by the walk-in flow. Same
// shape + prefix as the customer purchase action so scanning logic can stay
// uniform.
function buildGuestRows(
  passId: string,
  guestCount: number,
): { pass_id: string; guest_number: number; qr_code: string }[] {
  return Array.from({ length: guestCount }, (_, i) => ({
    pass_id: passId,
    guest_number: i + 1,
    qr_code: newQrCode(),
  }));
}

// ============================================================================
// APPROVE
// ============================================================================
export async function approvePass(passId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const pass = await getPassForApprove(passId);
  if (!pass) return { success: false, error: "Pass not found." };
  if (pass.status !== "pending") {
    return { success: false, error: `Pass is already ${pass.status}.` };
  }
  if (!pass.payment_receipt_url) {
    return {
      success: false,
      error: "Customer hasn't uploaded a receipt yet.",
    };
  }

  const { error: updateError } = await supabase
    .from("entrance_passes")
    .update({
      status: "confirmed",
      expires_at: null,
      payment_receipt_url: null,
    })
    .eq("id", passId);
  if (updateError) {
    logError("pass.approve_failed", updateError, { passId });
    return { success: false, error: "Couldn't approve pass." };
  }

  await deletePassReceipt(pass.payment_receipt_url);
  await logAuditEvent("pass.approved", {
    actorUserId: userId,
    metadata: { pass_id: passId },
  });

  revalidatePassRoutes(passId);
  return { success: true };
}

// ============================================================================
// REJECT (terminal; pending → cancelled with required reason)
// ============================================================================
export async function rejectPass(
  passId: string,
  values: RejectPassValues,
): Promise<ActionResult> {
  const parsed = rejectPassSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const pass = await getPassForCancel(passId);
  if (!pass) return { success: false, error: "Pass not found." };
  if (pass.status !== "pending") {
    return { success: false, error: `Pass is already ${pass.status}.` };
  }

  const note = appendNote(pass.admin_notes, `Rejected: ${parsed.data.reason}`);

  const { error: updateError } = await supabase
    .from("entrance_passes")
    .update({
      status: "cancelled",
      expires_at: null,
      payment_receipt_url: null,
      admin_notes: note,
    })
    .eq("id", passId);
  if (updateError) {
    logError("pass.reject_failed", updateError, { passId });
    return { success: false, error: "Couldn't reject pass." };
  }

  await deletePassReceipt(pass.payment_receipt_url);
  await logAuditEvent("pass.rejected", {
    actorUserId: userId,
    metadata: { pass_id: passId, reason: parsed.data.reason },
  });

  revalidatePassRoutes(passId);
  return { success: true };
}

// ============================================================================
// CANCEL (pending or confirmed → cancelled; optional reason)
// ============================================================================
export async function cancelPass(
  passId: string,
  values: CancelPassValues,
): Promise<ActionResult> {
  const parsed = cancelPassSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const pass = await getPassForCancel(passId);
  if (!pass) return { success: false, error: "Pass not found." };
  if (pass.status !== "pending" && pass.status !== "confirmed") {
    return {
      success: false,
      error: "Only pending or confirmed passes can be cancelled.",
    };
  }

  const reason = parsed.data.reason?.trim();
  const note = reason
    ? appendNote(pass.admin_notes, `Cancelled: ${reason}`)
    : appendNote(pass.admin_notes, "Cancelled by admin");

  // Deliberately does NOT touch pass_guests rows — an already-redeemed guest
  // stays redeemed for audit purposes. Admin cancels a confirmed pass after
  // some guests entered is a rare but real scenario; leaving redemption in
  // place preserves the historical record of what actually happened at the
  // gate.
  const { error: updateError } = await supabase
    .from("entrance_passes")
    .update({
      status: "cancelled",
      expires_at: null,
      payment_receipt_url: null,
      admin_notes: note,
    })
    .eq("id", passId);
  if (updateError) {
    logError("pass.cancel_failed", updateError, { passId });
    return { success: false, error: "Couldn't cancel pass." };
  }

  await deletePassReceipt(pass.payment_receipt_url);
  await logAuditEvent("pass.cancelled", {
    actorUserId: userId,
    metadata: { pass_id: passId, reason: reason ?? null },
  });

  revalidatePassRoutes(passId);
  return { success: true };
}

// ============================================================================
// SAVE NOTES (admin-only, autosave; does not log note body to the trail)
// ============================================================================
export async function savePassNotes(
  passId: string,
  values: PassNotesValues,
): Promise<SimpleActionResult> {
  const parsed = passNotesSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const notes = parsed.data.notes.trim();
  const pass = await getPassForNotes(passId);
  if (!pass) return { success: false, error: "Pass not found." };

  // Autosave fires aggressively; skip when the text hasn't actually changed
  // so audit logs don't flood with no-op updates.
  if ((pass.admin_notes ?? "") === notes) {
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from("entrance_passes")
    .update({ admin_notes: notes.length === 0 ? null : notes })
    .eq("id", passId);
  if (updateError) {
    logError("pass.notes_save_failed", updateError, { passId });
    return { success: false, error: "Couldn't save notes." };
  }

  await logAuditEvent("pass.note_updated", {
    actorUserId: userId,
    metadata: { pass_id: passId },
  });

  revalidatePath(`/admin/passes/${passId}`);
  return { success: true };
}

// ============================================================================
// MANUAL REDEEM (admin marks a single guest as redeemed from the detail page)
// ============================================================================
export async function manualRedeemPassGuest(
  guestId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const guest = await getPassGuestForRedeem(guestId);
  if (!guest) return { success: false, error: "Guest not found." };
  if (guest.redeemed_at) {
    return { success: false, error: "Guest is already redeemed." };
  }

  const { error: updateError } = await supabase
    .from("pass_guests")
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_by: userId,
    })
    .eq("id", guestId);
  if (updateError) {
    logError("pass.guest_redeem_failed", updateError, { guestId });
    return { success: false, error: "Couldn't mark guest redeemed." };
  }

  await logAuditEvent("pass.guest_redeemed", {
    actorUserId: userId,
    metadata: {
      pass_id: guest.pass_id,
      guest_id: guestId,
      manual: true,
    },
  });

  revalidatePassRoutes(guest.pass_id);
  return { success: true };
}

// ============================================================================
// CREATE WALK-IN PASS (admin-only, immediately confirmed, no receipt)
// ============================================================================
export type CreateWalkinPassResult =
  | { success: true; passId: string }
  | { success: false; error: string };

export async function createWalkinPass(
  values: WalkinPassValues,
): Promise<CreateWalkinPassResult> {
  const parsed = walkinPassSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const { pass_date, guest_count, walk_in_name } = parsed.data;
  const walk_in_phone = parsed.data.walk_in_phone?.trim() || null;

  const today = todayInFacility();
  if (pass_date < today) {
    return { success: false, error: "Date must be today or later." };
  }
  if (pass_date > addDaysIso(today, PASS_DATE_MAX_DAYS)) {
    return {
      success: false,
      error: `Date must be within ${PASS_DATE_MAX_DAYS} days.`,
    };
  }

  const settings = await getFacilitySettings();
  const total_amount =
    Number(settings.entrance_pass_price_per_guest) * guest_count;

  const { data: inserted, error: insertError } = await supabase
    .from("entrance_passes")
    .insert({
      user_id: null,
      walk_in_name,
      walk_in_phone,
      pass_date,
      guest_count,
      // Walk-ins are paid in person; no pending state, no expiry, no receipt.
      status: "confirmed",
      total_amount,
    })
    .select("id")
    .single();

  if (insertError) {
    logError("pass.walkin_insert_failed", insertError, {
      pass_date,
      guest_count,
    });
    return { success: false, error: "Couldn't create walk-in pass." };
  }

  const { error: guestsError } = await supabase
    .from("pass_guests")
    .insert(buildGuestRows(inserted.id, guest_count));

  if (guestsError) {
    const { error: rollbackError } = await supabase
      .from("entrance_passes")
      .delete()
      .eq("id", inserted.id);
    if (rollbackError) {
      logError("pass.walkin_rollback_failed", rollbackError, {
        passId: inserted.id,
      });
    }
    logError("pass.walkin_guests_failed", guestsError, {
      passId: inserted.id,
      guest_count,
    });
    return { success: false, error: "Couldn't create guest QR codes." };
  }

  await logAuditEvent("pass.walkin_created", {
    actorUserId: userId,
    metadata: {
      pass_id: inserted.id,
      walk_in_name,
      pass_date,
      guest_count,
      total_amount,
    },
  });

  revalidatePath("/admin/passes");
  return { success: true, passId: inserted.id };
}
