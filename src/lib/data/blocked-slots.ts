import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

export type BlockedSlotWithRelations = {
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

export type BlockedSlotOverlap = {
  id: string;
  start_hour: number;
  end_hour: number;
};

const LIST_SELECT =
  "id, court_id, slot_date, start_hour, end_hour, reason, created_at, court:courts!blocked_slots_court_id_fkey(name), creator:users!blocked_slots_created_by_fkey(name, email)";

export const listBlockedSlots = cache(
  async (): Promise<BlockedSlotWithRelations[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("blocked_slots")
      .select(LIST_SELECT);
    if (error) throwDataError("data.blocked_slots.list", error);
    return (data ?? []) as unknown as BlockedSlotWithRelations[];
  },
);

// Existing blocks that overlap [start, end) on (court, date). Used in the
// create-block validation path; returns [] when nothing conflicts.
export async function listOverlappingBlocks(params: {
  courtId: string;
  date: string;
  startHour: number;
  endHour: number;
}): Promise<BlockedSlotOverlap[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocked_slots")
    .select("id, start_hour, end_hour")
    .eq("court_id", params.courtId)
    .eq("slot_date", params.date)
    .lt("start_hour", params.endHour)
    .gt("end_hour", params.startHour);
  if (error)
    throwDataError("data.blocked_slots.list_overlapping", error, { ...params });
  return data ?? [];
}
