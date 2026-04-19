import { getFacilitySettings } from "@/lib/data/facility-settings";
import { todayInFacility } from "@/lib/timezone";
import { addDaysIso, PASS_DATE_MAX_DAYS } from "@/lib/zod-helpers";

import { WalkinPassView } from "./walkin-pass-view";

export const metadata = { title: "New Walk-in Pass — Admin" };

export default async function AdminNewPassPage() {
  const settings = await getFacilitySettings();
  const today = todayInFacility();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <WalkinPassView
        today={today}
        maxDate={addDaysIso(today, PASS_DATE_MAX_DAYS)}
        pricePerGuest={settings.entrance_pass_price_per_guest}
      />
    </main>
  );
}
