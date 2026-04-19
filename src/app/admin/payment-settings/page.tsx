import { createClient } from "@/lib/supabase/server";

import { PaymentSettingsView } from "./payment-settings-view";
import type { PaymentMethod } from "./schema";

export const metadata = { title: "Payment Settings — Admin" };

export default async function AdminPaymentSettingsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, label, account_details, display_order, is_active, qr_image_url")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load payment methods: ${error.message}`);
  }

  const methods: PaymentMethod[] = (data ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    account_details: m.account_details,
    display_order: m.display_order,
    is_active: m.is_active,
    qr_path: m.qr_image_url,
    qr_public_url: m.qr_image_url
      ? supabase.storage.from("payment-qrs").getPublicUrl(m.qr_image_url).data
          .publicUrl
      : null,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <PaymentSettingsView methods={methods} />
    </main>
  );
}
