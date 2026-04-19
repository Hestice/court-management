import { createClient } from "@/lib/supabase/server";

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

// Single-facility MVP: treat the facility as operating in Manila time so that
// "today" and the current hour match what a customer in the facility would see.
// Revisit when multi-venue support lands.
const FACILITY_TIMEZONE = "Asia/Manila";

type FacilityNow = { today: string; currentHour: number };

function facilityNow(): FacilityNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FACILITY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  // en-CA with hour12=false emits "24" at the instant that would otherwise be
  // midnight of the following day; normalize it back to 0.
  const rawHour = Number(parts.find((p) => p.type === "hour")!.value);
  const currentHour = rawHour === 24 ? 0 : rawHour;

  return { today: `${year}-${month}-${day}`, currentHour };
}

export async function getAvailability(params: {
  date: string;
  courtId?: string;
}): Promise<CourtAvailability[]> {
  const supabase = await createClient();

  const [{ data: settings }, courtsRes, bookingsRes, blocksRes] =
    await Promise.all([
      supabase
        .from("facility_settings")
        .select("operating_hours_start, operating_hours_end")
        .eq("id", 1)
        .maybeSingle(),
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

  if (courtsRes.error) throw new Error(courtsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (blocksRes.error) throw new Error(blocksRes.error.message);

  const operatingStart = settings?.operating_hours_start ?? 8;
  const operatingEnd = settings?.operating_hours_end ?? 22;

  const { today, currentHour } = facilityNow();
  const isToday = params.date === today;

  const courts = (courtsRes.data ?? []).slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return courts.map((court) => {
    const courtBookings = (bookingsRes.data ?? []).filter(
      (b) => b.court_id === court.id,
    );
    const courtBlocks = (blocksRes.data ?? []).filter(
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
