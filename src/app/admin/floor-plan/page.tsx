import { createClient } from "@/lib/supabase/server";
import type { Court } from "@/app/admin/courts/schema";
import { FloorPlanEditor } from "./floor-plan-editor";

export const metadata = { title: "Floor Plan — Admin" };

export default async function FloorPlanPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select(
      "id, name, hourly_rate, is_active, position_x, position_y, created_at",
    );

  if (error) {
    throw new Error(`Failed to load courts: ${error.message}`);
  }

  const courts = ((data ?? []) as Court[]).slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return <FloorPlanEditor initialCourts={courts} />;
}
