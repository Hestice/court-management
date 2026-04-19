import { getFacilitySettings } from "@/lib/data/facility-settings";

import { SettingsForm } from "./settings-form";
import type { FacilitySettingsValues } from "./schema";

export const metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const settings = await getFacilitySettings();

  const defaults: FacilitySettingsValues = {
    facility_name: settings.facility_name,
    operating_hours_start: settings.operating_hours_start,
    operating_hours_end: settings.operating_hours_end,
    contact_email: settings.contact_email ?? "",
    contact_phone: settings.contact_phone ?? "",
    pending_expiry_hours: settings.pending_expiry_hours,
    max_booking_duration_hours: settings.max_booking_duration_hours,
    entrance_pass_price_per_guest: settings.entrance_pass_price_per_guest,
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Facility Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Facility name, operating hours, and booking policies.
        </p>
      </div>
      <SettingsForm defaults={defaults} />
    </main>
  );
}
