import * as z from "zod";

import { GUEST_COUNT_MAX, GUEST_COUNT_MIN } from "@/lib/zod-helpers";

export const createBookingSchema = z
  .object({
    court_id: z.string().uuid({ message: "Select a court." }),
    booking_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Select a date." }),
    start_hour: z
      .number({ message: "Select a start time." })
      .int()
      .min(0)
      .max(23),
    duration_hours: z
      .number({ message: "Select a duration." })
      .int()
      .min(1, { message: "Duration must be at least 1 hour." })
      .max(24),
    guest_count: z
      .number({ message: "Enter a guest count." })
      .int({ message: "Guest count must be a whole number." })
      .min(GUEST_COUNT_MIN, {
        message: `Guest count must be at least ${GUEST_COUNT_MIN}.`,
      })
      .max(GUEST_COUNT_MAX, {
        message: `Guest count can't exceed ${GUEST_COUNT_MAX}.`,
      }),
  });

export type CreateBookingValues = z.infer<typeof createBookingSchema>;

export type CourtOption = {
  id: string;
  name: string;
  hourly_rate: number;
};
