import { notFound } from "next/navigation";

import { listBookingActivity } from "@/lib/data/audit-logs";
import {
  getBookingForAdmin,
  listBookingGuestsForBooking,
} from "@/lib/data/bookings";
import { listActiveCourts } from "@/lib/data/courts";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { createReceiptSignedUrl } from "@/lib/receipt";
import { todayInFacility } from "@/lib/timezone";

import type { BookingRow, BookingStatus } from "../schema";
import {
  BookingDetailView,
  type ActivityEntry,
  type BookingGuestRow,
} from "./detail-view";

export const metadata = { title: "Booking Detail — Admin" };

const ACTIVITY_ACTIONS = [
  "booking.created",
  "booking.walkin_created",
  "booking.receipt_uploaded",
  "booking.approved",
  "booking.rejected",
  "booking.rescheduled",
  "booking.cancelled",
  "booking.completed",
  "booking.note_updated",
  "booking.guest_count_changed",
  "booking.guest_redeemed",
] as const;

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [booking, settings, courts, activity, guests] = await Promise.all([
    getBookingForAdmin(id),
    getFacilitySettings(),
    listActiveCourts(),
    listBookingActivity({ bookingId: id, actions: ACTIVITY_ACTIONS }),
    listBookingGuestsForBooking(id),
  ]);

  if (!booking) notFound();

  const row: BookingRow = {
    id: booking.id,
    booking_date: booking.booking_date,
    start_hour: booking.start_hour,
    end_hour: booking.end_hour,
    status: booking.status as BookingStatus,
    total_amount: Number(booking.total_amount),
    guest_count: booking.guest_count,
    expires_at: booking.expires_at,
    created_at: booking.created_at,
    payment_receipt_url: booking.payment_receipt_url,
    user_id: booking.user_id,
    walk_in_name: booking.walk_in_name,
    walk_in_phone: booking.walk_in_phone,
    customer_name: booking.customer?.name ?? null,
    customer_email: booking.customer?.email ?? null,
    court_id: booking.court?.id ?? "",
    court_name: booking.court?.name ?? "—",
    court_hourly_rate: Number(booking.court?.hourly_rate ?? 0),
    admin_notes: booking.admin_notes,
  };

  const guestRows: BookingGuestRow[] = guests.map((g) => ({
    id: g.id,
    guest_number: g.guest_number,
    qr_code: g.qr_code,
    redeemed_at: g.redeemed_at,
    redeemed_by_name: g.redeemed_by_user?.name ?? null,
    redeemed_by_email: g.redeemed_by_user?.email ?? null,
  }));

  const receiptSignedUrl = booking.payment_receipt_url
    ? await createReceiptSignedUrl(booking.payment_receipt_url)
    : null;

  const activityEntries: ActivityEntry[] = activity.map((a) => ({
    id: a.id,
    action: a.action,
    createdAt: a.created_at,
    actorName: a.actor?.name ?? a.actor?.email ?? null,
    metadata: a.metadata,
  }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <BookingDetailView
        booking={row}
        guests={guestRows}
        receiptSignedUrl={receiptSignedUrl}
        activity={activityEntries}
        courts={courts}
        operatingStart={settings.operating_hours_start}
        operatingEnd={settings.operating_hours_end}
        maxDuration={settings.max_booking_duration_hours}
        entrancePricePerGuest={settings.entrance_pass_price_per_guest}
        today={todayInFacility()}
      />
    </main>
  );
}
