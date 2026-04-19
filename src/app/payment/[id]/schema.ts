import * as z from "zod";

import { GUEST_COUNT_MAX, GUEST_COUNT_MIN } from "@/lib/zod-helpers";

// Customer-side guest count edit on the payment page. Locked as soon as a
// receipt is uploaded; from there the admin owns the adjustment.
export const editGuestCountSchema = z.object({
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

export type EditGuestCountValues = z.infer<typeof editGuestCountSchema>;
