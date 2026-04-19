import { headers } from "next/headers";

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
    // Fail open on infrastructure errors — don't lock real users out if the
    // RPC is down. The trade-off is accepted because the limiter's goal is
    // abuse mitigation, not correctness enforcement.
    console.error("[rate-limit] rpc failed", error);
    return { allowed: true };
  }

  const payload = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  if (!payload) return { allowed: true };

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
