import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  formatFacilityDate,
  formatHourRange,
} from "@/lib/timezone";

export const metadata = { title: "Booking Received" };

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

type BookingWithCourt = {
  id: string;
  user_id: string | null;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  court: { name: string } | null;
};

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data } = await supabase
    .from("bookings")
    .select(
      "id, user_id, booking_date, start_hour, end_hour, status, total_amount, court:courts!bookings_court_id_fkey(name)",
    )
    .eq("id", id)
    .maybeSingle();

  const booking = data as unknown as BookingWithCourt | null;
  // Scope: owners see their own bookings here. Admins can still find it via
  // the admin panel; keeping this route customer-scoped keeps the URL safe
  // to share without leaking other users' details.
  if (!booking || booking.user_id !== user.id) notFound();

  const duration = booking.end_hour - booking.start_hour;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Booking received
        </h1>
        <p className="text-sm text-muted-foreground">
          Your reservation is pending admin review.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <Row label="Court" value={booking.court?.name ?? "—"} />
        <Row label="Date" value={formatFacilityDate(booking.booking_date)} />
        <Row
          label="Time"
          value={`${formatHourRange(booking.start_hour, booking.end_hour)} (${duration} ${duration === 1 ? "hour" : "hours"})`}
        />
        <Row label="Total" value={formatPHP(Number(booking.total_amount))} />
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Upload payment to confirm your booking</p>
        <p className="mt-1 text-muted-foreground">
          Payment instructions and receipt upload are coming soon. For now,
          your booking will stay pending until an admin reviews it.
        </p>
        <Button className="mt-3" disabled>
          Upload payment (coming soon)
        </Button>
      </div>

      <div className="flex gap-3">
        <Button asChild variant="ghost">
          <Link href="/booking">Book another</Link>
        </Button>
        <Button asChild>
          <Link href="/my-bookings">View my bookings</Link>
        </Button>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
