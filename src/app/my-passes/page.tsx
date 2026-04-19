import { redirect } from "next/navigation";

import {
  listPassesForUser,
  listPassGuestsForPass,
} from "@/lib/data/entrance-passes";
import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import { MyPassesView, type MyPassCard } from "./my-passes-view";

export const metadata = { title: "My Passes" };

export default async function MyPassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my-passes");

  const passes = await listPassesForUser(user.id);

  // Only load guest QR codes for confirmed passes — the /my-passes page only
  // renders the QR grid for confirmed entries, so we skip the extra queries
  // for pending/cancelled/expired rows.
  const confirmed = passes.filter((p) => p.status === "confirmed");
  const guestsByPass = new Map<string, Awaited<ReturnType<typeof listPassGuestsForPass>>>();
  await Promise.all(
    confirmed.map(async (p) => {
      guestsByPass.set(p.id, await listPassGuestsForPass(p.id));
    }),
  );

  const cards: MyPassCard[] = passes.map((p) => {
    const guests = guestsByPass.get(p.id) ?? [];
    return {
      id: p.id,
      pass_date: p.pass_date,
      guest_count: p.guest_count,
      status: p.status,
      total_amount: Number(p.total_amount),
      expires_at: p.expires_at,
      has_receipt: !!p.payment_receipt_url,
      guests: guests.map((g) => ({
        id: g.id,
        guest_number: g.guest_number,
        qr_code: g.qr_code,
        redeemed_at: g.redeemed_at,
      })),
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <MyPassesView cards={cards} today={todayInFacility()} />
    </main>
  );
}
