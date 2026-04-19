import { listBlockedSlots } from "@/lib/data/blocked-slots";
import { listActiveCourtOptions } from "@/lib/data/courts";
import { getFacilitySettings } from "@/lib/data/facility-settings";

import { BlockedSlotsView } from "./blocked-slots-view";
import type { BlockedSlotRow } from "./schema";

export const metadata = { title: "Blocked Slots — Admin" };

export default async function AdminBlockedSlotsPage() {
  const [blocksRaw, courts, settings] = await Promise.all([
    listBlockedSlots(),
    listActiveCourtOptions(),
    getFacilitySettings(),
  ]);

  const blocks: BlockedSlotRow[] = blocksRaw.map((row) => ({
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <BlockedSlotsView
        blocks={blocks}
        courts={courts}
        operatingStart={settings.operating_hours_start}
        operatingEnd={settings.operating_hours_end}
      />
    </main>
  );
}
