"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type CourtPosition = {
  id: string;
  position_x: number | null;
  position_y: number | null;
};

export type SaveLayoutResult = { success: boolean; error?: string };

export async function saveLayout(
  positions: CourtPosition[],
): Promise<SaveLayoutResult> {
  if (positions.length === 0) return { success: true };

  const supabase = await createClient();

  // Issue updates in parallel; RLS gates on admin role so unauthorised
  // callers get a consistent error regardless of row count.
  const results = await Promise.all(
    positions.map((p) =>
      supabase
        .from("courts")
        .update({ position_x: p.position_x, position_y: p.position_y })
        .eq("id", p.id),
    ),
  );

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    return { success: false, error: firstError.message };
  }

  revalidatePath("/admin/floor-plan");
  revalidatePath("/admin/courts");
  return { success: true };
}
