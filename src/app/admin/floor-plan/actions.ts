"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/actions";
import { logError } from "@/lib/logger";

export type CourtPosition = {
  id: string;
  position_x: number | null;
  position_y: number | null;
};

export type SaveLayoutResult = { success: true } | { success: false; error: string };

export async function saveLayout(
  positions: CourtPosition[],
): Promise<SaveLayoutResult> {
  if (positions.length === 0) return { success: true };

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

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
    logError("courts.layout_save_failed", firstError, {
      count: positions.length,
    });
    return { success: false, error: "Couldn't save layout." };
  }

  revalidatePath("/admin/floor-plan");
  revalidatePath("/admin/courts");
  return { success: true };
}
