import { redirect } from "next/navigation";

import { listBookingsForUser } from "@/lib/data/bookings";
import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import { MyBookingsView, type MyBookingRow } from "./my-bookings-view";

export const metadata = { title: "My Bookings" };

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Middleware redirects unauthenticated users; this is belt-and-braces in
  // case the page is rendered in a context where middleware didn't run.
  if (!user) redirect("/login?next=/my-bookings");

  const bookings = await listBookingsForUser(user.id);

  const rows: MyBookingRow[] = bookings.map((b) => ({
    id: b.id,
    court_name: b.court?.name ?? "—",
    booking_date: b.booking_date,
    start_hour: b.start_hour,
    end_hour: b.end_hour,
    status: b.status,
    total_amount: Number(b.total_amount),
    expires_at: b.expires_at,
    has_receipt: !!b.payment_receipt_url,
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <MyBookingsView rows={rows} today={todayInFacility()} />
    </main>
  );
}
