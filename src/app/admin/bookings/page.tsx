import { listBookings } from "@/lib/data/bookings";
import { listAllCourtOptions } from "@/lib/data/courts";
import { todayInFacility } from "@/lib/timezone";

import { BookingsView } from "./bookings-view";
import type { BookingRow, BookingStatus } from "./schema";

export const metadata = { title: "Bookings — Admin" };

export default async function AdminBookingsPage() {
  const [bookings, courts] = await Promise.all([
    listBookings(),
    listAllCourtOptions(),
  ]);

  const rows: BookingRow[] = bookings.map((b) => ({
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <BookingsView rows={rows} courts={courts} today={todayInFacility()} />
    </main>
  );
}
