import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

export type AuditLogRaw = {
  id: string;
  actor_user_id: string | null;
  action: string;
  metadata: unknown;
  ip_address: string | null;
  created_at: string;
  actor: { name: string | null; email: string } | null;
};

export type BookingActivityRaw = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string | null; email: string } | null;
};

const LIST_SELECT =
  "id, actor_user_id, action, metadata, ip_address, created_at, actor:users!audit_logs_actor_user_id_fkey(name, email)";

const BOOKING_ACTIVITY_SELECT =
  "id, action, metadata, created_at, actor:users!audit_logs_actor_user_id_fkey(name, email)";

const DEFAULT_PAGE_LIMIT = 500;
const BOOKING_ACTIVITY_LIMIT = 200;

export const listAuditLogs = cache(
  async (
    params: { limit?: number } = {},
  ): Promise<AuditLogRaw[]> => {
    const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwDataError("data.audit_logs.list", error, { limit });
    return (data ?? []) as unknown as AuditLogRaw[];
  },
);

// Booking-scoped activity feed — filters audit_logs.metadata->>booking_id to
// the ids we care about. Actions list is fixed at the call site (in the
// bookings detail page) so this helper stays generic.
export const listBookingActivity = cache(
  async (params: {
    bookingId: string;
    actions: readonly string[];
  }): Promise<BookingActivityRaw[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select(BOOKING_ACTIVITY_SELECT)
      .in("action", [...params.actions])
      .eq("metadata->>booking_id", params.bookingId)
      .order("created_at", { ascending: true })
      .limit(BOOKING_ACTIVITY_LIMIT);
    if (error)
      throwDataError("data.audit_logs.list_booking_activity", error, {
        bookingId: params.bookingId,
      });
    return (data ?? []) as unknown as BookingActivityRaw[];
  },
);

