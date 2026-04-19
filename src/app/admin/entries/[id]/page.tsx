import { notFound } from "next/navigation";

import { getWalkInEntry } from "@/lib/data/walk-in-entries";

import { EntryDetailView, type EntryDetailRow } from "./detail-view";

export const metadata = { title: "Entry Detail — Admin" };

export default async function AdminEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await getWalkInEntry(id);
  if (!entry) notFound();

  const row: EntryDetailRow = {
    id: entry.id,
    entry_date: entry.entry_date,
    guest_count: entry.guest_count,
    walk_in_name: entry.walk_in_name,
    walk_in_phone: entry.walk_in_phone,
    total_amount: Number(entry.total_amount),
    notes: entry.notes,
    created_at: entry.created_at,
    created_by_name:
      entry.created_by_user?.name ?? entry.created_by_user?.email ?? null,
    linked_booking:
      entry.linked_booking && entry.linked_booking.court
        ? {
            id: entry.linked_booking.id,
            booking_date: entry.linked_booking.booking_date,
            start_hour: entry.linked_booking.start_hour,
            end_hour: entry.linked_booking.end_hour,
            court_name: entry.linked_booking.court.name,
            customer_label:
              entry.linked_booking.walk_in_name ??
              entry.linked_booking.customer?.name ??
              entry.linked_booking.customer?.email ??
              null,
          }
        : null,
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <EntryDetailView entry={row} />
    </main>
  );
}
