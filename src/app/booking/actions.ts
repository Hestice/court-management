"use server";

import { revalidatePath } from "next/cache";

import {
  checkPreset,
  formatRetryAfter,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const rate = await checkPreset("bookingSubmit", user.id);
  if (!rate.allowed) {
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
  const [{ data: court, error: courtError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase
        .from("courts")
        .select("id, name, is_active, hourly_rate")
        .eq("id", court_id)
        .maybeSingle(),
      supabase
        .from("facility_settings")
        .select(
          "operating_hours_start, operating_hours_end, pending_expiry_hours, max_booking_duration_hours",
        )
        .eq("id", 1)
        .maybeSingle(),
    ]);

  if (courtError) return { success: false, error: courtError.message };
  if (!court) return { success: false, error: "Court not found." };
  if (!court.is_active) return { success: false, error: "Court is not active." };
  if (settingsError) return { success: false, error: settingsError.message };

  const opStart = settings?.operating_hours_start ?? 8;
  const opEnd = settings?.operating_hours_end ?? 22;
  const maxDuration = settings?.max_booking_duration_hours ?? 5;
  const expiryHours = settings?.pending_expiry_hours ?? 24;

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
  const expires_at = new Date(
    Date.now() + expiryHours * 60 * 60 * 1000,
  ).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("bookings")
    .insert({
      user_id: user.id,
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
    return { success: false, error: insertError.message };
  }

  revalidatePath("/booking");
  revalidatePath("/my-bookings");
  return { success: true, bookingId: inserted.id };
}
