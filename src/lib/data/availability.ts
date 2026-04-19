import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { facilityNow } from "@/lib/timezone";

import { throwDataError } from "./_shared";
import { getFacilitySettings } from "./facility-settings";

export type AvailabilityStatus =
  | "available"
  | "booked_pending"
  | "booked_confirmed"
  | "blocked"
  | "outside_hours"
  | "past";

export type HourAvailability = {
  hour: number;
  status: AvailabilityStatus;
  booking_id?: string;
  block_id?: string;
};

export type CourtAvailability = {
  court: { id: string; name: string; hourly_rate: number };
  hours: HourAvailability[];
};

export type AvailabilityParams = {
  date: string;
  courtId?: string;
  // When rescheduling, the booking being moved should not block itself from
  // appearing available in its *current* slot. Pass its id here and that row
  // is ignored when building per-hour status.
  excludeBookingId?: string;
};

// Wrapped in cache() so the booking page + server action rendering in the
// same request reuse one result. Delegates operating hours to
// getFacilitySettings (also cached) — no duplicate query.
async function getAvailabilityImpl(
  params: AvailabilityParams,
): Promise<CourtAvailability[]> {
  const supabase = await createClient();

  const [settings, courtsRes, bookingsRes, blocksRes] = await Promise.all([
    getFacilitySettings(),
    (() => {
      let q = supabase
        .from("courts")
        .select("id, name, hourly_rate")
        .eq("is_active", true);
      if (params.courtId) q = q.eq("id", params.courtId);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("bookings")
        .select("id, court_id, start_hour, end_hour, status")
        .eq("booking_date", params.date)
        .in("status", ["pending", "confirmed"]);
      if (params.courtId) q = q.eq("court_id", params.courtId);
      if (params.excludeBookingId) q = q.neq("id", params.excludeBookingId);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("blocked_slots")
        .select("id, court_id, start_hour, end_hour")
        .eq("slot_date", params.date);
      if (params.courtId) q = q.eq("court_id", params.courtId);
      return q;
    })(),
  ]);

  if (courtsRes.error)
    throwDataError("data.availability.courts", courtsRes.error, { ...params });
  if (bookingsRes.error)
    throwDataError("data.availability.bookings", bookingsRes.error, {
      ...params,
    });
  if (blocksRes.error)
    throwDataError("data.availability.blocks", blocksRes.error, { ...params });
  const courtsData = courtsRes.data;
  const bookingsData = bookingsRes.data;
  const blocksData = blocksRes.data;

  const operatingStart = settings.operating_hours_start;
  const operatingEnd = settings.operating_hours_end;

  const { today, currentHour } = facilityNow();
  const isToday = params.date === today;

  const courts = (courtsData ?? []).slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return courts.map((court) => {
    const courtBookings = (bookingsData ?? []).filter(
      (b) => b.court_id === court.id,
    );
    const courtBlocks = (blocksData ?? []).filter(
      (b) => b.court_id === court.id,
    );

    const hours: HourAvailability[] = [];
    for (let hour = 0; hour < 24; hour++) {
      // Priority (most-restrictive first): outside_hours > past > blocked
      // > booked_confirmed > booked_pending > available. Break as soon as we
      // pick a status so the cell surfaces the strongest reason it can't be
      // booked.
      if (hour < operatingStart || hour >= operatingEnd) {
        hours.push({ hour, status: "outside_hours" });
        continue;
      }
      if (isToday && hour < currentHour) {
        hours.push({ hour, status: "past" });
        continue;
      }

      const block = courtBlocks.find(
        (b) => b.start_hour <= hour && hour < b.end_hour,
      );
      if (block) {
        hours.push({ hour, status: "blocked", block_id: block.id });
        continue;
      }

      const confirmed = courtBookings.find(
        (b) =>
          b.status === "confirmed" &&
          b.start_hour <= hour &&
          hour < b.end_hour,
      );
      if (confirmed) {
        hours.push({
          hour,
          status: "booked_confirmed",
          booking_id: confirmed.id,
        });
        continue;
      }

      const pending = courtBookings.find(
        (b) =>
          b.status === "pending" && b.start_hour <= hour && hour < b.end_hour,
      );
      if (pending) {
        hours.push({
          hour,
          status: "booked_pending",
          booking_id: pending.id,
        });
        continue;
      }

      hours.push({ hour, status: "available" });
    }

    return {
      court: {
        id: court.id,
        name: court.name,
        hourly_rate: court.hourly_rate,
      },
      hours,
    };
  });
}

// Keyed by a JSON string so identical ({date, courtId, excludeBookingId})
// shapes dedupe within a single render.
const memoized = cache(async (key: string): Promise<CourtAvailability[]> => {
  const parsed = JSON.parse(key) as AvailabilityParams;
  return getAvailabilityImpl(parsed);
});

export async function getAvailability(
  params: AvailabilityParams,
): Promise<CourtAvailability[]> {
  return memoized(
    JSON.stringify({
      date: params.date,
      courtId: params.courtId ?? null,
      excludeBookingId: params.excludeBookingId ?? null,
    }),
  );
}
