"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, type SimpleActionResult } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import { getCourt } from "@/lib/data/courts";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import {
  getBookingForApprove,
  getBookingForCancel,
  getBookingForComplete,
  getBookingForGuestEdit,
  getBookingForNotes,
  getBookingForReschedule,
  getBookingGuestForRedeem,
  listBookingGuestsForBooking,
} from "@/lib/data/bookings";
import { logError } from "@/lib/logger";
import { deleteBookingReceipt } from "@/lib/receipt";
import { formatHour, todayInFacility } from "@/lib/timezone";
import { addDaysIso, BOOKING_DATE_MAX_DAYS } from "@/lib/zod-helpers";

import {
  cancelSchema,
  editGuestCountSchema,
  notesSchema,
  rejectSchema,
  rescheduleSchema,
  walkinSchema,
  type CancelValues,
  type EditGuestCountValues,
  type NotesValues,
  type RejectValues,
  type RescheduleValues,
  type WalkinValues,
} from "./schema";

// Per-guest QR payload. 128+ bits of randomness, URL-safe, unguessable. The
// short prefix is purely diagnostic — makes a scanned code self-describing
// during a support call.
function newQrCode(): string {
  return `booking_${crypto.randomUUID()}`;
}

function buildGuestRows(
  bookingId: string,
  startNumber: number,
  count: number,
): { booking_id: string; guest_number: number; qr_code: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    booking_id: bookingId,
    guest_number: startNumber + i,
    qr_code: newQrCode(),
  }));
}

// Postgres exclusion_violation fired by bookings_no_overlap. We translate it
// into the same friendly message on every action path so admins get one
// consistent "slot is taken" experience.
const EXCLUSION_VIOLATION = "23P01";
const SLOT_TAKEN_ERROR =
  "That court/time is already taken. Refresh or pick another slot.";

type ActionOk = { success: true };
type ActionErr = { success: false; error: string; slotTaken?: boolean };
export type ActionResult = ActionOk | ActionErr;

// `admin_notes` doubles as the free-form reason log for reject/cancel. This
// helper appends a timestamped entry so the trail is preserved across
// multiple admin interventions without overwriting prior notes.
function appendNote(prev: string | null, entry: string): string {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${entry}`.trim();
  return prev ? `${prev}\n${line}` : line;
}

function revalidateBookingRoutes(bookingId: string) {
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/my-bookings");
  revalidatePath(`/payment/${bookingId}`);
  revalidatePath("/admin/schedule");
  revalidatePath("/booking");
}

// ============================================================================
// APPROVE
// ============================================================================
export async function approveBooking(
  bookingId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const booking = await getBookingForApprove(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.status !== "pending") {
    return { success: false, error: `Booking is already ${booking.status}.` };
  }
  if (!booking.payment_receipt_url) {
    return {
      success: false,
      error: "Customer hasn't uploaded a receipt yet.",
    };
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      expires_at: null,
      payment_receipt_url: null,
    })
    .eq("id", bookingId);
  if (updateError) {
    logError("booking.approve_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't approve booking." };
  }

  // Generate one QR per guest on confirmation. A prior approval/rollback
  // combination could leave the table with partial rows — fetch what exists
  // first so we only fill the gap rather than re-keying already-issued codes.
  const existing = await listBookingGuestsForBooking(bookingId);
  const existingCount = existing.length;
  if (existingCount < booking.guest_count) {
    const { error: guestsError } = await supabase
      .from("booking_guests")
      .insert(
        buildGuestRows(
          bookingId,
          existingCount + 1,
          booking.guest_count - existingCount,
        ),
      );
    if (guestsError) {
      logError("booking.approve_guests_failed", guestsError, {
        bookingId,
        existingCount,
        guestCount: booking.guest_count,
      });
      return { success: false, error: "Couldn't generate guest QR codes." };
    }
  }

  await deleteBookingReceipt(booking.payment_receipt_url);
  await logAuditEvent("booking.approved", {
    actorUserId: userId,
    metadata: { booking_id: bookingId, guest_count: booking.guest_count },
  });

  revalidateBookingRoutes(bookingId);
  return { success: true };
}

// ============================================================================
// REJECT  (terminal — pending → cancelled with reason)
// ============================================================================
export async function rejectBooking(
  bookingId: string,
  values: RejectValues,
): Promise<ActionResult> {
  const parsed = rejectSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const booking = await getBookingForCancel(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.status !== "pending") {
    return { success: false, error: `Booking is already ${booking.status}.` };
  }

  const note = appendNote(
    booking.admin_notes,
    `Rejected: ${parsed.data.reason}`,
  );

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      expires_at: null,
      payment_receipt_url: null,
      admin_notes: note,
    })
    .eq("id", bookingId);
  if (updateError) {
    logError("booking.reject_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't reject booking." };
  }

  await deleteBookingReceipt(booking.payment_receipt_url);
  await logAuditEvent("booking.rejected", {
    actorUserId: userId,
    metadata: { booking_id: bookingId, reason: parsed.data.reason },
  });

  revalidateBookingRoutes(bookingId);
  return { success: true };
}

// ============================================================================
// RESCHEDULE (no status change; recomputes total_amount)
// ============================================================================
export async function rescheduleBooking(
  bookingId: string,
  values: RescheduleValues,
): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const { court_id, booking_date, start_hour, duration_hours } = parsed.data;
  const end_hour = start_hour + duration_hours;

  const booking = await getBookingForReschedule(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return {
      success: false,
      error: `Only pending or confirmed bookings can be rescheduled.`,
    };
  }

  const today = todayInFacility();
  if (booking_date < today) {
    return { success: false, error: "Date must be today or later." };
  }
  if (booking_date > addDaysIso(today, BOOKING_DATE_MAX_DAYS)) {
    return {
      success: false,
      error: `Date must be within ${BOOKING_DATE_MAX_DAYS} days.`,
    };
  }

  const [court, settings] = await Promise.all([
    getCourt(court_id),
    getFacilitySettings(),
  ]);

  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) {
    return { success: false, error: "Court is not active." };
  }

  if (duration_hours > settings.max_booking_duration_hours) {
    return {
      success: false,
      error: `Duration exceeds the ${settings.max_booking_duration_hours}-hour maximum.`,
    };
  }
  if (
    start_hour < settings.operating_hours_start ||
    start_hour >= settings.operating_hours_end
  ) {
    return {
      success: false,
      error: `Start time must be between ${formatHour(settings.operating_hours_start)} and ${formatHour(settings.operating_hours_end)}.`,
    };
  }
  if (end_hour > settings.operating_hours_end) {
    return {
      success: false,
      error: `Booking must end by ${formatHour(settings.operating_hours_end)}.`,
    };
  }

  // reschedule only changes court/time, never guest count — but the total
  // still needs the entrance component so it stays consistent with the create
  // path. Reload guest_count from the booking we already fetched.
  const { data: currentRow, error: currentRowError } = await supabase
    .from("bookings")
    .select("guest_count")
    .eq("id", bookingId)
    .maybeSingle();
  if (currentRowError || !currentRow) {
    logError(
      "booking.reschedule_load_guest_count_failed",
      currentRowError ?? null,
      { bookingId },
    );
    return { success: false, error: "Couldn't reschedule booking." };
  }
  const total_amount =
    Number(court.hourly_rate) * duration_hours +
    Number(settings.entrance_pass_price_per_guest) * currentRow.guest_count;

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      court_id,
      booking_date,
      start_hour,
      end_hour,
      total_amount,
    })
    .eq("id", bookingId);

  if (updateError) {
    if (updateError.code === EXCLUSION_VIOLATION) {
      return { success: false, error: SLOT_TAKEN_ERROR, slotTaken: true };
    }
    logError("booking.reschedule_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't reschedule booking." };
  }

  await logAuditEvent("booking.rescheduled", {
    actorUserId: userId,
    metadata: {
      booking_id: bookingId,
      from: {
        court_id: booking.court_id,
        booking_date: booking.booking_date,
        start_hour: booking.start_hour,
        end_hour: booking.end_hour,
      },
      to: { court_id, booking_date, start_hour, end_hour },
    },
  });

  revalidateBookingRoutes(bookingId);
  return { success: true };
}

// ============================================================================
// CANCEL (pending or confirmed → cancelled; reason optional)
// ============================================================================
export async function cancelBooking(
  bookingId: string,
  values: CancelValues,
): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const booking = await getBookingForCancel(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return {
      success: false,
      error: `Only pending or confirmed bookings can be cancelled.`,
    };
  }

  const reason = parsed.data.reason?.trim();
  const note = reason
    ? appendNote(booking.admin_notes, `Cancelled: ${reason}`)
    : appendNote(booking.admin_notes, "Cancelled by admin");

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      expires_at: null,
      payment_receipt_url: null,
      admin_notes: note,
    })
    .eq("id", bookingId);
  if (updateError) {
    logError("booking.cancel_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't cancel booking." };
  }

  await deleteBookingReceipt(booking.payment_receipt_url);
  await logAuditEvent("booking.cancelled", {
    actorUserId: userId,
    metadata: {
      booking_id: bookingId,
      reason: reason ?? null,
    },
  });

  revalidateBookingRoutes(bookingId);
  return { success: true };
}

// ============================================================================
// MARK COMPLETED (confirmed + past-date → completed)
// ============================================================================
export async function completeBooking(
  bookingId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const booking = await getBookingForComplete(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.status !== "confirmed") {
    return {
      success: false,
      error: "Only confirmed bookings can be marked completed.",
    };
  }

  const today = todayInFacility();
  if (booking.booking_date >= today) {
    return {
      success: false,
      error: "Can only complete bookings whose date has passed.",
    };
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", bookingId);
  if (updateError) {
    logError("booking.complete_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't mark booking completed." };
  }

  await logAuditEvent("booking.completed", {
    actorUserId: userId,
    metadata: { booking_id: bookingId },
  });

  revalidateBookingRoutes(bookingId);
  return { success: true };
}

// ============================================================================
// SAVE NOTES (autosave; never logs the note body to the audit trail)
// ============================================================================
export async function saveBookingNotes(
  bookingId: string,
  values: NotesValues,
): Promise<SimpleActionResult> {
  const parsed = notesSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const notes = parsed.data.notes.trim();
  const booking = await getBookingForNotes(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };

  // Skip audit + revalidate when the text hasn't actually changed — autosave
  // fires aggressively and flooding audit_logs with no-op updates would
  // hollow out the activity feed.
  if ((booking.admin_notes ?? "") === notes) {
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ admin_notes: notes.length === 0 ? null : notes })
    .eq("id", bookingId);
  if (updateError) {
    logError("booking.notes_save_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't save notes." };
  }

  await logAuditEvent("booking.note_updated", {
    actorUserId: userId,
    metadata: { booking_id: bookingId },
  });

  revalidatePath(`/admin/bookings/${bookingId}`);
  return { success: true };
}

// ============================================================================
// CREATE WALK-IN BOOKING (admin-only, immediately confirmed, no receipt)
// ============================================================================
export type CreateWalkinResult =
  | { success: true; bookingId: string }
  | { success: false; error: string; slotTaken?: boolean };

export async function createWalkinBooking(
  values: WalkinValues,
): Promise<CreateWalkinResult> {
  const parsed = walkinSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const {
    court_id,
    booking_date,
    start_hour,
    duration_hours,
    guest_count,
  } = parsed.data;
  const end_hour = start_hour + duration_hours;

  const today = todayInFacility();
  if (booking_date < today) {
    return { success: false, error: "Date must be today or later." };
  }
  if (booking_date > addDaysIso(today, BOOKING_DATE_MAX_DAYS)) {
    return {
      success: false,
      error: `Date must be within ${BOOKING_DATE_MAX_DAYS} days.`,
    };
  }

  const [court, settings] = await Promise.all([
    getCourt(court_id),
    getFacilitySettings(),
  ]);

  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) {
    return { success: false, error: "Court is not active." };
  }

  if (duration_hours > settings.max_booking_duration_hours) {
    return {
      success: false,
      error: `Duration exceeds the ${settings.max_booking_duration_hours}-hour maximum.`,
    };
  }
  if (
    start_hour < settings.operating_hours_start ||
    start_hour >= settings.operating_hours_end
  ) {
    return {
      success: false,
      error: `Start time must be between ${formatHour(settings.operating_hours_start)} and ${formatHour(settings.operating_hours_end)}.`,
    };
  }
  if (end_hour > settings.operating_hours_end) {
    return {
      success: false,
      error: `Booking must end by ${formatHour(settings.operating_hours_end)}.`,
    };
  }

  const total_amount =
    Number(court.hourly_rate) * duration_hours +
    Number(settings.entrance_pass_price_per_guest) * guest_count;
  const walk_in_phone = parsed.data.walk_in_phone?.trim() || null;

  const { data: inserted, error: insertError } = await supabase
    .from("bookings")
    .insert({
      user_id: null,
      walk_in_name: parsed.data.walk_in_name,
      walk_in_phone,
      court_id,
      booking_date,
      start_hour,
      end_hour,
      // Walk-ins are paid in-person; no pending state, no expiry, no receipt.
      status: "confirmed",
      total_amount,
      guest_count,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === EXCLUSION_VIOLATION) {
      return {
        success: false,
        slotTaken: true,
        error: SLOT_TAKEN_ERROR,
      };
    }
    logError("booking.walkin_insert_failed", insertError, { court_id });
    return { success: false, error: "Couldn't create walk-in booking." };
  }

  const { error: guestsError } = await supabase
    .from("booking_guests")
    .insert(buildGuestRows(inserted.id, 1, guest_count));

  if (guestsError) {
    // Rollback the booking so we don't leave a confirmed row with no QRs.
    const { error: rollbackError } = await supabase
      .from("bookings")
      .delete()
      .eq("id", inserted.id);
    if (rollbackError) {
      logError("booking.walkin_rollback_failed", rollbackError, {
        bookingId: inserted.id,
      });
    }
    logError("booking.walkin_guests_failed", guestsError, {
      bookingId: inserted.id,
      guest_count,
    });
    return { success: false, error: "Couldn't create guest QR codes." };
  }

  await logAuditEvent("booking.walkin_created", {
    actorUserId: userId,
    metadata: {
      booking_id: inserted.id,
      walk_in_name: parsed.data.walk_in_name,
      court_id,
      booking_date,
      start_hour,
      end_hour,
      guest_count,
    },
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/schedule");
  revalidatePath("/booking");
  return { success: true, bookingId: inserted.id };
}

// ============================================================================
// EDIT GUEST COUNT (admin; any non-terminal state)
// ============================================================================
// Admin can add or remove seats at any time. Redeemed guests can never be
// removed — dropping a guest that already walked through the gate would
// rewrite history. The action adjusts the QR list to match the new count:
// add rows at the tail (highest guest_number) when increasing, drop the
// tail rows when decreasing.
export async function editBookingGuestCount(
  bookingId: string,
  values: EditGuestCountValues,
): Promise<ActionResult> {
  const parsed = editGuestCountSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { guest_count: next } = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const booking = await getBookingForGuestEdit(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.status === "cancelled" || booking.status === "completed") {
    return {
      success: false,
      error: `Booking is ${booking.status}; guest count is locked.`,
    };
  }

  const previous = booking.guest_count;
  if (next === previous) {
    return { success: true };
  }

  // Load court + settings to recompute total_amount.
  const [court, settings] = await Promise.all([
    getCourt(booking.court_id),
    getFacilitySettings(),
  ]);
  if (!court) return { success: false, error: "Court not found." };

  const hours = booking.end_hour - booking.start_hour;
  const total_amount =
    Number(court.hourly_rate) * hours +
    Number(settings.entrance_pass_price_per_guest) * next;

  // For confirmed bookings with existing QRs, reconcile the guest rows so
  // the issued codes line up with the new count. Pending bookings have no
  // guest rows yet (QRs are generated at approval), so this branch is a
  // no-op for them.
  const existing = await listBookingGuestsForBooking(bookingId);
  if (existing.length > 0) {
    if (next > existing.length) {
      const { error: insertError } = await supabase
        .from("booking_guests")
        .insert(
          buildGuestRows(
            bookingId,
            existing.length + 1,
            next - existing.length,
          ),
        );
      if (insertError) {
        logError("booking.guest_count_insert_failed", insertError, {
          bookingId,
        });
        return { success: false, error: "Couldn't add new guest QR codes." };
      }
    } else if (next < existing.length) {
      // Drop from the tail; refuse if the guests being removed have already
      // been redeemed (preserves the gate-entry audit trail).
      const toRemove = existing.filter((g) => g.guest_number > next);
      const redeemedInRemoval = toRemove.filter((g) => g.redeemed_at);
      if (redeemedInRemoval.length > 0) {
        return {
          success: false,
          error: `Can't reduce below ${Math.min(...redeemedInRemoval.map((g) => g.guest_number))} — that guest has already been redeemed.`,
        };
      }
      const { error: deleteError } = await supabase
        .from("booking_guests")
        .delete()
        .in(
          "id",
          toRemove.map((g) => g.id),
        );
      if (deleteError) {
        logError("booking.guest_count_delete_failed", deleteError, {
          bookingId,
        });
        return { success: false, error: "Couldn't remove guest QR codes." };
      }
    }
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ guest_count: next, total_amount })
    .eq("id", bookingId);
  if (updateError) {
    logError("booking.guest_count_update_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't update guest count." };
  }

  await logAuditEvent("booking.guest_count_changed", {
    actorUserId: userId,
    metadata: {
      booking_id: bookingId,
      from: previous,
      to: next,
    },
  });

  revalidateBookingRoutes(bookingId);
  return { success: true };
}

// ============================================================================
// MANUAL REDEEM (admin marks a single guest redeemed from the detail page)
// ============================================================================
export async function manualRedeemBookingGuest(
  guestId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const guest = await getBookingGuestForRedeem(guestId);
  if (!guest) return { success: false, error: "Guest not found." };
  if (guest.redeemed_at) {
    return { success: false, error: "Guest is already redeemed." };
  }

  const { error: updateError } = await supabase
    .from("booking_guests")
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_by: userId,
    })
    .eq("id", guestId);
  if (updateError) {
    logError("booking.guest_redeem_failed", updateError, { guestId });
    return { success: false, error: "Couldn't mark guest redeemed." };
  }

  await logAuditEvent("booking.guest_redeemed", {
    actorUserId: userId,
    metadata: {
      booking_id: guest.booking_id,
      guest_id: guestId,
      manual: true,
    },
  });

  revalidateBookingRoutes(guest.booking_id);
  return { success: true };
}
