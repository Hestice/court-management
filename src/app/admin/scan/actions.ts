"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import {
  getBookingGuestByQrCode,
  getBookingGuestForScan,
  type BookingGuestForScan,
} from "@/lib/data/bookings";
import { logError } from "@/lib/logger";
import { checkPreset, formatRetryAfter } from "@/lib/rate-limit";
import { todayInFacility } from "@/lib/timezone";

import { redeemByIdSchema, redeemByQrSchema } from "./schema";

// Scanner result shape. The UI branches on `status`; each variant carries
// exactly the fields the matching result card needs, so the client never has
// to check for `undefined` on an unreachable branch.
export type ScanGuestSummary = {
  guest_id: string;
  booking_id: string;
  guest_number: number;
  guest_count: number;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  court_name: string;
  customer_display_name: string;
};

export type RedemptionResult =
  | {
      status: "success";
      guest: ScanGuestSummary;
      redeemed_at: string;
      override_date: boolean;
    }
  | {
      status: "already_redeemed";
      guest: ScanGuestSummary;
      redeemed_at: string;
      redeemed_by_name: string | null;
    }
  | {
      status: "date_mismatch";
      guest: ScanGuestSummary;
      today: string;
    }
  | { status: "not_eligible"; guest: ScanGuestSummary; reason: string }
  | { status: "not_found" }
  | { status: "rate_limited"; error: string }
  | { status: "error"; error: string };

// Derive a single "who is this for" string for the result card — registered
// customer name > walk-in name > email > fallback. Mirrors the display order
// the admin already sees on the booking detail page.
function customerDisplayName(
  guest: BookingGuestForScan,
): string {
  const b = guest.booking;
  if (!b) return "Guest";
  if (b.customer?.name?.trim()) return b.customer.name.trim();
  if (b.walk_in_name?.trim()) return b.walk_in_name.trim();
  if (b.customer?.email) return b.customer.email;
  return "Guest";
}

function toSummary(guest: BookingGuestForScan): ScanGuestSummary {
  const b = guest.booking;
  return {
    guest_id: guest.id,
    booking_id: guest.booking_id,
    guest_number: guest.guest_number,
    guest_count: b?.guest_count ?? guest.guest_number,
    booking_date: b?.booking_date ?? "",
    start_hour: b?.start_hour ?? 0,
    end_hour: b?.end_hour ?? 0,
    court_name: b?.court?.name ?? "—",
    customer_display_name: customerDisplayName(guest),
  };
}

function revalidateRedemption(bookingId: string) {
  revalidatePath("/admin/scan");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/my-bookings");
}

// Shared decision + write path, reached from both the QR-scan and the
// manual-id action. Centralizing means the date-mismatch rule, audit trail,
// and revalidation all live in one place.
async function performRedemption(
  guest: BookingGuestForScan,
  opts: {
    actorUserId: string;
    supabase: Awaited<
      ReturnType<typeof import("@/lib/supabase/server").createClient>
    >;
    overrideDateMismatch: boolean;
    source: "scan" | "manual";
  },
): Promise<RedemptionResult> {
  const { actorUserId, supabase, overrideDateMismatch, source } = opts;
  const summary = toSummary(guest);
  const booking = guest.booking;

  if (!booking) {
    await logAuditEvent("booking.guest_redeem_failed", {
      actorUserId,
      metadata: {
        guest_id: guest.id,
        source,
        reason: "booking_missing",
      },
    });
    return {
      status: "not_eligible",
      guest: summary,
      reason: "This QR is orphaned from its booking.",
    };
  }

  if (booking.status !== "confirmed") {
    await logAuditEvent("booking.guest_redeem_failed", {
      actorUserId,
      metadata: {
        guest_id: guest.id,
        booking_id: booking.id,
        source,
        reason: "booking_not_confirmed",
        booking_status: booking.status,
      },
    });
    return {
      status: "not_eligible",
      guest: summary,
      reason: `Booking is ${booking.status}, not confirmed.`,
    };
  }

  if (guest.redeemed_at) {
    const redeemerName =
      guest.redeemed_by_user?.name ?? guest.redeemed_by_user?.email ?? null;
    await logAuditEvent("booking.guest_redeem_failed", {
      actorUserId,
      metadata: {
        guest_id: guest.id,
        booking_id: booking.id,
        source,
        reason: "already_redeemed",
      },
    });
    return {
      status: "already_redeemed",
      guest: summary,
      redeemed_at: guest.redeemed_at,
      redeemed_by_name: redeemerName,
    };
  }

  const today = todayInFacility();
  const dateMismatch = booking.booking_date !== today;
  if (dateMismatch && !overrideDateMismatch) {
    // Not an audit-worthy "failure" — we're just asking the admin to confirm.
    // Recording every hover-then-cancel would swamp the audit log.
    return {
      status: "date_mismatch",
      guest: summary,
      today,
    };
  }

  const redeemedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("booking_guests")
    .update({ redeemed_at: redeemedAt, redeemed_by: actorUserId })
    .eq("id", guest.id)
    .is("redeemed_at", null);
  if (updateError) {
    logError("scan.redeem_update_failed", updateError, {
      guestId: guest.id,
      source,
    });
    return { status: "error", error: "Couldn't mark guest redeemed." };
  }

  await logAuditEvent("booking.guest_redeemed", {
    actorUserId,
    metadata: {
      booking_id: booking.id,
      guest_id: guest.id,
      source,
      date_override: dateMismatch ? { booking_date: booking.booking_date, today } : undefined,
    },
  });

  revalidateRedemption(booking.id);

  return {
    status: "success",
    guest: summary,
    redeemed_at: redeemedAt,
    override_date: dateMismatch,
  };
}

// Primary scan path — called from the camera feed on every QR decode (after
// client-side debounce). A tighter rate limit (60/min) caps a camera that
// locks onto the same code.
export async function redeemGuestByQrCode(
  qrCode: string,
  options: { overrideDateMismatch?: boolean } = {},
): Promise<RedemptionResult> {
  const parsed = redeemByQrSchema.safeParse({
    qr_code: qrCode,
    override_date_mismatch: options.overrideDateMismatch ?? false,
  });
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { status: "error", error: auth.error };
  const { supabase, userId } = auth;

  const rate = await checkPreset("scanRedeem", userId);
  if (!rate.allowed) {
    await logAuditEvent("rate_limit.hit", {
      actorUserId: userId,
      metadata: { preset: "scanRedeem" },
    });
    return {
      status: "rate_limited",
      error: `Scanning too fast. ${formatRetryAfter(rate.retryAfterSeconds)}`,
    };
  }

  const guest = await getBookingGuestByQrCode(parsed.data.qr_code);
  if (!guest) {
    await logAuditEvent("booking.guest_redeem_failed", {
      actorUserId: userId,
      metadata: { source: "scan", reason: "qr_not_found" },
    });
    return { status: "not_found" };
  }

  return performRedemption(guest, {
    actorUserId: userId,
    supabase,
    overrideDateMismatch: parsed.data.override_date_mismatch,
    source: "scan",
  });
}

// Manual-search path — same rules, looked up by guest id instead of qr_code.
export async function redeemGuestById(
  guestId: string,
  options: { overrideDateMismatch?: boolean } = {},
): Promise<RedemptionResult> {
  const parsed = redeemByIdSchema.safeParse({
    guest_id: guestId,
    override_date_mismatch: options.overrideDateMismatch ?? false,
  });
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { status: "error", error: auth.error };
  const { supabase, userId } = auth;

  const rate = await checkPreset("scanRedeem", userId);
  if (!rate.allowed) {
    await logAuditEvent("rate_limit.hit", {
      actorUserId: userId,
      metadata: { preset: "scanRedeem" },
    });
    return {
      status: "rate_limited",
      error: `Too many redemptions. ${formatRetryAfter(rate.retryAfterSeconds)}`,
    };
  }

  const guest = await getBookingGuestForScan(parsed.data.guest_id);
  if (!guest) {
    await logAuditEvent("booking.guest_redeem_failed", {
      actorUserId: userId,
      metadata: { source: "manual", reason: "guest_not_found", guest_id: guestId },
    });
    return { status: "not_found" };
  }

  return performRedemption(guest, {
    actorUserId: userId,
    supabase,
    overrideDateMismatch: parsed.data.override_date_mismatch,
    source: "manual",
  });
}
