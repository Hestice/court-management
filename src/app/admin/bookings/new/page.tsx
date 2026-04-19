import { getAvailability } from "@/lib/data/availability";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { todayInFacility } from "@/lib/timezone";

import { WalkinView } from "./walkin-view";

export const metadata = { title: "New Walk-in Booking — Admin" };

export default async function AdminNewBookingPage() {
  const today = todayInFacility();

  const [settings, availability] = await Promise.all([
    getFacilitySettings(),
    getAvailability({ date: today }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <WalkinView
        today={today}
        initialDate={today}
        initialAvailability={availability}
        operatingStart={settings.operating_hours_start}
        operatingEnd={settings.operating_hours_end}
        maxDuration={settings.max_booking_duration_hours}
        entrancePricePerGuest={settings.entrance_pass_price_per_guest}
      />
    </main>
  );
}
