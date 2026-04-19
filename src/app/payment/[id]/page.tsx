import { notFound, redirect } from "next/navigation";

import { getBookingForCustomer } from "@/lib/data/bookings";
import { listActivePaymentMethods } from "@/lib/data/payment-methods";
import { isUserAdmin } from "@/lib/data/users";
import { createReceiptSignedUrl } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";

import { PaymentView } from "./payment-view";

export const metadata = { title: "Payment Instructions" };

// Entry point for the /payment/[id] landing page. For now only bookings are
// supported; when entrance-pass support lands the loader will branch on the
// id (or take a `?type=pass` hint) and return either shape to <PaymentView>.
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

  const [booking, viewerIsAdmin, methods] = await Promise.all([
    getBookingForCustomer(id),
    isUserAdmin(user.id),
    listActivePaymentMethods(),
  ]);

  // Unknown booking or a booking owned by someone else (and the caller isn't
  // an admin): treat as not found. Intentionally indistinguishable so a
  // customer can't probe other users' booking IDs.
  if (!booking) notFound();
  if (booking.user_id !== user.id && !viewerIsAdmin) notFound();

  // Sign the current receipt (if any) so the view can render a preview right
  // away. Signed URLs expire — the client re-signs via a server action if the
  // user uploads a new file. The helper uses the service client so admins can
  // view their customers' receipts on this page too.
  let initialReceipt: { path: string; signedUrl: string | null } | null = null;
  if (booking.payment_receipt_url) {
    initialReceipt = {
      path: booking.payment_receipt_url,
      signedUrl: await createReceiptSignedUrl(booking.payment_receipt_url),
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <PaymentView
        bookingId={booking.id}
        summary={{
          court: booking.court?.name ?? "—",
          date: booking.booking_date,
          startHour: booking.start_hour,
          endHour: booking.end_hour,
          totalAmount: Number(booking.total_amount),
          status: booking.status,
        }}
        methods={methods}
        initialReceipt={initialReceipt}
        isAdminViewer={viewerIsAdmin && booking.user_id !== user.id}
      />
    </main>
  );
}
