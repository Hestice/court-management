import { redirect } from "next/navigation";

import { getFacilitySettings } from "@/lib/data/facility-settings";
import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";
import { addDaysIso, PASS_DATE_MAX_DAYS } from "@/lib/zod-helpers";

import { EntranceView } from "./entrance-view";

export const metadata = { title: "Buy Entrance Pass" };

export default async function EntrancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/entrance");

  const settings = await getFacilitySettings();
  const today = todayInFacility();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Buy Entrance Pass
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Purchase a day pass for a selected date and number of guests.
        </p>
      </div>
      <EntranceView
        today={today}
        maxDate={addDaysIso(today, PASS_DATE_MAX_DAYS)}
        pricePerGuest={settings.entrance_pass_price_per_guest}
      />
    </main>
  );
}
