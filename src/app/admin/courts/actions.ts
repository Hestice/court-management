"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  courtFormSchema,
  createCourtsSchema,
  GRID_ROW_WIDTH,
  highestCourtNumber,
  type CourtFormValues,
  type CreateCourtsValues,
} from "./schema";

export type ActionResult = { success: boolean; error?: string };

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

function nextFreePositions(
  taken: Set<string>,
  count: number,
): Array<{ x: number; y: number }> {
  const picks: Array<{ x: number; y: number }> = [];
  for (let y = 0; picks.length < count; y++) {
    for (let x = 0; x < GRID_ROW_WIDTH && picks.length < count; x++) {
      const key = `${x},${y}`;
      if (!taken.has(key)) {
        picks.push({ x, y });
        taken.add(key);
      }
    }
  }
  return picks;
}

export async function createCourts(
  values: CreateCourtsValues,
): Promise<ActionResult> {
  const parsed = createCourtsSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: existing, error: listError } = await supabase
    .from("courts")
    .select("name, position_x, position_y");
  if (listError) {
    return { success: false, error: listError.message };
  }

  const startNumber =
    highestCourtNumber((existing ?? []).map((c) => c.name)) + 1;
  const positions = nextFreePositions(
    takenPositionSet(existing ?? []),
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
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/courts");
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("courts")
    .update({
      name: parsed.data.name,
      hourly_rate: parsed.data.hourly_rate,
      is_active: parsed.data.is_active ?? true,
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/courts");
  return { success: true };
}

export async function deleteCourt(
  id: string,
  name: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("courts").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error: `Cannot delete ${name} — it has existing bookings. Toggle it inactive instead to hide it from customers.`,
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/courts");
  return { success: true };
}

export type BulkDeleteResult = {
  deletedCount: number;
  failedNames: string[];
};

export async function deleteCourts(ids: string[]): Promise<BulkDeleteResult> {
  if (ids.length === 0) return { deletedCount: 0, failedNames: [] };

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("courts")
    .select("id, name")
    .in("id", ids);
  const nameById = new Map<string, string>(
    (rows ?? []).map((r) => [r.id, r.name]),
  );

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
  return { deletedCount, failedNames };
}
