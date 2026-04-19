"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { deleteBookingReceipt } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";
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

// Tiny wrapper so every admin action starts from the same admin-check and
// bails with a consistent error. RLS would also block non-admin writes, but
// the explicit check gives us an actionable error in the logs and short-
// circuits before we hit the DB.
async function requireAdmin(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Admin access required." };
  }
  return { ok: true, userId: user.id, supabase };
}

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

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, payment_receipt_url")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
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
  if (updateError) return { success: false, error: updateError.message };

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

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, payment_receipt_url, admin_notes")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
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
  if (updateError) return { success: false, error: updateError.message };

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

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, court_id, booking_date, start_hour, end_hour")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
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

  const [{ data: court, error: courtError }, { data: settings }] =
    await Promise.all([
      supabase
        .from("courts")
        .select("id, is_active, hourly_rate")
        .eq("id", court_id)
        .maybeSingle(),
      supabase
        .from("facility_settings")
        .select(
          "operating_hours_start, operating_hours_end, max_booking_duration_hours",
        )
        .eq("id", 1)
        .maybeSingle(),
    ]);

  if (courtError) return { success: false, error: courtError.message };
  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) {
    return { success: false, error: "Court is not active." };
  }

  const opStart = settings?.operating_hours_start ?? 8;
  const opEnd = settings?.operating_hours_end ?? 22;
  const maxDuration = settings?.max_booking_duration_hours ?? 5;

  if (duration_hours > maxDuration) {
    return {
      success: false,
      error: `Duration exceeds the ${maxDuration}-hour maximum.`,
    };
  }
  if (start_hour < opStart || start_hour >= opEnd) {
    return {
      success: false,
      error: `Start time must be between ${formatHour(opStart)} and ${formatHour(opEnd)}.`,
    };
  }
  if (end_hour > opEnd) {
    return {
      success: false,
      error: `Booking must end by ${formatHour(opEnd)}.`,
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
    return { success: false, error: updateError.message };
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

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, payment_receipt_url, admin_notes")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
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
  if (updateError) return { success: false, error: updateError.message };

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

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, booking_date")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
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
  if (updateError) return { success: false, error: updateError.message };

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
): Promise<ActionResult> {
  const parsed = notesSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const notes = parsed.data.notes.trim();
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, admin_notes")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError) return { success: false, error: fetchError.message };
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
  if (updateError) return { success: false, error: updateError.message };

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

  const [{ data: court, error: courtError }, { data: settings }] =
    await Promise.all([
      supabase
        .from("courts")
        .select("id, is_active, hourly_rate")
        .eq("id", court_id)
        .maybeSingle(),
      supabase
        .from("facility_settings")
        .select(
          "operating_hours_start, operating_hours_end, max_booking_duration_hours",
        )
        .eq("id", 1)
        .maybeSingle(),
    ]);

  if (courtError) return { success: false, error: courtError.message };
  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) {
    return { success: false, error: "Court is not active." };
  }

  const opStart = settings?.operating_hours_start ?? 8;
  const opEnd = settings?.operating_hours_end ?? 22;
  const maxDuration = settings?.max_booking_duration_hours ?? 5;

  if (duration_hours > maxDuration) {
    return {
      success: false,
      error: `Duration exceeds the ${maxDuration}-hour maximum.`,
    };
  }
  if (start_hour < opStart || start_hour >= opEnd) {
    return {
      success: false,
      error: `Start time must be between ${formatHour(opStart)} and ${formatHour(opEnd)}.`,
    };
  }
  if (end_hour > opEnd) {
    return {
      success: false,
      error: `Booking must end by ${formatHour(opEnd)}.`,
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
    return { success: false, error: insertError.message };
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
