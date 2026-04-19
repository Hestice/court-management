import { getFacilitySettings } from "@/lib/data/facility-settings";
import { listLinkableBookings } from "@/lib/data/walk-in-entries";
import { todayInFacility } from "@/lib/timezone";

import { NewEntryView, type LinkableBookingOption } from "./new-entry-view";

export const metadata = { title: "Log Walk-in Entry — Admin" };

export default async function AdminNewEntryPage() {
  const today = todayInFacility();
  const [settings, bookings] = await Promise.all([
    getFacilitySettings(),
    listLinkableBookings({ today }),
  ]);

  const options: LinkableBookingOption[] = bookings.map((b) => ({
    id: b.id,
    booking_date: b.booking_date,
    start_hour: b.start_hour,
    end_hour: b.end_hour,
    court_name: b.court_name,
    customer_label: b.customer_label,
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <NewEntryView
        today={today}
        pricePerGuest={settings.entrance_pass_price_per_guest}
        bookings={options}
      />
    </main>
  );
}
