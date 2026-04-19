import * as z from "zod";

// QR codes issued by approveBooking are `booking_<uuid>` (~48 chars). Anything
// noticeably longer/shorter is a phone-camera hallucination — rejecting up
// front saves a DB round-trip on every garbage scan.
export const QR_CODE_MAX = 128;

export const qrCodeSchema = z
  .string()
  .trim()
  .min(1, { message: "Empty QR." })
  .max(QR_CODE_MAX, { message: "QR payload is too long." });

export const redeemByQrSchema = z.object({
  qr_code: qrCodeSchema,
  override_date_mismatch: z.boolean().optional().default(false),
});

export const redeemByIdSchema = z.object({
  guest_id: z.string().uuid({ message: "Invalid guest id." }),
  override_date_mismatch: z.boolean().optional().default(false),
});

export type RedeemByQrValues = z.infer<typeof redeemByQrSchema>;
export type RedeemByIdValues = z.infer<typeof redeemByIdSchema>;
