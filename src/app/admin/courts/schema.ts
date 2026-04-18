import * as z from "zod";

export const courtFormSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }).max(80),
  hourly_rate: z
    .number({ message: "Hourly rate must be a number." })
    .min(0, { message: "Hourly rate must be 0 or greater." }),
  is_active: z.boolean().optional(),
});

export type CourtFormValues = z.infer<typeof courtFormSchema>;

export const createCourtsSchema = z.object({
  quantity: z
    .number({ message: "Quantity must be a number." })
    .int({ message: "Quantity must be a whole number." })
    .min(1, { message: "Add at least 1 court." })
    .max(20, { message: "Add at most 20 courts at a time." }),
  hourly_rate: z
    .number({ message: "Hourly rate must be a number." })
    .min(0, { message: "Hourly rate must be 0 or greater." }),
});

export type CreateCourtsValues = z.infer<typeof createCourtsSchema>;

export type Court = {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
};

// Floor-plan layout constants. Courts occupy a 2×4 grid footprint; auto-placement
// steps in 3×5 so every court is visually separated by one walkway cell.
export const COURT_CELLS_W = 2;
export const COURT_CELLS_H = 4;
export const COURT_STRIDE_X = 3;
export const COURT_STRIDE_Y = 5;
export const COURTS_PER_ROW = 10;

const COURT_NAME_PATTERN = /^Court\s+(\d+)$/i;

// Highest N across all "Court N" names, or 0 if none. Next court name is N+1.
// Works even if admins have renamed some courts to non-matching labels —
// the next auto-generated name just picks up after the highest numeric one.
export function highestCourtNumber(names: string[]): number {
  let max = 0;
  for (const name of names) {
    const m = name.trim().match(COURT_NAME_PATTERN);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}
