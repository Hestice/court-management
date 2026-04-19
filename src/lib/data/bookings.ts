import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

// Full row + customer/court relations. Used by the admin list + detail pages.
export type BookingRaw = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  guest_count: number;
  expires_at: string | null;
  created_at: string;
  payment_receipt_url: string | null;
  user_id: string | null;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  admin_notes: string | null;
  customer: { name: string | null; email: string } | null;
  court: { id: string; name: string; hourly_rate: number } | null;
};

export type BookingForOwnership = {
  id: string;
  user_id: string | null;
  status: string;
  payment_receipt_url: string | null;
};

export type BookingForApprove = {
  id: string;
  status: string;
  payment_receipt_url: string | null;
  guest_count: number;
};

export type BookingForGuestEdit = {
  id: string;
  status: string;
  guest_count: number;
  payment_receipt_url: string | null;
  court_id: string;
  start_hour: number;
  end_hour: number;
};

export type BookingForGuestLoad = {
  id: string;
  user_id: string | null;
  status: string;
  guest_count: number;
  payment_receipt_url: string | null;
};

export type BookingForCancel = {
  id: string;
  status: string;
  payment_receipt_url: string | null;
  admin_notes: string | null;
};

export type BookingForReschedule = {
  id: string;
  status: string;
  court_id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
};

export type BookingForComplete = {
  id: string;
  status: string;
  booking_date: string;
};

export type BookingForNotes = {
  id: string;
  admin_notes: string | null;
};

export type BookingOverlap = {
  id: string;
  start_hour: number;
  end_hour: number;
  status: string;
  walk_in_name: string | null;
};

export type MyBookingRaw = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  guest_count: number;
  expires_at: string | null;
  created_at: string;
  payment_receipt_url: string | null;
  court: { name: string; hourly_rate: number } | null;
};

export type CustomerBookingRaw = {
  id: string;
  user_id: string | null;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  guest_count: number;
  payment_receipt_url: string | null;
  court: { name: string; hourly_rate: number } | null;
};

export type BookingGuestRaw = {
  id: string;
  booking_id: string;
  guest_number: number;
  qr_code: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  redeemed_by_user: { name: string | null; email: string } | null;
};

export type BookingGuestForRedeem = {
  id: string;
  booking_id: string;
  redeemed_at: string | null;
};

const FULL_SELECT =
  "id, booking_date, start_hour, end_hour, status, total_amount, guest_count, expires_at, created_at, payment_receipt_url, user_id, walk_in_name, walk_in_phone, admin_notes, customer:users!bookings_user_id_fkey(name, email), court:courts!bookings_court_id_fkey(id, name, hourly_rate)";

const MY_BOOKINGS_SELECT =
  "id, booking_date, start_hour, end_hour, status, total_amount, guest_count, expires_at, created_at, payment_receipt_url, court:courts!bookings_court_id_fkey(name, hourly_rate)";

// LIMIT defends against a runaway list if the table grows; increase here
// (or paginate) if we ever need >500 bookings on one page.
const LIST_LIMIT = 500;

export const listBookings = cache(async (): Promise<BookingRaw[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(FULL_SELECT)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throwDataError("data.bookings.list", error);
  return (data ?? []) as unknown as BookingRaw[];
});

export const getBookingForAdmin = cache(
  async (id: string): Promise<BookingRaw | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bookings")
      .select(FULL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDataError("data.bookings.get_for_admin", error, { id });
    return (data as unknown as BookingRaw) ?? null;
  },
);

export const listBookingsForUser = cache(
  async (userId: string): Promise<MyBookingRaw[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bookings")
      .select(MY_BOOKINGS_SELECT)
      .eq("user_id", userId)
      .order("booking_date", { ascending: false })
      .order("start_hour", { ascending: false });
    if (error)
      throwDataError("data.bookings.list_for_user", error, { userId });
    return (data ?? []) as unknown as MyBookingRaw[];
  },
);

// Customer-facing fetch used by the /payment/[id] page. Returns a minimal
// shape; callers enforce ownership above this boundary.
export const getBookingForCustomer = cache(
  async (id: string): Promise<CustomerBookingRaw | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, user_id, booking_date, start_hour, end_hour, status, total_amount, guest_count, payment_receipt_url, court:courts!bookings_court_id_fkey(name, hourly_rate)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throwDataError("data.bookings.get_for_customer", error, { id });
    return (data as unknown as CustomerBookingRaw) ?? null;
  },
);

// Narrow reads used by server actions. Each returns just the fields the
// action mutates/validates to keep the query and type tight.
export async function getBookingForOwnership(
  id: string,
): Promise<BookingForOwnership | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, user_id, status, payment_receipt_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.bookings.get_for_ownership", error, { id });
  return data ?? null;
}

export async function getBookingForApprove(
  id: string,
): Promise<BookingForApprove | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, payment_receipt_url, guest_count")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.bookings.get_for_approve", error, { id });
  return data ?? null;
}

export async function getBookingForGuestEdit(
  id: string,
): Promise<BookingForGuestEdit | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, guest_count, payment_receipt_url, court_id, start_hour, end_hour",
    )
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.bookings.get_for_guest_edit", error, { id });
  return data ?? null;
}

export async function getBookingForGuestLoad(
  id: string,
): Promise<BookingForGuestLoad | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, user_id, status, guest_count, payment_receipt_url")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.bookings.get_for_guest_load", error, { id });
  return data ?? null;
}

export async function getBookingForCancel(
  id: string,
): Promise<BookingForCancel | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, payment_receipt_url, admin_notes")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.bookings.get_for_cancel", error, { id });
  return data ?? null;
}

export async function getBookingForReschedule(
  id: string,
): Promise<BookingForReschedule | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, court_id, booking_date, start_hour, end_hour")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.bookings.get_for_reschedule", error, { id });
  return data ?? null;
}

export async function getBookingForComplete(
  id: string,
): Promise<BookingForComplete | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, booking_date")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.bookings.get_for_complete", error, { id });
  return data ?? null;
}

export async function getBookingForNotes(
  id: string,
): Promise<BookingForNotes | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, admin_notes")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.bookings.get_for_notes", error, { id });
  return data ?? null;
}

// ============================================================================
// booking_guests
// ============================================================================
// Lives alongside bookings.ts on purpose — every read is "guests of a
// booking", so putting them in their own file would force every call site to
// import from two modules to assemble one view.

// Guests for a single booking, ordered by guest_number so "Guest 1 of N"
// labeling stays stable across reloads.
export const listBookingGuestsForBooking = cache(
  async (bookingId: string): Promise<BookingGuestRaw[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("booking_guests")
      .select(
        "id, booking_id, guest_number, qr_code, redeemed_at, redeemed_by, redeemed_by_user:users!booking_guests_redeemed_by_fkey(name, email)",
      )
      .eq("booking_id", bookingId)
      .order("guest_number", { ascending: true });
    if (error)
      throwDataError("data.booking_guests.list_for_booking", error, {
        bookingId,
      });
    return (data ?? []) as unknown as BookingGuestRaw[];
  },
);

export async function getBookingGuestForRedeem(
  id: string,
): Promise<BookingGuestForRedeem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_guests")
    .select("id, booking_id, redeemed_at")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.booking_guests.get_for_redeem", error, { id });
  return data ?? null;
}

// Redemption counts across many bookings — used on the admin list so rows
// show "3/4 redeemed" without materializing each guest list.
export async function listGuestCountsForBookings(
  bookingIds: string[],
): Promise<Map<string, { total: number; redeemed: number }>> {
  const out = new Map<string, { total: number; redeemed: number }>();
  if (bookingIds.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_guests")
    .select("booking_id, redeemed_at")
    .in("booking_id", bookingIds);
  if (error)
    throwDataError("data.booking_guests.list_counts", error, {
      bookingCount: bookingIds.length,
    });
  for (const row of data ?? []) {
    const entry = out.get(row.booking_id) ?? { total: 0, redeemed: 0 };
    entry.total += 1;
    if (row.redeemed_at) entry.redeemed += 1;
    out.set(row.booking_id, entry);
  }
  return out;
}

// Pending/confirmed bookings that overlap [start, end) on (court, date). Used
// when admin creates a blocked slot to warn about conflicts before insert.
export async function listOverlappingBookings(params: {
  courtId: string;
  date: string;
  startHour: number;
  endHour: number;
}): Promise<BookingOverlap[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, start_hour, end_hour, status, walk_in_name")
    .eq("court_id", params.courtId)
    .eq("booking_date", params.date)
    .in("status", ["pending", "confirmed"])
    .lt("start_hour", params.endHour)
    .gt("end_hour", params.startHour);
  if (error)
    throwDataError("data.bookings.list_overlapping", error, { ...params });
  return data ?? [];
}
