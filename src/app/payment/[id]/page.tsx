import { notFound, redirect } from "next/navigation";

import { getBookingForCustomer } from "@/lib/data/bookings";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { listActivePaymentMethods } from "@/lib/data/payment-methods";
import { isUserAdmin } from "@/lib/data/users";
import { createReceiptSignedUrl } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";

import { PaymentView, type PaymentSummary } from "./payment-view";

export const metadata = { title: "Payment Instructions" };

// Booking-only for now. The union-typed PaymentSummary and this loader keep
// the door open for future entity kinds (e.g. memberships) without churning
// the view component when a new one lands.
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/payment/${id}`);

  const [booking, viewerIsAdmin, methods, settings] = await Promise.all([
    getBookingForCustomer(id),
    isUserAdmin(user.id),
    listActivePaymentMethods(),
    getFacilitySettings(),
  ]);

  // Unknown id, a booking owned by someone else (and the caller isn't admin),
  // or a walk-in booking (user_id null) that no customer can view: treat as
  // 404 so probing is indistinguishable from "not yours".
  if (!booking) notFound();
  if (booking.user_id !== user.id && !viewerIsAdmin) notFound();

  let initialReceipt: { path: string; signedUrl: string | null } | null = null;
  if (booking.payment_receipt_url) {
    initialReceipt = {
      path: booking.payment_receipt_url,
      signedUrl: await createReceiptSignedUrl(booking.payment_receipt_url),
    };
  }

  const summary: PaymentSummary = {
    kind: "booking",
    court: booking.court?.name ?? "—",
    hourlyRate: Number(booking.court?.hourly_rate ?? 0),
    date: booking.booking_date,
    startHour: booking.start_hour,
    endHour: booking.end_hour,
    guestCount: booking.guest_count,
    entrancePricePerGuest: Number(settings.entrance_pass_price_per_guest),
    totalAmount: Number(booking.total_amount),
    status: booking.status,
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <PaymentView
        bookingId={booking.id}
        summary={summary}
        methods={methods}
        initialReceipt={initialReceipt}
        isAdminViewer={viewerIsAdmin && booking.user_id !== user.id}
      />
    </main>
  );
}
