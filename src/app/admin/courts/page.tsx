import { createClient } from "@/lib/supabase/server";
import { CourtsTable } from "./courts-table";
import type { Court } from "./schema";

export const metadata = { title: "Courts — Admin" };

export default async function AdminCourtsPage() {
  const supabase = await createClient();
  const { data: courts, error } = await supabase
    .from("courts")
    .select(
      "id, name, hourly_rate, is_active, position_x, position_y, created_at",
    );

  if (error) {
    throw new Error(`Failed to load courts: ${error.message}`);
  }

  const sorted = ((courts ?? []) as Court[]).slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <CourtsTable courts={sorted} />
    </main>
  );
}
