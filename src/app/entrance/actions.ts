"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/actions";
import { logAuditEvent } from "@/lib/audit";
import { getFacilitySettings } from "@/lib/data/facility-settings";
import { logError } from "@/lib/logger";
import { checkPreset, formatRetryAfter } from "@/lib/rate-limit";
import { todayInFacility } from "@/lib/timezone";
import { addDaysIso, PASS_DATE_MAX_DAYS } from "@/lib/zod-helpers";

import { purchasePassSchema, type PurchasePassValues } from "./schema";

export type CreatePassResult =
  | { success: true; passId: string }
  | { success: false; error: string };

// Per-guest random identifier used as the raw QR payload. 128+ bits of
// entropy, URL-safe, unguessable. crypto.randomUUID() gives 122 bits of
// randomness — good, but we add a short prefix so a scanned code is self-
// describing at a glance during debugging.
function newQrCode(): string {
  return `pass_${crypto.randomUUID()}`;
}

export async function purchasePass(
  values: PurchasePassValues,
): Promise<CreatePassResult> {
  const parsed = purchasePassSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { pass_date, guest_count } = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  const rate = await checkPreset("passSubmit", userId);
  if (!rate.allowed) {
    await logAuditEvent("rate_limit.hit", {
      actorUserId: userId,
      metadata: { preset: "passSubmit" },
    });
    return {
      success: false,
      error: `You've hit the entrance pass rate limit. ${formatRetryAfter(rate.retryAfterSeconds)}`,
    };
  }

  const today = todayInFacility();
  if (pass_date < today) {
    return { success: false, error: "Date must be today or later." };
  }
  if (pass_date > addDaysIso(today, PASS_DATE_MAX_DAYS)) {
    return {
      success: false,
      error: `Passes can't be more than ${PASS_DATE_MAX_DAYS} days out.`,
    };
  }

  const settings = await getFacilitySettings();
  // Server-side total — never trust the client's live total display.
  const total_amount =
    Number(settings.entrance_pass_price_per_guest) * guest_count;
  const expires_at = new Date(
    Date.now() + settings.pending_expiry_hours * 60 * 60 * 1000,
  ).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("entrance_passes")
    .insert({
      user_id: userId,
      pass_date,
      guest_count,
      status: "pending",
      total_amount,
      expires_at,
    })
    .select("id")
    .single();

  if (insertError) {
    logError("pass.create_failed", insertError, { pass_date, guest_count });
    return { success: false, error: "Couldn't create entrance pass." };
  }

  const guestRows = Array.from({ length: guest_count }, (_, i) => ({
    pass_id: inserted.id,
    guest_number: i + 1,
    qr_code: newQrCode(),
  }));

  const { error: guestsError } = await supabase
    .from("pass_guests")
    .insert(guestRows);

  if (guestsError) {
    // The guest insert failing after the pass insert leaves an orphan pass
    // row with no redeemable codes. Delete the pass so the UI doesn't show a
    // zombie entry; the rollback itself is best-effort (we log and move on).
    const { error: rollbackError } = await supabase
      .from("entrance_passes")
      .delete()
      .eq("id", inserted.id);
    if (rollbackError) {
      logError("pass.create_rollback_failed", rollbackError, {
        passId: inserted.id,
      });
    }
    logError("pass.create_guests_failed", guestsError, {
      passId: inserted.id,
      guest_count,
    });
    return { success: false, error: "Couldn't create guest QR codes." };
  }

  await logAuditEvent("pass.created", {
    actorUserId: userId,
    metadata: {
      pass_id: inserted.id,
      pass_date,
      guest_count,
      total_amount,
    },
  });

  revalidatePath("/entrance");
  revalidatePath("/my-passes");
  revalidatePath("/admin/passes");
  return { success: true, passId: inserted.id };
}
