import { listWalkInEntries } from "@/lib/data/walk-in-entries";
import { todayInFacility } from "@/lib/timezone";

import { EntriesView, type EntryRow } from "./entries-view";

export const metadata = { title: "Walk-in Entries — Admin" };

export default async function AdminEntriesPage() {
  const entries = await listWalkInEntries();

  const rows: EntryRow[] = entries.map((e) => ({
    id: e.id,
    entry_date: e.entry_date,
    guest_count: e.guest_count,
    walk_in_name: e.walk_in_name,
    walk_in_phone: e.walk_in_phone,
    total_amount: Number(e.total_amount),
    notes: e.notes,
    created_at: e.created_at,
    created_by_name:
      e.created_by_user?.name ?? e.created_by_user?.email ?? null,
    linked_booking:
      e.linked_booking && e.linked_booking.court
        ? {
            id: e.linked_booking.id,
            booking_date: e.linked_booking.booking_date,
            start_hour: e.linked_booking.start_hour,
            end_hour: e.linked_booking.end_hour,
            court_name: e.linked_booking.court.name,
            customer_label:
              e.linked_booking.walk_in_name ??
              e.linked_booking.customer?.name ??
              e.linked_booking.customer?.email ??
              null,
          }
        : null,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <EntriesView rows={rows} today={todayInFacility()} />
    </main>
  );
}
