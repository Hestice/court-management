"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import {
  getBookingForGuestLoad,
  getBookingForOwnership,
} from "@/lib/data/bookings";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { getCourt } from "@/lib/data/courts";
import {
  convertToWebp,
  RECEIPT_CONVERT_DEFAULTS,
} from "@/lib/image-convert";
import {
  CLIENT_UPLOAD_MAX_BYTES,
  isAcceptedScreenshotMime,
  SERVER_CONVERTED_MAX_BYTES,
} from "@/lib/upload-validation";
import { logError } from "@/lib/logger";
import { checkPreset, formatRetryAfter } from "@/lib/rate-limit";
import { createReceiptSignedUrl, RECEIPT_BUCKET } from "@/lib/receipt";
import { createServiceClient } from "@/lib/supabase/service";

import { editGuestCountSchema, type EditGuestCountValues } from "./schema";

export type UploadReceiptResult =
  | { success: true; path: string; signedUrl: string | null }
  | { success: false; error: string };

export type EditGuestCountResult =
  | { success: true; totalAmount: number; guestCount: number }
  | { success: false; error: string };

const RECEIPT_FILENAME = "receipt.webp";

export async function getReceiptSignedUrl(
  path: string,
): Promise<string | null> {
  return createReceiptSignedUrl(path);
}

// Upload a payment receipt for a booking. Customer-only write — admins view
// this page but don't upload on behalf of customers, keeping the audit trail
// clean. The path is a fixed per-booking location so replacements overwrite
// the prior receipt instead of leaving orphans.
export async function uploadReceipt(
  bookingId: string,
  formData: FormData,
): Promise<UploadReceiptResult> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { userId } = auth;

  const rate = await checkPreset("fileUpload", userId);
  if (!rate.allowed) {
    return {
      success: false,
      error: `You've hit the upload rate limit. ${formatRetryAfter(rate.retryAfterSeconds)}`,
    };
  }

  const booking = await getBookingForOwnership(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.user_id !== userId) {
    return {
      success: false,
      error: "You can only upload for your own booking.",
    };
  }
  if (booking.status !== "pending") {
    return {
      success: false,
      error: `Booking is already ${booking.status}; upload is no longer available.`,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Please attach a screenshot." };
  }
  if (!isAcceptedScreenshotMime(file.type)) {
    return {
      success: false,
      error: "Please upload a screenshot of your payment (image only).",
    };
  }
  if (file.size > CLIENT_UPLOAD_MAX_BYTES) {
    return {
      success: false,
      error: "Image is too large. Maximum size is 10MB.",
    };
  }

  let converted;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    converted = await convertToWebp(bytes, RECEIPT_CONVERT_DEFAULTS);
  } catch (err) {
    logError("payment.receipt_convert_failed", err, {
      bookingId,
      size: file.size,
      mime: file.type,
    });
    return {
      success: false,
      error: "Couldn't process that image. Try a different screenshot.",
    };
  }

  if (converted.byteLength > SERVER_CONVERTED_MAX_BYTES) {
    return {
      success: false,
      error: "Image is unusually large after conversion. Try a smaller one.",
    };
  }

  const path = `${userId}/${bookingId}/${RECEIPT_FILENAME}`;

  const service = createServiceClient();
  const { error: uploadError } = await service.storage
    .from(RECEIPT_BUCKET)
    .upload(path, converted.buffer, {
      contentType: "image/webp",
      upsert: true,
    });
  if (uploadError) {
    logError("payment.receipt_upload_failed", uploadError, { bookingId });
    return { success: false, error: "Failed to upload receipt." };
  }

  // Service client for the UPDATE because bookings RLS only permits admin
  // UPDATEs. Ownership + pending status are already verified above. `.select()`
  // turns a silent 0-row outcome into an obvious error if this ever breaks.
  const { data: updated, error: updateError } = await service
    .from("bookings")
    .update({ payment_receipt_url: path })
    .eq("id", bookingId)
    .select("id")
    .maybeSingle();
  if (updateError) {
    logError("payment.receipt_persist_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't save receipt reference." };
  }
  if (!updated) {
    logError(
      "payment.receipt_persist_no_row",
      new Error("update affected 0 rows"),
      { bookingId },
    );
    return { success: false, error: "Couldn't save receipt reference." };
  }

  await logAuditEvent("booking.receipt_uploaded", {
    actorUserId: userId,
    metadata: { booking_id: bookingId },
  });

  const signedUrl = await createReceiptSignedUrl(path);

  revalidatePath(`/payment/${bookingId}`);
  revalidatePath("/my-bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  return { success: true, path, signedUrl };
}

// Customer-side guest count edit. Locked once a receipt is uploaded — from
// that point on the admin is the one making adjustments (the admin path lives
// in /admin/bookings actions). Recomputes total_amount server-side.
export async function editBookingGuestCount(
  bookingId: string,
  values: EditGuestCountValues,
): Promise<EditGuestCountResult> {
  const parsed = editGuestCountSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { guest_count } = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const booking = await getBookingForGuestLoad(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.user_id !== userId) {
    return { success: false, error: "You can only edit your own booking." };
  }
  if (booking.status !== "pending") {
    return {
      success: false,
      error: `Booking is already ${booking.status}; guest count is locked.`,
    };
  }
  if (booking.payment_receipt_url) {
    return {
      success: false,
      error:
        "Receipt already uploaded. Contact admin to adjust guest count at the facility.",
    };
  }

  // Reload full dimensions so we can recompute total_amount authoritatively.
  const { data: fullRow, error: loadError } = await supabase
    .from("bookings")
    .select("court_id, start_hour, end_hour")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadError || !fullRow) {
    logError("booking.guest_count_load_failed", loadError ?? null, {
      bookingId,
    });
    return { success: false, error: "Couldn't load booking." };
  }

  const [court, settings] = await Promise.all([
    getCourt(fullRow.court_id),
    getFacilitySettings(),
  ]);
  if (!court) return { success: false, error: "Court not found." };

  const hours = fullRow.end_hour - fullRow.start_hour;
  const total_amount =
    Number(court.hourly_rate) * hours +
    Number(settings.entrance_pass_price_per_guest) * guest_count;

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ guest_count, total_amount })
    .eq("id", bookingId);
  if (updateError) {
    logError("booking.guest_count_update_failed", updateError, { bookingId });
    return { success: false, error: "Couldn't update guest count." };
  }

  await logAuditEvent("booking.guest_count_changed", {
    actorUserId: userId,
    metadata: {
      booking_id: bookingId,
      from: booking.guest_count,
      to: guest_count,
    },
  });

  revalidatePath(`/payment/${bookingId}`);
  revalidatePath("/my-bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { success: true, totalAmount: total_amount, guestCount: guest_count };
}
