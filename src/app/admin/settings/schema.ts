import * as z from "zod";

import { EMAIL_MAX, NAME_MAX, PHONE_MAX, safeText } from "@/lib/zod-helpers";

export const facilitySettingsSchema = z
  .object({
    facility_name: safeText({
      min: 1,
      max: NAME_MAX,
      label: "Facility name",
    }),
    operating_hours_start: z
      .number({ message: "Operating hours start must be a number." })
      .int({ message: "Operating hours start must be a whole number." })
      .min(0, { message: "Operating hours start must be 0 or greater." })
      .max(23, { message: "Operating hours start must be 23 or less." }),
    operating_hours_end: z
      .number({ message: "Operating hours end must be a number." })
      .int({ message: "Operating hours end must be a whole number." })
      .min(1, { message: "Operating hours end must be 1 or greater." })
      .max(24, { message: "Operating hours end must be 24 or less." }),
    contact_email: z
      .string()
      .trim()
      .max(EMAIL_MAX)
      .email({ message: "Enter a valid email." })
      .or(z.literal(""))
      .optional(),
    contact_phone: z
      .string()
      .trim()
      .max(PHONE_MAX)
      .optional()
      .or(z.literal("")),
    pending_expiry_hours: z
      .number({ message: "Pending expiry must be a number." })
      .int({ message: "Pending expiry must be a whole number." })
      .min(1, { message: "Pending expiry must be at least 1 hour." })
      .max(168, { message: "Pending expiry must be 168 hours (1 week) or less." }),
    max_booking_duration_hours: z
      .number({ message: "Maximum booking duration must be a number." })
      .int({ message: "Maximum booking duration must be a whole number." })
      .min(1, { message: "Maximum booking duration must be at least 1 hour." })
      .max(24, { message: "Maximum booking duration must be 24 or less." }),
    entrance_pass_price_per_guest: z
      .number({ message: "Entrance pass price must be a number." })
      .min(0, { message: "Entrance pass price can't be negative." })
      .max(100_000, { message: "Entrance pass price is unreasonably high." }),
  })
  .refine((v) => v.operating_hours_end > v.operating_hours_start, {
    message: "End must be after start.",
    path: ["operating_hours_end"],
  });

export type FacilitySettingsValues = z.infer<typeof facilitySettingsSchema>;
