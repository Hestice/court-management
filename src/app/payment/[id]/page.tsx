import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { PaymentView, type PaymentMethodForCustomer } from "./payment-view";

export const metadata = { title: "Payment Instructions" };

type BookingWithCourt = {
  id: string;
  user_id: string | null;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  payment_receipt_url: string | null;
  court: { name: string } | null;
};

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

  const [{ data: bookingRaw, error: bookingError }, { data: profile }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, user_id, booking_date, start_hour, end_hour, status, total_amount, payment_receipt_url, court:courts!bookings_court_id_fkey(name)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
    ]);

  if (bookingError) {
    throw new Error(`Failed to load booking: ${bookingError.message}`);
  }

  const booking = bookingRaw as unknown as BookingWithCourt | null;
  const isAdmin = profile?.role === "admin";

  // Unknown booking or a booking owned by someone else (and the caller isn't
  // an admin): treat as not found. Intentionally indistinguishable so a
  // customer can't probe other users' booking IDs.
  if (!booking) notFound();
  if (booking.user_id !== user.id && !isAdmin) notFound();

  // Only active methods, ordered the way admin set. RLS also enforces this
  // for non-admin reads, but filtering here keeps the query explicit.
  const { data: methodsRaw, error: methodsError } = await supabase
    .from("payment_methods")
    .select("id, label, account_details, qr_image_url, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (methodsError) {
    throw new Error(`Failed to load payment methods: ${methodsError.message}`);
  }

  const methods: PaymentMethodForCustomer[] = (methodsRaw ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    account_details: m.account_details,
    qr_public_url: m.qr_image_url
      ? supabase.storage.from("payment-qrs").getPublicUrl(m.qr_image_url).data
          .publicUrl
      : null,
  }));

  // Sign the current receipt (if any) so the view can render a preview right
  // away. Signed URLs expire — the client re-signs via a server action if the
  // user uploads a new file. Service client so admins can also view their
  // customers' receipts on this page.
  let initialReceipt: { path: string; signedUrl: string | null } | null = null;
  if (booking.payment_receipt_url) {
    const service = createServiceClient();
    const { data: signed } = await service.storage
      .from("payment-receipts")
      .createSignedUrl(booking.payment_receipt_url, 60 * 60);
    initialReceipt = {
      path: booking.payment_receipt_url,
      signedUrl: signed?.signedUrl ?? null,
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
        isAdminViewer={isAdmin && booking.user_id !== user.id}
      />
    </main>
  );
}
