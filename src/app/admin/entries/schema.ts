import * as z from "zod";

import {
  GUEST_COUNT_MAX,
  GUEST_COUNT_MIN,
  MESSAGE_MAX,
  NAME_MAX,
  PHONE_MAX,
  REASON_MAX,
  safeText,
} from "@/lib/zod-helpers";

// Fields for logging a walk-in entry. Name/phone are optional — "Anonymous"
// is the common case when someone buys a gate pass without identifying
// themselves. linked_booking_id is the "joining a friend's booking" case.
export const walkInEntrySchema = z.object({
  entry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Select a date." }),
  guest_count: z
    .number({ message: "Enter a guest count." })
    .int({ message: "Guest count must be a whole number." })
    .min(GUEST_COUNT_MIN, {
      message: `Guest count must be at least ${GUEST_COUNT_MIN}.`,
    })
    .max(GUEST_COUNT_MAX, {
      message: `Guest count can't exceed ${GUEST_COUNT_MAX}.`,
    }),
  walk_in_name: safeText({ min: 0, max: NAME_MAX, label: "Name" }).optional(),
  walk_in_phone: safeText({ min: 0, max: PHONE_MAX, label: "Phone" }).optional(),
  linked_booking_id: z
    .string()
    .uuid({ message: "Invalid booking reference." })
    .optional(),
  notes: safeText({ min: 0, max: REASON_MAX, label: "Notes" }).optional(),
});

export type WalkInEntryValues = z.infer<typeof walkInEntrySchema>;

export const entryNotesSchema = z.object({
  notes: safeText({ min: 0, max: MESSAGE_MAX, label: "Notes" }),
});

export type EntryNotesValues = z.infer<typeof entryNotesSchema>;
