import * as z from "zod";

import {
  GUEST_COUNT_MAX,
  GUEST_COUNT_MIN,
  NAME_MAX,
  PHONE_MAX,
  REASON_MAX,
  safeText,
} from "@/lib/zod-helpers";

// Customer purchase — date + guest count only. Server action computes the
// total from facility_settings.entrance_pass_price_per_guest; the client's
// displayed total is decorative.
export const purchasePassSchema = z.object({
  pass_date: z
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
});

export type PurchasePassValues = z.infer<typeof purchasePassSchema>;

// Walk-in form (admin only). Name required; phone optional; same date/guest
// bounds as the customer flow. Total is computed on the server.
export const walkinPassSchema = z.object({
  walk_in_name: safeText({ min: 1, max: NAME_MAX, label: "Name" }),
  walk_in_phone: safeText({ min: 0, max: PHONE_MAX, label: "Phone" }).optional(),
  pass_date: z
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
});

export type WalkinPassValues = z.infer<typeof walkinPassSchema>;

export const rejectPassSchema = z.object({
  reason: safeText({ min: 1, max: REASON_MAX, label: "Reason" }),
});
export type RejectPassValues = z.infer<typeof rejectPassSchema>;

export const cancelPassSchema = z.object({
  reason: safeText({ min: 0, max: REASON_MAX, label: "Reason" }).optional(),
});
export type CancelPassValues = z.infer<typeof cancelPassSchema>;

export const passNotesSchema = z.object({
  notes: safeText({ min: 0, max: 2000, label: "Notes" }),
});
export type PassNotesValues = z.infer<typeof passNotesSchema>;

export type PassStatus = "pending" | "confirmed" | "cancelled" | "expired";

export const PASS_STATUSES: PassStatus[] = [
  "pending",
  "confirmed",
  "cancelled",
  "expired",
];

export type PassTypeFilter = "all" | "registered" | "walkin";
