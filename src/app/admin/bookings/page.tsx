import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import { BookingsView } from "./bookings-view";
import type { BookingRow, BookingStatus } from "./schema";

export const metadata = { title: "Bookings — Admin" };

type RawBooking = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
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

const LIST_LIMIT = 500;

export default async function AdminBookingsPage() {
  const supabase = await createClient();

  const [bookingsRes, courtsRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_hour, end_hour, status, total_amount, expires_at, created_at, payment_receipt_url, user_id, walk_in_name, walk_in_phone, admin_notes, customer:users!bookings_user_id_fkey(name, email), court:courts!bookings_court_id_fkey(id, name, hourly_rate)",
      )
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    supabase
      .from("courts")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (bookingsRes.error) {
    throw new Error(`Failed to load bookings: ${bookingsRes.error.message}`);
  }
  if (courtsRes.error) {
    throw new Error(`Failed to load courts: ${courtsRes.error.message}`);
  }

  const rows: BookingRow[] = (
    (bookingsRes.data ?? []) as unknown as RawBooking[]
  ).map((b) => ({
    id: b.id,
    booking_date: b.booking_date,
    start_hour: b.start_hour,
    end_hour: b.end_hour,
    status: b.status as BookingStatus,
    total_amount: Number(b.total_amount),
    expires_at: b.expires_at,
    created_at: b.created_at,
    payment_receipt_url: b.payment_receipt_url,
    user_id: b.user_id,
    walk_in_name: b.walk_in_name,
    walk_in_phone: b.walk_in_phone,
    customer_name: b.customer?.name ?? null,
    customer_email: b.customer?.email ?? null,
    court_id: b.court?.id ?? "",
    court_name: b.court?.name ?? "—",
    court_hourly_rate: Number(b.court?.hourly_rate ?? 0),
    admin_notes: b.admin_notes,
  }));

  const courts = (courtsRes.data ?? [])
    .slice()
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <BookingsView
        rows={rows}
        courts={courts}
        today={todayInFacility()}
      />
    </main>
  );
}
