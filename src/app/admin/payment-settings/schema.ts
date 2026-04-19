import * as z from "zod";

import { safeText } from "@/lib/zod-helpers";

export const PAYMENT_LABEL_MAX = 50;
export const PAYMENT_DETAILS_MAX = 500;

// Plain-text fields only — the QR file is a separate FormData entry handled
// directly inside the server action. Using a single zod schema here gives us
// identical validation messages on both the client form and the action.
export const paymentMethodFormSchema = z.object({
  label: safeText({ min: 1, max: PAYMENT_LABEL_MAX, label: "Label" }),
  account_details: safeText({
    min: 1,
    max: PAYMENT_DETAILS_MAX,
    label: "Account details",
  }),
  is_active: z.boolean(),
});

export type PaymentMethodFormValues = z.infer<typeof paymentMethodFormSchema>;

// `qr_path` is the raw value stored in the DB column (legacy named
// `qr_image_url`). The column holds a storage path like "<id>/qr.webp" —
// we compute `qr_public_url` at load time from the payment-qrs public bucket
// so the view can render <img src>.
export type PaymentMethod = {
  id: string;
  label: string;
  account_details: string;
  display_order: number;
  is_active: boolean;
  qr_path: string | null;
  qr_public_url: string | null;
};
