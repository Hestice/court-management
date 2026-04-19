import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

// Admin-only log of people entering the facility without their own booking.
// Walk-in entries are always cash-at-gate — no payment flow, no QR codes.
// The optional linked_booking_id captures the "joining a friend's booking"
// case so the admin can pull up the related court reservation.
export type WalkInEntryRaw = {
  id: string;
  entry_date: string;
  guest_count: number;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  total_amount: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  linked_booking_id: string | null;
  created_by_user: { name: string | null; email: string } | null;
  linked_booking: {
    id: string;
    booking_date: string;
    start_hour: number;
    end_hour: number;
    court: { name: string } | null;
    customer: { name: string | null; email: string } | null;
    walk_in_name: string | null;
  } | null;
};

export type WalkInEntryForDelete = {
  id: string;
};

export type WalkInEntryForNotes = {
  id: string;
  notes: string | null;
};

// Relation hops use the auto-generated constraint names. bookings.court_id →
// courts embed reuses the booking FK; customer/walk-in are pulled off the
// joined booking.
const FULL_SELECT =
  "id, entry_date, guest_count, walk_in_name, walk_in_phone, total_amount, notes, created_by, created_at, linked_booking_id, " +
  "created_by_user:users!walk_in_entries_created_by_fkey(name, email), " +
  "linked_booking:bookings!walk_in_entries_linked_booking_id_fkey(id, booking_date, start_hour, end_hour, walk_in_name, " +
  "court:courts!bookings_court_id_fkey(name), " +
  "customer:users!bookings_user_id_fkey(name, email))";

const LIST_LIMIT = 500;

export const listWalkInEntries = cache(async (): Promise<WalkInEntryRaw[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("walk_in_entries")
    .select(FULL_SELECT)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throwDataError("data.walk_in_entries.list", error);
  return (data ?? []) as unknown as WalkInEntryRaw[];
});

export const getWalkInEntry = cache(
  async (id: string): Promise<WalkInEntryRaw | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("walk_in_entries")
      .select(FULL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDataError("data.walk_in_entries.get", error, { id });
    return (data as unknown as WalkInEntryRaw) ?? null;
  },
);

export async function getWalkInEntryForDelete(
  id: string,
): Promise<WalkInEntryForDelete | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("walk_in_entries")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.walk_in_entries.get_for_delete", error, { id });
  return data ?? null;
}

export async function getWalkInEntryForNotes(
  id: string,
): Promise<WalkInEntryForNotes | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("walk_in_entries")
    .select("id, notes")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.walk_in_entries.get_for_notes", error, { id });
  return data ?? null;
}

// Bookings the admin can link a new walk-in entry to. Scoped to pending/
// confirmed so cancelled/completed ones don't clutter the picker; limited
// to a window around today so the list stays relevant.
export type LinkableBooking = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  court_name: string;
  customer_label: string;
};

export const listLinkableBookings = cache(
  async (params: {
    today: string;
    fromOffsetDays?: number;
    toOffsetDays?: number;
  }): Promise<LinkableBooking[]> => {
    const supabase = await createClient();
    const { today } = params;
    const fromOffsetDays = params.fromOffsetDays ?? -1;
    const toOffsetDays = params.toOffsetDays ?? 14;

    const from = addDaysIso(today, fromOffsetDays);
    const to = addDaysIso(today, toOffsetDays);

    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, booking_date, start_hour, end_hour, walk_in_name, " +
          "court:courts!bookings_court_id_fkey(name), " +
          "customer:users!bookings_user_id_fkey(name, email)",
      )
      .in("status", ["pending", "confirmed"])
      .gte("booking_date", from)
      .lte("booking_date", to)
      .order("booking_date", { ascending: true })
      .order("start_hour", { ascending: true })
      .limit(200);
    if (error) throwDataError("data.walk_in_entries.list_linkable", error);

    type Row = {
      id: string;
      booking_date: string;
      start_hour: number;
      end_hour: number;
      walk_in_name: string | null;
      court: { name: string } | null;
      customer: { name: string | null; email: string } | null;
    };

    return (data ?? []).map((raw) => {
      const r = raw as unknown as Row;
      const label =
        r.walk_in_name ??
        r.customer?.name ??
        r.customer?.email ??
        "Customer";
      return {
        id: r.id,
        booking_date: r.booking_date,
        start_hour: r.start_hour,
        end_hour: r.end_hour,
        court_name: r.court?.name ?? "—",
        customer_label: label,
      };
    });
  },
);

// Local copy of addDaysIso — avoids importing zod-helpers into the data layer
// (which is server-only; zod-helpers is also server-safe but the indirection
// isn't worth it for three lines).
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
