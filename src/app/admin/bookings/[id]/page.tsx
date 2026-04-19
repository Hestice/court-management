import { notFound } from "next/navigation";

import { createReceiptSignedUrl } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import type { BookingRow, BookingStatus } from "../schema";
import { BookingDetailView, type ActivityEntry } from "./detail-view";

export const metadata = { title: "Booking Detail — Admin" };

type RawBooking = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  expires_at: string | null;
  created_at: string;
  payment_receipt_url: string | null;
  user_id: string | null;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  admin_notes: string | null;
  customer: { name: string | null; email: string } | null;
  court: { id: string; name: string; hourly_rate: number } | null;
};

type RawAuditLog = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string | null; email: string } | null;
};

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
];

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [bookingRes, settingsRes, courtsRes, auditRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_hour, end_hour, status, total_amount, expires_at, created_at, payment_receipt_url, user_id, walk_in_name, walk_in_phone, admin_notes, customer:users!bookings_user_id_fkey(name, email), court:courts!bookings_court_id_fkey(id, name, hourly_rate)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("facility_settings")
      .select("operating_hours_start, operating_hours_end, max_booking_duration_hours")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("courts")
      .select("id, name, hourly_rate, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    // audit_logs.metadata is JSONB; filter with the ->> operator so we only
    // fetch entries whose metadata.booking_id matches this row.
    supabase
      .from("audit_logs")
      .select(
        "id, action, metadata, created_at, actor:users!audit_logs_actor_user_id_fkey(name, email)",
      )
      .in("action", ACTIVITY_ACTIONS)
      .eq("metadata->>booking_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  if (bookingRes.error) {
    throw new Error(`Failed to load booking: ${bookingRes.error.message}`);
  }
  const booking = bookingRes.data as unknown as RawBooking | null;
  if (!booking) notFound();

  if (settingsRes.error) {
    throw new Error(`Failed to load settings: ${settingsRes.error.message}`);
  }
  if (courtsRes.error) {
    throw new Error(`Failed to load courts: ${courtsRes.error.message}`);
  }
  if (auditRes.error) {
    throw new Error(`Failed to load audit log: ${auditRes.error.message}`);
  }

  const row: BookingRow = {
    id: booking.id,
    booking_date: booking.booking_date,
    start_hour: booking.start_hour,
    end_hour: booking.end_hour,
    status: booking.status as BookingStatus,
    total_amount: Number(booking.total_amount),
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

  const receiptSignedUrl = booking.payment_receipt_url
    ? await createReceiptSignedUrl(booking.payment_receipt_url)
    : null;

  const activity: ActivityEntry[] = (
    (auditRes.data ?? []) as unknown as RawAuditLog[]
  ).map((a) => ({
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
        receiptSignedUrl={receiptSignedUrl}
        activity={activity}
        courts={courtsRes.data ?? []}
        operatingStart={settingsRes.data?.operating_hours_start ?? 8}
        operatingEnd={settingsRes.data?.operating_hours_end ?? 22}
        maxDuration={settingsRes.data?.max_booking_duration_hours ?? 5}
        today={todayInFacility()}
      />
    </main>
  );
}
