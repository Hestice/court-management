"use server";

import { getAvailability, type CourtAvailability } from "@/lib/availability";

export type LoadAvailabilityResult =
  | { success: true; courts: CourtAvailability[] }
  | { success: false; error: string };

export async function loadAvailability(
  date: string,
): Promise<LoadAvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: "Invalid date." };
  }
  try {
    const courts = await getAvailability({ date });
    return { success: true, courts };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load availability.";
    return { success: false, error: message };
  }
}
