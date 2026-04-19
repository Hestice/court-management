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
  getBookingForNotes,
  getBookingForReschedule,
} from "@/lib/data/bookings";
import { logError } from "@/lib/logger";
import { deleteBookingReceipt } from "@/lib/receipt";
import { formatHour, todayInFacility } from "@/lib/timezone";
import { addDaysIso, BOOKING_DATE_MAX_DAYS } from "@/lib/zod-helpers";

import {
  cancelSchema,
  notesSchema,
  rejectSchema,
  rescheduleSchema,
  walkinSchema,
  type CancelValues,
  type NotesValues,
  type RejectValues,
  type RescheduleValues,
  type WalkinValues,
} from "./schema";

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

  await deleteBookingReceipt(booking.payment_receipt_url);
  await logAuditEvent("booking.approved", {
    actorUserId: userId,
    metadata: { booking_id: bookingId },
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

  const total_amount = Number(court.hourly_rate) * duration_hours;

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

  const { court_id, booking_date, start_hour, duration_hours } = parsed.data;
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

  const total_amount = Number(court.hourly_rate) * duration_hours;
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

  await logAuditEvent("booking.walkin_created", {
    actorUserId: userId,
    metadata: {
      booking_id: inserted.id,
      walk_in_name: parsed.data.walk_in_name,
      court_id,
      booking_date,
      start_hour,
      end_hour,
    },
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/schedule");
  revalidatePath("/booking");
  return { success: true, bookingId: inserted.id };
}
