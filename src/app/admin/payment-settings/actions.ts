"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/actions";
import {
  getMaxPaymentMethodDisplayOrder,
  getPaymentMethod,
  listPaymentMethodIds,
  QR_BUCKET,
} from "@/lib/data/payment-methods";
import { convertToWebp, QR_CONVERT_DEFAULTS } from "@/lib/image-convert";
import {
  isAcceptedScreenshotMime,
  SERVER_CONVERTED_MAX_BYTES,
} from "@/lib/upload-validation";
import { logError } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import {
  paymentMethodFormSchema,
  type PaymentMethodFormValues,
} from "./schema";

export type ActionResult =
  | { success: true; id?: string }
  | { success: false; error: string };

const QR_FILENAME = "qr.webp";

// Admin-only FormData path: converts the uploaded QR (any accepted screenshot
// type) to WebP, uploads with upsert so re-uploads replace the old file, and
// returns the storage path written to payment_methods.qr_image_url.
async function uploadQrFile(
  file: File,
  methodId: string,
): Promise<{ path: string } | { error: string }> {
  if (!isAcceptedScreenshotMime(file.type)) {
    return { error: "QR image must be JPG, PNG, or WebP." };
  }
  if (file.size === 0) {
    return { error: "QR image file is empty." };
  }
  // Admin QR upload cap is small on purpose — these are QR codes, not photos.
  if (file.size > 2 * 1024 * 1024) {
    return { error: "QR image must be 2MB or less." };
  }

  let converted;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    converted = await convertToWebp(bytes, QR_CONVERT_DEFAULTS);
  } catch (err) {
    logError("payment_methods.qr_convert_failed", err, {
      methodId,
      size: file.size,
      mime: file.type,
    });
    return { error: "Couldn't process that image. Try a different file." };
  }

  if (converted.byteLength > SERVER_CONVERTED_MAX_BYTES) {
    return { error: "QR image is too large after conversion." };
  }

  // Admin identity is enforced by middleware + the outer action's admin-only
  // mutations; the service client here only performs the file write. RLS on
  // storage.objects evaluates inconsistently inside Supabase Storage's own
  // connection pool (cached query plans), which would otherwise reject valid
  // admin writes with "new row violates row-level security policy".
  const service = createServiceClient();
  const path = `${methodId}/${QR_FILENAME}`;
  const { error: uploadError } = await service.storage
    .from(QR_BUCKET)
    .upload(path, converted.buffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (uploadError) {
    logError("payment_methods.qr_upload_failed", uploadError, { methodId });
    return { error: "Failed to upload QR image." };
  }

  return { path };
}

async function deleteQrFile(path: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.storage.from(QR_BUCKET).remove([path]);
  if (error) {
    logError("payment_methods.qr_delete_failed", error, { path });
  }
}

function parseFormFields(formData: FormData): {
  values: PaymentMethodFormValues | null;
  error?: string;
} {
  const raw = {
    label: String(formData.get("label") ?? ""),
    account_details: String(formData.get("account_details") ?? ""),
    is_active: formData.get("is_active") === "true",
  };
  const parsed = paymentMethodFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { values: null, error: parsed.error.issues[0].message };
  }
  return { values: parsed.data };
}

function getOptionalFile(formData: FormData, key: string): File | null {
  const entry = formData.get(key);
  if (!(entry instanceof File)) return null;
  // Empty-input Files show up with size 0 in FormData; treat as "no file".
  if (entry.size === 0) return null;
  return entry;
}

export async function createPaymentMethod(
  formData: FormData,
): Promise<ActionResult> {
  const { values, error } = parseFormFields(formData);
  if (!values) return { success: false, error: error ?? "Invalid input." };

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  // Highest display_order + 1 keeps new methods at the bottom of the list
  // without disturbing admin's existing order.
  const nextOrder = (await getMaxPaymentMethodDisplayOrder()) + 1;

  const { data: inserted, error: insertError } = await supabase
    .from("payment_methods")
    .insert({
      label: values.label,
      account_details: values.account_details,
      is_active: values.is_active,
      display_order: nextOrder,
    })
    .select("id")
    .single();
  if (insertError) {
    logError("payment_methods.insert_failed", insertError);
    return { success: false, error: "Couldn't create payment method." };
  }

  const file = getOptionalFile(formData, "qr_file");
  if (file) {
    const result = await uploadQrFile(file, inserted.id);
    if ("error" in result) {
      // Roll back the row so we don't leave a halfway-created method.
      await supabase.from("payment_methods").delete().eq("id", inserted.id);
      return { success: false, error: result.error };
    }
    const { error: updateError } = await supabase
      .from("payment_methods")
      .update({ qr_image_url: result.path })
      .eq("id", inserted.id);
    if (updateError) {
      logError("payment_methods.qr_link_failed", updateError, {
        methodId: inserted.id,
      });
      await deleteQrFile(result.path);
      await supabase.from("payment_methods").delete().eq("id", inserted.id);
      return { success: false, error: "Couldn't save QR reference." };
    }
  }

  revalidatePath("/admin/payment-settings");
  revalidatePath("/payment", "layout");
  return { success: true, id: inserted.id };
}

export async function updatePaymentMethod(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const { values, error } = parseFormFields(formData);
  if (!values) return { success: false, error: error ?? "Invalid input." };

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  // Need the existing row so we know the previous QR path if the admin is
  // replacing or removing it.
  const existing = await getPaymentMethod(id);
  if (!existing) return { success: false, error: "Payment method not found." };

  const removeQr = formData.get("remove_qr") === "true";
  const file = getOptionalFile(formData, "qr_file");

  let nextQrPath: string | null | undefined = undefined; // undefined = leave unchanged

  if (file) {
    const result = await uploadQrFile(file, id);
    if ("error" in result) return { success: false, error: result.error };
    nextQrPath = result.path;
  } else if (removeQr && existing.qr_image_url) {
    await deleteQrFile(existing.qr_image_url);
    nextQrPath = null;
  }

  const { error: updateError } = await supabase
    .from("payment_methods")
    .update({
      label: values.label,
      account_details: values.account_details,
      is_active: values.is_active,
      ...(nextQrPath !== undefined ? { qr_image_url: nextQrPath } : {}),
    })
    .eq("id", id);
  if (updateError) {
    logError("payment_methods.update_failed", updateError, { id });
    return { success: false, error: "Couldn't update payment method." };
  }

  revalidatePath("/admin/payment-settings");
  revalidatePath("/payment", "layout");
  return { success: true };
}

export async function deletePaymentMethod(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const existing = await getPaymentMethod(id);

  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) {
    logError("payment_methods.delete_failed", error, { id });
    return { success: false, error: "Couldn't delete payment method." };
  }

  if (existing?.qr_image_url) {
    await deleteQrFile(existing.qr_image_url);
  }

  revalidatePath("/admin/payment-settings");
  revalidatePath("/payment", "layout");
  return { success: true };
}

// Persist a full ordering of IDs. We write sequential display_order values
// (0..n-1) so we never have to reason about ties; the view sends the exact
// order it wants materialized.
export async function reorderPaymentMethods(
  ids: string[],
): Promise<ActionResult> {
  if (ids.length === 0) return { success: true };

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  // Verify the IDs match existing rows. Without this, a client could submit
  // an incomplete list and silently drop methods off the end of the ordering.
  const existingIds = await listPaymentMethodIds();
  const existingSet = new Set(existingIds);
  if (
    ids.length !== existingSet.size ||
    !ids.every((id) => existingSet.has(id))
  ) {
    return {
      success: false,
      error: "Order is out of sync with the server. Refresh and try again.",
    };
  }

  // RLS already restricts updates to admin; we issue individual UPDATEs so
  // each row's check constraint runs against the correct value.
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("payment_methods")
      .update({ display_order: i })
      .eq("id", ids[i]);
    if (error) {
      logError("payment_methods.reorder_failed", error, { id: ids[i] });
      return { success: false, error: "Couldn't save order." };
    }
  }

  revalidatePath("/admin/payment-settings");
  revalidatePath("/payment", "layout");
  return { success: true };
}
