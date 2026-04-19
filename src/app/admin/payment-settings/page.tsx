import { listPaymentMethods } from "@/lib/data/payment-methods";

import { PaymentSettingsView } from "./payment-settings-view";

export const metadata = { title: "Payment Settings — Admin" };

export default async function AdminPaymentSettingsPage() {
  const methods = await listPaymentMethods();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <PaymentSettingsView methods={methods} />
    </main>
  );
}
