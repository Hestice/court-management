import { getAvailability } from "@/lib/availability";
import { createClient } from "@/lib/supabase/server";
import { todayInFacility } from "@/lib/timezone";

import { BookingView } from "./booking-view";

export const metadata = { title: "Book a Court" };

export default async function BookingPage() {
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
    throw new Error(
      `Failed to load facility settings: ${settingsRes.error.message}`,
    );
  }

  const operatingStart = settingsRes.data?.operating_hours_start ?? 8;
  const operatingEnd = settingsRes.data?.operating_hours_end ?? 22;
  const maxDuration = settingsRes.data?.max_booking_duration_hours ?? 5;

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
        operatingStart={operatingStart}
        operatingEnd={operatingEnd}
        maxDuration={maxDuration}
      />
    </main>
  );
}
