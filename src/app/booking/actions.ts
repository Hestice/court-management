"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import { getCourt } from "@/lib/data/courts";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { logError } from "@/lib/logger";
import {
  checkPreset,
  formatRetryAfter,
} from "@/lib/rate-limit";
import { formatHour, todayInFacility } from "@/lib/timezone";
import { addDaysIso, BOOKING_DATE_MAX_DAYS } from "@/lib/zod-helpers";
import { createBookingSchema, type CreateBookingValues } from "./schema";

export type CreateBookingResult =
  | { success: true; bookingId: string }
  | { success: false; error: string; slotTaken?: boolean };

// Postgres exclusion_violation fired by the bookings_no_overlap EXCLUDE
// constraint. Supabase surfaces it on PostgrestError.code.
const EXCLUSION_VIOLATION = "23P01";

export async function createBooking(
  values: CreateBookingValues,
): Promise<CreateBookingResult> {
  const parsed = createBookingSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { court_id, booking_date, start_hour, duration_hours } = parsed.data;
  const end_hour = start_hour + duration_hours;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const rate = await checkPreset("bookingSubmit", userId);
  if (!rate.allowed) {
    await logAuditEvent("rate_limit.hit", {
      actorUserId: userId,
      metadata: { preset: "bookingSubmit" },
    });
    return {
      success: false,
      error: `You've hit the booking rate limit. ${formatRetryAfter(rate.retryAfterSeconds)}`,
    };
  }

  const today = todayInFacility();
  if (booking_date < today) {
    return { success: false, error: "Date must be today or later." };
  }
  if (booking_date > addDaysIso(today, BOOKING_DATE_MAX_DAYS)) {
    return {
      success: false,
      error: `Bookings can't be more than ${BOOKING_DATE_MAX_DAYS} days out.`,
    };
  }

  // Parallel fetch: court + settings. Validation is server-authoritative;
  // clients that tamper with hourly_rate or duration are caught here.
  const [court, settings] = await Promise.all([
    getCourt(court_id),
    getFacilitySettings(),
  ]);

  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) return { success: false, error: "Court is not active." };

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
  const expires_at = new Date(
    Date.now() + settings.pending_expiry_hours * 60 * 60 * 1000,
  ).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("bookings")
    .insert({
      user_id: userId,
      court_id,
      booking_date,
      start_hour,
      end_hour,
      status: "pending",
      total_amount,
      expires_at,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === EXCLUSION_VIOLATION) {
      return {
        success: false,
        slotTaken: true,
        error:
          "That time was just booked. Please pick another time or refresh.",
      };
    }
    logError("booking.create_failed", insertError, { court_id, booking_date });
    return { success: false, error: "Couldn't create booking." };
  }

  await logAuditEvent("booking.created", {
    actorUserId: userId,
    metadata: {
      booking_id: inserted.id,
      court_id,
      booking_date,
      start_hour,
      end_hour,
    },
  });

  revalidatePath("/booking");
  revalidatePath("/my-bookings");
  revalidatePath("/admin/bookings");
  return { success: true, bookingId: inserted.id };
}
