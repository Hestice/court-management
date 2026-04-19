import {
  listGuestCountsForPasses,
  listPasses,
} from "@/lib/data/entrance-passes";
import { todayInFacility } from "@/lib/timezone";

import { PassesView, type PassRow } from "./passes-view";
import type { PassStatus } from "../../entrance/schema";

export const metadata = { title: "Entrance Passes — Admin" };

export default async function AdminPassesPage() {
  const passes = await listPasses();
  const counts = await listGuestCountsForPasses(passes.map((p) => p.id));

  const rows: PassRow[] = passes.map((p) => {
    const count = counts.get(p.id) ?? { total: p.guest_count, redeemed: 0 };
    return {
      id: p.id,
      pass_date: p.pass_date,
      guest_count: p.guest_count,
      redeemed_count: count.redeemed,
      status: p.status as PassStatus,
      total_amount: Number(p.total_amount),
      expires_at: p.expires_at,
      created_at: p.created_at,
      payment_receipt_url: p.payment_receipt_url,
      user_id: p.user_id,
      walk_in_name: p.walk_in_name,
      walk_in_phone: p.walk_in_phone,
      customer_name: p.customer?.name ?? null,
      customer_email: p.customer?.email ?? null,
      admin_notes: p.admin_notes,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <PassesView rows={rows} today={todayInFacility()} />
    </main>
  );
}
