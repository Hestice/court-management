import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

export const QR_BUCKET = "payment-qrs";

export type PaymentMethodRaw = {
  id: string;
  label: string;
  account_details: string;
  display_order: number;
  is_active: boolean;
  qr_image_url: string | null;
};

export type PaymentMethod = {
  id: string;
  label: string;
  account_details: string;
  display_order: number;
  is_active: boolean;
  qr_path: string | null;
  qr_public_url: string | null;
};

export type PaymentMethodForCustomer = {
  id: string;
  label: string;
  account_details: string;
  qr_public_url: string | null;
};

// Every payment method regardless of status, ordered for the admin UI.
export const listPaymentMethods = cache(async (): Promise<PaymentMethod[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, label, account_details, display_order, is_active, qr_image_url")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throwDataError("data.payment_methods.list", error);
  return (data ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    account_details: m.account_details,
    display_order: m.display_order,
    is_active: m.is_active,
    qr_path: m.qr_image_url,
    qr_public_url: m.qr_image_url
      ? supabase.storage.from(QR_BUCKET).getPublicUrl(m.qr_image_url).data
          .publicUrl
      : null,
  }));
});

// Active methods only — what customers see on the /payment/[id] page. Order
// mirrors the admin-defined display order; ties broken by created_at so new
// entries land at the bottom until reordered.
export const listActivePaymentMethods = cache(
  async (): Promise<PaymentMethodForCustomer[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payment_methods")
      .select("id, label, account_details, qr_image_url, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throwDataError("data.payment_methods.list_active", error);
    return (data ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      account_details: m.account_details,
      qr_public_url: m.qr_image_url
        ? supabase.storage.from(QR_BUCKET).getPublicUrl(m.qr_image_url).data
            .publicUrl
        : null,
    }));
  },
);

export async function getPaymentMethod(
  id: string,
): Promise<{ id: string; qr_image_url: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, qr_image_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDataError("data.payment_methods.get", error, { id });
  return data ?? null;
}

export async function getMaxPaymentMethodDisplayOrder(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwDataError("data.payment_methods.max_display_order", error);
  return data?.display_order ?? -1;
}

export async function listPaymentMethodIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id");
  if (error) throwDataError("data.payment_methods.list_ids", error);
  return (data ?? []).map((r) => r.id);
}
