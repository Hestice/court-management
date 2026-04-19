import { headers } from "next/headers";

import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

// The single public interface. Every call site in the app goes through this
// function — do not scatter direct `rate_limits` queries across the codebase.
// When traffic outgrows the Postgres-backed limiter, swap the implementation
// here (e.g. Upstash Redis) without touching any caller.
export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

// Preset buckets used across the app. Kept here so limits are defined in one
// place and a reviewer can see them at a glance.
export const RATE_LIMITS = {
  login: { limit: 5, windowSeconds: 10 * 60 },
  register: { limit: 3, windowSeconds: 60 * 60 },
  bookingSubmit: { limit: 10, windowSeconds: 60 * 60 },
  contact: { limit: 3, windowSeconds: 60 * 60 },
  fileUpload: { limit: 20, windowSeconds: 60 * 60 },
  // Gate scanner — 60/min covers a busy check-in burst but caps a runaway
  // loop from a faulty camera. Scoped per admin user.
  scanRedeem: { limit: 60, windowSeconds: 60 },
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMITS;

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fail open on infrastructure errors — don't lock real users out of a
    // working app over a broken limiter. The limiter's goal is abuse
    // mitigation, not correctness enforcement. Log loudly so we notice.
    logError("rate_limit.rpc_failed", error, {
      key,
      limit,
      windowSeconds,
      pgCode: (error as { code?: string }).code,
      hint: (error as { hint?: string }).hint,
    });
    return { allowed: true };
  }

  const payload = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  if (!payload) {
    // Unexpected shape — also fail open but flag it.
    logError("rate_limit.empty_response", new Error("RPC returned empty"), {
      key,
      limit,
      windowSeconds,
    });
    return { allowed: true };
  }

  return {
    allowed: !!payload.allowed,
    retryAfterSeconds: payload.allowed
      ? undefined
      : payload.retry_after_seconds,
  };
}

// Convenience wrapper — takes a preset name + scope (IP or user_id) and
// builds a consistent key.
export async function checkPreset(
  preset: RateLimitPreset,
  scope: string,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[preset];
  return checkRateLimit(`${preset}:${scope}`, limit, windowSeconds);
}

// Best-effort client IP extraction. Vercel sets x-forwarded-for; in dev
// headers may be missing. Callers that must fail-closed on unknown IP
// should check the return value.
export async function getRequestIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

// Human-readable retry hint for toasts ("try again in 3 minutes").
export function formatRetryAfter(retryAfterSeconds?: number): string {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) return "Try again soon.";
  if (retryAfterSeconds < 60) {
    return `Try again in ${retryAfterSeconds} ${retryAfterSeconds === 1 ? "second" : "seconds"}.`;
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  if (minutes < 60) {
    return `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
  }
  const hours = Math.ceil(minutes / 60);
  return `Try again in ${hours} ${hours === 1 ? "hour" : "hours"}.`;
}
