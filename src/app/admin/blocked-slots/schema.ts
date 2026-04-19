import * as z from "zod";

export const createBlockSchema = z
  .object({
    court_id: z.string().uuid({ message: "Select a court." }),
    slot_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Select a date." }),
    start_hour: z
      .number({ message: "Start hour is required." })
      .int({ message: "Start hour must be a whole number." })
      .min(0, { message: "Start hour must be 0 or greater." })
      .max(23, { message: "Start hour must be 23 or less." }),
    end_hour: z
      .number({ message: "End hour is required." })
      .int({ message: "End hour must be a whole number." })
      .min(1, { message: "End hour must be 1 or greater." })
      .max(24, { message: "End hour must be 24 or less." }),
    reason: z
      .string()
      .trim()
      .max(500, { message: "Reason must be 500 characters or less." })
      .optional(),
  })
  .refine((v) => v.end_hour > v.start_hour, {
    message: "End must be after start.",
    path: ["end_hour"],
  });

export type CreateBlockValues = z.infer<typeof createBlockSchema>;

export type BlockedSlotRow = {
  id: string;
  court_id: string;
  slot_date: string;
  start_hour: number;
  end_hour: number;
  reason: string | null;
  created_at: string;
  court_name: string;
  created_by_name: string | null;
};

export type CourtOption = {
  id: string;
  name: string;
};
