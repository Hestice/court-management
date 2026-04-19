import { logError } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

export const RECEIPT_BUCKET = "payment-receipts";
export const RECEIPT_SIGNED_URL_TTL = 60 * 60;

// Delete the stored receipt for a booking. Every terminal booking action
// (approve / reject / cancel / expire) calls this so orphaned files don't
// pile up in the bucket. Called after the DB state has already moved — a
// storage failure here should NOT roll back the DB change, so this is
// intentionally fire-and-forget: we log but swallow errors.
export async function deleteBookingReceipt(
  path: string | null | undefined,
): Promise<void> {
  if (!path) return;
  try {
    const service = createServiceClient();
    const { error } = await service.storage
      .from(RECEIPT_BUCKET)
      .remove([path]);
    if (error) {
      logError("booking.receipt_delete_failed", error, { path });
    }
  } catch (err) {
    logError("booking.receipt_delete_exception", err, { path });
  }
}

// Short-lived signed URL for rendering a private receipt. Uses the service
// client so admin-side rendering works without maintaining receipt-select
// RLS for admins (which would couple storage RLS to public.users in a way
// Supabase Storage evaluates unreliably — see 0012 migration).
export async function createReceiptSignedUrl(
  path: string,
  ttlSeconds = RECEIPT_SIGNED_URL_TTL,
): Promise<string | null> {
  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) {
    logError(
      "booking.receipt_sign_failed",
      error ?? new Error("empty response"),
      { path },
    );
    return null;
  }
  return data.signedUrl;
}
