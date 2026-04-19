import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import { MyBookingsView, type MyBookingRow } from "./my-bookings-view";

export const metadata = { title: "My Bookings" };

type BookingWithCourt = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  expires_at: string | null;
  created_at: string;
  court: { name: string } | null;
};

export default async function MyBookingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Middleware redirects unauthenticated users; user here is guaranteed.
  if (!user) return null;

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_date, start_hour, end_hour, status, total_amount, expires_at, created_at, court:courts!bookings_court_id_fkey(name)",
    )
    .eq("user_id", user.id)
    .order("booking_date", { ascending: false })
    .order("start_hour", { ascending: false });

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  const rows: MyBookingRow[] = (
    (data ?? []) as unknown as BookingWithCourt[]
  ).map((b) => ({
    id: b.id,
    court_name: b.court?.name ?? "—",
    booking_date: b.booking_date,
    start_hour: b.start_hour,
    end_hour: b.end_hour,
    status: b.status,
    total_amount: Number(b.total_amount),
    expires_at: b.expires_at,
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <MyBookingsView rows={rows} today={todayInFacility()} />
    </main>
  );
}
