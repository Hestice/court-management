import { getAvailability } from "@/lib/availability";
import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import { WalkinView } from "./walkin-view";

export const metadata = { title: "New Walk-in Booking — Admin" };

export default async function AdminNewBookingPage() {
  const supabase = await createClient();
  const today = todayInFacility();

  const [settingsRes, availability] = await Promise.all([
    supabase
      .from("facility_settings")
      .select(
        "operating_hours_start, operating_hours_end, max_booking_duration_hours",
      )
      .eq("id", 1)
      .maybeSingle(),
    getAvailability({ date: today }),
  ]);

  if (settingsRes.error) {
    throw new Error(`Failed to load settings: ${settingsRes.error.message}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <WalkinView
        today={today}
        initialDate={today}
        initialAvailability={availability}
        operatingStart={settingsRes.data?.operating_hours_start ?? 8}
        operatingEnd={settingsRes.data?.operating_hours_end ?? 22}
        maxDuration={settingsRes.data?.max_booking_duration_hours ?? 5}
      />
    </main>
  );
}
