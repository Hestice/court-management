import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import type { FacilitySettingsValues } from "./schema";

export const metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facility_settings")
    .select(
      "facility_name, operating_hours_start, operating_hours_end, contact_email, contact_phone, pending_expiry_hours, max_booking_duration_hours",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load facility settings: ${error.message}`);
  }

  const defaults: FacilitySettingsValues = {
    facility_name: data?.facility_name ?? "Court Management",
    operating_hours_start: data?.operating_hours_start ?? 8,
    operating_hours_end: data?.operating_hours_end ?? 22,
    contact_email: data?.contact_email ?? "",
    contact_phone: data?.contact_phone ?? "",
    pending_expiry_hours: data?.pending_expiry_hours ?? 24,
    max_booking_duration_hours: data?.max_booking_duration_hours ?? 5,
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
