import { notFound, redirect } from "next/navigation";

import { getBookingForCustomer } from "@/lib/data/bookings";
import { getPassForCustomer } from "@/lib/data/entrance-passes";
import { listActivePaymentMethods } from "@/lib/data/payment-methods";
import { isUserAdmin } from "@/lib/data/users";
import { createReceiptSignedUrl } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";

import { PaymentView, type PaymentSummary } from "./payment-view";

export const metadata = { title: "Payment Instructions" };

// [id] can be a booking or an entrance pass. Try both in parallel and branch
// on whichever one matches — separate tables with distinct uuids, so at most
// one returns a row for any given id.
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

  const [booking, pass, viewerIsAdmin, methods] = await Promise.all([
    getBookingForCustomer(id),
    getPassForCustomer(id),
    isUserAdmin(user.id),
    listActivePaymentMethods(),
  ]);

  let summary: PaymentSummary | null = null;
  let ownerId: string | null = null;
  let receiptPath: string | null = null;
  let kind: "booking" | "pass" | null = null;

  if (booking) {
    kind = "booking";
    ownerId = booking.user_id;
    receiptPath = booking.payment_receipt_url;
    summary = {
      kind: "booking",
      court: booking.court?.name ?? "—",
      date: booking.booking_date,
      startHour: booking.start_hour,
      endHour: booking.end_hour,
      totalAmount: Number(booking.total_amount),
      status: booking.status,
    };
  } else if (pass) {
    kind = "pass";
    ownerId = pass.user_id;
    receiptPath = pass.payment_receipt_url;
    summary = {
      kind: "pass",
      date: pass.pass_date,
      guestCount: pass.guest_count,
      totalAmount: Number(pass.total_amount),
      status: pass.status,
    };
  }

  // Unknown id, pass/booking owned by someone else (and caller isn't admin),
  // or a walk-in pass (user_id null) that no customer can view: treat as 404
  // so a customer can't probe other ids. Admins can view any.
  if (!summary || !kind) notFound();
  if (ownerId !== user.id && !viewerIsAdmin) notFound();

  let initialReceipt: { path: string; signedUrl: string | null } | null = null;
  if (receiptPath) {
    initialReceipt = {
      path: receiptPath,
      signedUrl: await createReceiptSignedUrl(receiptPath),
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <PaymentView
        kind={kind}
        entityId={id}
        summary={summary}
        methods={methods}
        initialReceipt={initialReceipt}
        isAdminViewer={viewerIsAdmin && ownerId !== user.id}
      />
    </main>
  );
}
