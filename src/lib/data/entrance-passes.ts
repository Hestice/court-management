import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

// Full pass row + customer relation. Used by the admin list + detail pages.
export type EntrancePassRaw = {
  id: string;
  pass_date: string;
  guest_count: number;
  status: string;
  total_amount: number;
  expires_at: string | null;
  created_at: string;
  payment_receipt_url: string | null;
  user_id: string | null;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  admin_notes: string | null;
  customer: { name: string | null; email: string } | null;
};

export type PassForOwnership = {
  id: string;
  user_id: string | null;
  status: string;
  payment_receipt_url: string | null;
};

export type PassForApprove = {
  id: string;
  status: string;
  payment_receipt_url: string | null;
};

export type PassForCancel = {
  id: string;
  status: string;
  payment_receipt_url: string | null;
  admin_notes: string | null;
};

export type PassForNotes = {
  id: string;
  admin_notes: string | null;
};

export type MyPassRaw = {
  id: string;
  pass_date: string;
  guest_count: number;
  status: string;
  total_amount: number;
  expires_at: string | null;
  created_at: string;
  payment_receipt_url: string | null;
};

export type CustomerPassRaw = {
  id: string;
  user_id: string | null;
  pass_date: string;
  guest_count: number;
  status: string;
  total_amount: number;
  payment_receipt_url: string | null;
};

export type PassGuestRaw = {
  id: string;
  pass_id: string;
  guest_number: number;
  qr_code: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  redeemed_by_user: { name: string | null; email: string } | null;
};

export type PassGuestForRedeem = {
  id: string;
  pass_id: string;
  redeemed_at: string | null;
};

const FULL_SELECT =
  "id, pass_date, guest_count, status, total_amount, expires_at, created_at, payment_receipt_url, user_id, walk_in_name, walk_in_phone, admin_notes, customer:users!entrance_passes_user_id_fkey(name, email)";

const MY_PASS_SELECT =
  "id, pass_date, guest_count, status, total_amount, expires_at, created_at, payment_receipt_url";

// Mirror bookings.LIST_LIMIT — admin list is one-shot plus client-side
// filtering. Tighten filters rather than bump this for now.
const LIST_LIMIT = 500;

export const listPasses = cache(async (): Promise<EntrancePassRaw[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entrance_passes")
    .select(FULL_SELECT)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throwDataError("data.entrance_passes.list", error);
  return (data ?? []) as unknown as EntrancePassRaw[];
});

export const getPassForAdmin = cache(
  async (id: string): Promise<EntrancePassRaw | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("entrance_passes")
      .select(FULL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error)
      throwDataError("data.entrance_passes.get_for_admin", error, { id });
    return (data as unknown as EntrancePassRaw) ?? null;
  },
);

export const listPassesForUser = cache(
  async (userId: string): Promise<MyPassRaw[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("entrance_passes")
      .select(MY_PASS_SELECT)
      .eq("user_id", userId)
      .order("pass_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error)
      throwDataError("data.entrance_passes.list_for_user", error, { userId });
    return (data ?? []) as unknown as MyPassRaw[];
  },
);

// Customer-facing fetch used by /payment/[id]. Returns a minimal shape; the
// caller enforces ownership. Separate from getPassForAdmin so the SQL stays
// tight and the type doesn't pull admin-only fields into a customer render.
export const getPassForCustomer = cache(
  async (id: string): Promise<CustomerPassRaw | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("entrance_passes")
      .select(
        "id, user_id, pass_date, guest_count, status, total_amount, payment_receipt_url",
      )
      .eq("id", id)
      .maybeSingle();
    if (error)
      throwDataError("data.entrance_passes.get_for_customer", error, { id });
    return (data as unknown as CustomerPassRaw) ?? null;
  },
);

// Narrow reads used by server actions. Each returns only the fields the action
// mutates/validates.
export async function getPassForOwnership(
  id: string,
): Promise<PassForOwnership | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entrance_passes")
    .select("id, user_id, status, payment_receipt_url")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.entrance_passes.get_for_ownership", error, { id });
  return data ?? null;
}

export async function getPassForApprove(
  id: string,
): Promise<PassForApprove | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entrance_passes")
    .select("id, status, payment_receipt_url")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.entrance_passes.get_for_approve", error, { id });
  return data ?? null;
}

export async function getPassForCancel(
  id: string,
): Promise<PassForCancel | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entrance_passes")
    .select("id, status, payment_receipt_url, admin_notes")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.entrance_passes.get_for_cancel", error, { id });
  return data ?? null;
}

export async function getPassForNotes(
  id: string,
): Promise<PassForNotes | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entrance_passes")
    .select("id, admin_notes")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.entrance_passes.get_for_notes", error, { id });
  return data ?? null;
}

// Guests for a single pass — used by /my-passes (owner render), admin detail,
// and admin manual-redemption. Ordered by guest_number so "Guest 1 of N"
// labeling stays stable across reloads.
export const listPassGuestsForPass = cache(
  async (passId: string): Promise<PassGuestRaw[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pass_guests")
      .select(
        "id, pass_id, guest_number, qr_code, redeemed_at, redeemed_by, redeemed_by_user:users!pass_guests_redeemed_by_fkey(name, email)",
      )
      .eq("pass_id", passId)
      .order("guest_number", { ascending: true });
    if (error)
      throwDataError("data.pass_guests.list_for_pass", error, { passId });
    return (data ?? []) as unknown as PassGuestRaw[];
  },
);

// Narrow read for the admin "manually mark redeemed" action. Only the fields
// the action touches — keeps the type tight and makes intent obvious.
export async function getPassGuestForRedeem(
  id: string,
): Promise<PassGuestForRedeem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pass_guests")
    .select("id, pass_id, redeemed_at")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throwDataError("data.pass_guests.get_for_redeem", error, { id });
  return data ?? null;
}

// Count of redeemed vs total for a set of passes — used on the admin list so
// each row can show "3/4 redeemed" without materializing the full guest list.
// Two batched queries (totals + redeemed) keep the trip count down vs. a
// per-pass request.
export async function listGuestCountsForPasses(
  passIds: string[],
): Promise<Map<string, { total: number; redeemed: number }>> {
  const out = new Map<string, { total: number; redeemed: number }>();
  if (passIds.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pass_guests")
    .select("pass_id, redeemed_at")
    .in("pass_id", passIds);
  if (error)
    throwDataError("data.pass_guests.list_counts", error, {
      passCount: passIds.length,
    });
  for (const row of data ?? []) {
    const entry = out.get(row.pass_id) ?? { total: 0, redeemed: 0 };
    entry.total += 1;
    if (row.redeemed_at) entry.redeemed += 1;
    out.set(row.pass_id, entry);
  }
  return out;
}
