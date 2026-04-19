import { redirect } from "next/navigation";

import {
  listBookingGuestsForBooking,
  listBookingsForUser,
} from "@/lib/data/bookings";
import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import { MyBookingsView, type MyBookingRow } from "./my-bookings-view";

export const metadata = { title: "My Bookings" };

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Middleware redirects unauthenticated users; belt-and-braces for contexts
  // where middleware didn't run.
  if (!user) redirect("/login?next=/my-bookings");

  const bookings = await listBookingsForUser(user.id);

  // Only fetch guest QR rows for confirmed bookings — those are the only ones
  // where QRs render in the UI. Keeps the per-row trip count bounded.
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const guestsByBooking = new Map<
    string,
    Awaited<ReturnType<typeof listBookingGuestsForBooking>>
  >();
  await Promise.all(
    confirmed.map(async (b) => {
      guestsByBooking.set(b.id, await listBookingGuestsForBooking(b.id));
    }),
  );

  const rows: MyBookingRow[] = bookings.map((b) => ({
    id: b.id,
    court_name: b.court?.name ?? "—",
    booking_date: b.booking_date,
    start_hour: b.start_hour,
    end_hour: b.end_hour,
    status: b.status,
    total_amount: Number(b.total_amount),
    guest_count: b.guest_count,
    expires_at: b.expires_at,
    has_receipt: !!b.payment_receipt_url,
    guests: (guestsByBooking.get(b.id) ?? []).map((g) => ({
      id: g.id,
      guest_number: g.guest_number,
      qr_code: g.qr_code,
      redeemed_at: g.redeemed_at,
    })),
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <MyBookingsView rows={rows} today={todayInFacility()} />
    </main>
  );
}
