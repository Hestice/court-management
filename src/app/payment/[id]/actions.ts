"use server";

import { revalidatePath } from "next/cache";

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
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type UploadReceiptResult =
  | { success: true; path: string; signedUrl: string | null }
  | { success: false; error: string };

const RECEIPT_BUCKET = "payment-receipts";
const RECEIPT_FILENAME = "receipt.webp";
const RECEIPT_SIGNED_URL_TTL = 60 * 60;

// Sign a receipt for private display. The bucket is private, so the UI never
// holds a permanent URL — signed URLs are requested on demand and expire.
// Uses the service client so signing works regardless of the caller's role
// (admins viewing customer receipts rely on this too).
async function signReceiptUrl(path: string): Promise<string | null> {
  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, RECEIPT_SIGNED_URL_TTL);
  if (error || !data) {
    logError("payment.sign_receipt_failed", error ?? new Error("empty"), {
      path,
    });
    return null;
  }
  return data.signedUrl;
}

export async function getReceiptSignedUrl(
  path: string,
): Promise<string | null> {
  return signReceiptUrl(path);
}

export async function uploadReceipt(
  bookingId: string,
  formData: FormData,
): Promise<UploadReceiptResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const rate = await checkPreset("fileUpload", user.id);
  if (!rate.allowed) {
    return {
      success: false,
      error: `You've hit the upload rate limit. ${formatRetryAfter(rate.retryAfterSeconds)}`,
    };
  }

  // Load the booking and check ownership. Admins can view any payment page
  // but are not intended to upload on behalf of customers — enforcing "owner
  // only" for uploads keeps the audit trail clean (the receipt always came
  // from the customer's own session).
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, user_id, status, payment_receipt_url")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) return { success: false, error: bookingError.message };
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.user_id !== user.id) {
    return { success: false, error: "You can only upload for your own booking." };
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
  // Mirror the client-side cap. A malicious client bypassing the UI will still
  // be rejected before we spend time in sharp.
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

  // Fixed path — same filename for every upload for this booking — so a new
  // upload overwrites the prior receipt without leaving orphans. Ownership is
  // encoded in the first path segment for bookkeeping, and enforced above via
  // the explicit booking.user_id === user.id check. We use the service client
  // for the actual write because Supabase Storage's RLS evaluation is unstable
  // under its own connection pool (cached plans reject valid writes).
  const path = `${user.id}/${bookingId}/${RECEIPT_FILENAME}`;

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

  // Record the path (not a URL) — we sign on demand when rendering. Use the
  // service client because the customer-scoped `bookings` RLS only permits
  // admin updates; a user-scoped UPDATE here would silently affect 0 rows
  // (RLS filters without raising), leaving the receipt file in storage but
  // no DB pointer for /my-bookings or the admin to find. Ownership + pending
  // status have already been checked above, so bypassing RLS is safe.
  // `.select()` forces PostgREST to return the updated row, turning a silent
  // 0-row outcome into an obvious error if this assumption ever breaks.
  const { data: updated, error: updateError } = await service
    .from("bookings")
    .update({ payment_receipt_url: path })
    .eq("id", bookingId)
    .select("id")
    .maybeSingle();
  if (updateError) {
    logError("payment.receipt_persist_failed", updateError, { bookingId });
    return { success: false, error: updateError.message };
  }
  if (!updated) {
    logError(
      "payment.receipt_persist_no_row",
      new Error("update affected 0 rows"),
      { bookingId },
    );
    return { success: false, error: "Couldn't save receipt reference." };
  }

  const signedUrl = await signReceiptUrl(path);

  revalidatePath(`/payment/${bookingId}`);
  revalidatePath("/my-bookings");
  return { success: true, path, signedUrl };
}
