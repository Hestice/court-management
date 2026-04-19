import { getAvailability } from "@/lib/data/availability";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { todayInFacility } from "@/lib/timezone";

import { BookingView } from "./booking-view";

export const metadata = { title: "Book a Court" };

export default async function BookingPage() {
  const today = todayInFacility();

  const [settings, availability] = await Promise.all([
    getFacilitySettings(),
    getAvailability({ date: today }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Book a Court
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a date to see availability, then reserve a court and time.
        </p>
      </div>
      <BookingView
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
