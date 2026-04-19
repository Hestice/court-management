import "server-only";

import { getUserRole } from "@/lib/data/users";
import { createClient } from "@/lib/supabase/server";

// Standard result envelope for server actions.
// - Success carries an optional typed payload so each action can return what
//   the form needs (e.g. the new booking id) without losing discriminant.
// - Failure always carries a user-friendly `error` string. Never surface raw
//   DB messages; sanitize inside the action.
export type ActionResult<T = void> =
  | (T extends void ? { success: true } : { success: true; data: T })
  | { success: false; error: string };

// Shorthand for actions that don't return a payload.
export type SimpleActionResult = { success: true } | { success: false; error: string };

// Narrow the type guard so callers can early-return.
export function actionError(error: string): { success: false; error: string } {
  return { success: false, error };
}

export async function requireUser(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  return { ok: true, userId: user.id, supabase };
}

// Admin-only variant. RLS would also block non-admin writes, but the explicit
// check gives us an actionable error before we hit the DB.
export async function requireAdmin(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const role = await getUserRole(auth.userId);
  if (role !== "admin") return { ok: false, error: "Admin access required." };
  return auth;
}
