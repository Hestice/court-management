import { createClient } from "@/lib/supabase/server";
import { BlockedSlotsView } from "./blocked-slots-view";
import type { BlockedSlotRow, CourtOption } from "./schema";

export const metadata = { title: "Blocked Slots — Admin" };

type BlockedSlotWithRelations = {
  id: string;
  court_id: string;
  slot_date: string;
  start_hour: number;
  end_hour: number;
  reason: string | null;
  created_at: string;
  court: { name: string } | null;
  creator: { name: string | null; email: string } | null;
};

export default async function AdminBlockedSlotsPage() {
  const supabase = await createClient();

  const [blocksRes, courtsRes, settingsRes] = await Promise.all([
    supabase
      .from("blocked_slots")
      .select(
        "id, court_id, slot_date, start_hour, end_hour, reason, created_at, court:courts!blocked_slots_court_id_fkey(name), creator:users!blocked_slots_created_by_fkey(name, email)",
      ),
    supabase
      .from("courts")
      .select("id, name")
      .eq("is_active", true),
    supabase
      .from("facility_settings")
      .select("operating_hours_start, operating_hours_end")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (blocksRes.error) {
    throw new Error(`Failed to load blocked slots: ${blocksRes.error.message}`);
  }
  if (courtsRes.error) {
    throw new Error(`Failed to load courts: ${courtsRes.error.message}`);
  }
  if (settingsRes.error) {
    throw new Error(
      `Failed to load facility settings: ${settingsRes.error.message}`,
    );
  }

  const blocks: BlockedSlotRow[] = (
    (blocksRes.data ?? []) as unknown as BlockedSlotWithRelations[]
  ).map((row) => ({
    id: row.id,
    court_id: row.court_id,
    slot_date: row.slot_date,
    start_hour: row.start_hour,
    end_hour: row.end_hour,
    reason: row.reason,
    created_at: row.created_at,
    court_name: row.court?.name ?? "—",
    created_by_name: row.creator?.name?.trim()
      ? row.creator.name
      : (row.creator?.email ?? null),
  }));

  const courts: CourtOption[] = (courtsRes.data ?? [])
    .slice()
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  const operatingStart = settingsRes.data?.operating_hours_start ?? 8;
  const operatingEnd = settingsRes.data?.operating_hours_end ?? 22;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <BlockedSlotsView
        blocks={blocks}
        courts={courts}
        operatingStart={operatingStart}
        operatingEnd={operatingEnd}
      />
    </main>
  );
}
