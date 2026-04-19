"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import { getBookingForOwnership } from "@/lib/data/bookings";
import { getPassForOwnership } from "@/lib/data/entrance-passes";
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

export type UploadReceiptResult =
  | { success: true; path: string; signedUrl: string | null }
  | { success: false; error: string };

const RECEIPT_FILENAME = "receipt.webp";

export async function getReceiptSignedUrl(
  path: string,
): Promise<string | null> {
  return createReceiptSignedUrl(path);
}

// Upload a receipt for either a booking or an entrance pass. Path prefix
// differs between the two so admin-side queries don't need to guess — bookings
// land at {user_id}/{booking_id}/receipt.webp and passes at
// {user_id}/pass-{pass_id}/receipt.webp.
export async function uploadReceipt(
  kind: "booking" | "pass",
  entityId: string,
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

  // Load the entity and check ownership. Admins view any payment page but
  // don't upload on behalf of customers — enforcing "owner only" for uploads
  // keeps the audit trail clean.
  const entity =
    kind === "booking"
      ? await getBookingForOwnership(entityId)
      : await getPassForOwnership(entityId);
  if (!entity) {
    return {
      success: false,
      error: kind === "pass" ? "Pass not found." : "Booking not found.",
    };
  }
  if (entity.user_id !== userId) {
    return {
      success: false,
      error:
        kind === "pass"
          ? "You can only upload for your own pass."
          : "You can only upload for your own booking.",
    };
  }
  if (entity.status !== "pending") {
    return {
      success: false,
      error: `${kind === "pass" ? "Pass" : "Booking"} is already ${entity.status}; upload is no longer available.`,
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
      kind,
      entityId,
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

  // Fixed path — same filename for every upload for this entity — so a new
  // upload overwrites the prior receipt without leaving orphans. Ownership is
  // encoded in the first path segment (and enforced above via the explicit
  // user_id === userId check). Service client for the actual write because
  // Supabase Storage's RLS is unreliable under its own connection pool.
  const folder = kind === "pass" ? `pass-${entityId}` : entityId;
  const path = `${userId}/${folder}/${RECEIPT_FILENAME}`;

  const service = createServiceClient();
  const { error: uploadError } = await service.storage
    .from(RECEIPT_BUCKET)
    .upload(path, converted.buffer, {
      contentType: "image/webp",
      upsert: true,
    });
  if (uploadError) {
    logError("payment.receipt_upload_failed", uploadError, { kind, entityId });
    return { success: false, error: "Failed to upload receipt." };
  }

  const table = kind === "pass" ? "entrance_passes" : "bookings";
  const { data: updated, error: updateError } = await service
    .from(table)
    .update({ payment_receipt_url: path })
    .eq("id", entityId)
    .select("id")
    .maybeSingle();
  if (updateError) {
    logError("payment.receipt_persist_failed", updateError, {
      kind,
      entityId,
    });
    return { success: false, error: "Couldn't save receipt reference." };
  }
  if (!updated) {
    logError(
      "payment.receipt_persist_no_row",
      new Error("update affected 0 rows"),
      { kind, entityId },
    );
    return { success: false, error: "Couldn't save receipt reference." };
  }

  if (kind === "pass") {
    await logAuditEvent("pass.receipt_uploaded", {
      actorUserId: userId,
      metadata: { pass_id: entityId },
    });
  } else {
    await logAuditEvent("booking.receipt_uploaded", {
      actorUserId: userId,
      metadata: { booking_id: entityId },
    });
  }

  const signedUrl = await createReceiptSignedUrl(path);

  revalidatePath(`/payment/${entityId}`);
  if (kind === "pass") {
    revalidatePath("/my-passes");
    revalidatePath(`/admin/passes/${entityId}`);
    revalidatePath("/admin/passes");
  } else {
    revalidatePath("/my-bookings");
    revalidatePath(`/admin/bookings/${entityId}`);
    revalidatePath("/admin/bookings");
  }
  return { success: true, path, signedUrl };
}
