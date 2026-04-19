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

const guestCountField = z
  .number({ message: "Enter a guest count." })
  .int({ message: "Guest count must be a whole number." })
  .min(GUEST_COUNT_MIN, {
    message: `Guest count must be at least ${GUEST_COUNT_MIN}.`,
  })
  .max(GUEST_COUNT_MAX, {
    message: `Guest count can't exceed ${GUEST_COUNT_MAX}.`,
  });

export const editGuestCountSchema = z.object({
  guest_count: guestCountField,
});

export type EditGuestCountValues = z.infer<typeof editGuestCountSchema>;

// Shared with the customer booking form but re-declared here so the admin
// flows can evolve independently without leaking regressions across pages.
export const rescheduleSchema = z.object({
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
});

export type RescheduleValues = z.infer<typeof rescheduleSchema>;

export const rejectSchema = z.object({
  reason: safeText({ min: 1, max: REASON_MAX, label: "Reason" }),
});

export type RejectValues = z.infer<typeof rejectSchema>;

export const cancelSchema = z.object({
  reason: safeText({ min: 0, max: REASON_MAX, label: "Reason" }).optional(),
});

export type CancelValues = z.infer<typeof cancelSchema>;

export const notesSchema = z.object({
  notes: safeText({ min: 0, max: MESSAGE_MAX, label: "Notes" }),
});

export type NotesValues = z.infer<typeof notesSchema>;

export const walkinSchema = z.object({
  walk_in_name: safeText({ min: 1, max: NAME_MAX, label: "Name" }),
  walk_in_phone: safeText({ min: 0, max: PHONE_MAX, label: "Phone" })
    .optional(),
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
  guest_count: guestCountField,
});

export type WalkinValues = z.infer<typeof walkinSchema>;

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

export const BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
];

export type BookingTypeFilter = "all" | "registered" | "walkin";

export type BookingRow = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: BookingStatus;
  total_amount: number;
  guest_count: number;
  expires_at: string | null;
  created_at: string;
  payment_receipt_url: string | null;
  user_id: string | null;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  court_id: string;
  court_name: string;
  court_hourly_rate: number;
  admin_notes: string | null;
};
