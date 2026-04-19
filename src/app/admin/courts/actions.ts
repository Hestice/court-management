"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/actions";
import {
  getLatestCourtHourlyRate,
  listCourtPositions,
  mapCourtNames,
} from "@/lib/data/courts";
import { logError } from "@/lib/logger";
import {
  courtFormSchema,
  createCourtsSchema,
  COURTS_PER_ROW,
  COURT_STRIDE_X,
  COURT_STRIDE_Y,
  highestCourtNumber,
  type CourtFormValues,
  type CreateCourtsValues,
} from "./schema";

export type ActionResult = { success: true } | { success: false; error: string };

type PositionRow = { position_x: number | null; position_y: number | null };

function takenPositionSet(rows: PositionRow[]): Set<string> {
  const taken = new Set<string>();
  for (const r of rows) {
    if (r.position_x !== null && r.position_y !== null) {
      taken.add(`${r.position_x},${r.position_y}`);
    }
  }
  return taken;
}

// Walk the slot grid (COURTS_PER_ROW wide) and pick the first `count` slots
// whose top-left isn't already occupied. Each slot index N maps to
// (col * STRIDE_X, row * STRIDE_Y) so placed courts get a 1-cell gap on each
// side. Scanning by slot index (not by raw cell) also means deletes leave gaps
// that future auto-placements fill in order.
function nextFreePositions(
  taken: Set<string>,
  count: number,
): Array<{ x: number; y: number }> {
  const picks: Array<{ x: number; y: number }> = [];
  for (let n = 0; picks.length < count; n++) {
    const col = n % COURTS_PER_ROW;
    const row = Math.floor(n / COURTS_PER_ROW);
    const x = col * COURT_STRIDE_X;
    const y = row * COURT_STRIDE_Y;
    const key = `${x},${y}`;
    if (!taken.has(key)) {
      picks.push({ x, y });
      taken.add(key);
    }
  }
  return picks;
}

// Re-exported through the action entrypoint so the client form can prefill
// the "hourly rate" field with the most recently-created court's rate.
export async function getLatestCourtRate(): Promise<number> {
  return getLatestCourtHourlyRate();
}

export async function createCourts(
  values: CreateCourtsValues,
): Promise<ActionResult> {
  const parsed = createCourtsSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const existing = await listCourtPositions();
  const startNumber = highestCourtNumber(existing.map((c) => c.name)) + 1;
  const positions = nextFreePositions(
    takenPositionSet(existing),
    parsed.data.quantity,
  );

  const rows = positions.map((pos, i) => ({
    name: `Court ${startNumber + i}`,
    hourly_rate: parsed.data.hourly_rate,
    is_active: true,
    position_x: pos.x,
    position_y: pos.y,
  }));

  const { error } = await supabase.from("courts").insert(rows);

  if (error) {
    logError("courts.create_failed", error, { quantity: parsed.data.quantity });
    return { success: false, error: "Couldn't create courts." };
  }

  revalidatePath("/admin/courts");
  revalidatePath("/admin/floor-plan");
  return { success: true };
}

export async function updateCourt(
  id: string,
  values: CourtFormValues,
): Promise<ActionResult> {
  const parsed = courtFormSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("courts")
    .update({
      name: parsed.data.name,
      hourly_rate: parsed.data.hourly_rate,
      is_active: parsed.data.is_active ?? true,
    })
    .eq("id", id);

  if (error) {
    logError("courts.update_failed", error, { id });
    return { success: false, error: "Couldn't update court." };
  }

  revalidatePath("/admin/courts");
  revalidatePath("/admin/floor-plan");
  return { success: true };
}

export async function deleteCourt(
  id: string,
  name: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase.from("courts").delete().eq("id", id);

  if (error) {
    // 23503 = foreign_key_violation — this court has bookings referencing it.
    // Surface a friendly actionable message instead of the raw constraint text.
    if (error.code === "23503") {
      return {
        success: false,
        error: `Cannot delete ${name} — it has existing bookings. Toggle it inactive instead to hide it from customers.`,
      };
    }
    logError("courts.delete_failed", error, { id });
    return { success: false, error: "Couldn't delete court." };
  }

  revalidatePath("/admin/courts");
  revalidatePath("/admin/floor-plan");
  return { success: true };
}

export type BulkDeleteResult = {
  deletedCount: number;
  failedNames: string[];
};

export async function deleteCourts(ids: string[]): Promise<BulkDeleteResult> {
  if (ids.length === 0) return { deletedCount: 0, failedNames: [] };

  const auth = await requireAdmin();
  if (!auth.ok) return { deletedCount: 0, failedNames: [] };
  const { supabase } = auth;

  const nameById = await mapCourtNames(ids);

  let deletedCount = 0;
  const failedNames: string[] = [];

  for (const id of ids) {
    const { error } = await supabase.from("courts").delete().eq("id", id);
    if (error) {
      failedNames.push(nameById.get(id) ?? id);
    } else {
      deletedCount += 1;
    }
  }

  revalidatePath("/admin/courts");
  revalidatePath("/admin/floor-plan");
  return { deletedCount, failedNames };
}
