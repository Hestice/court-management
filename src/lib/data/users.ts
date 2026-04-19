import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { throwDataError } from "./_shared";

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

// Role-only read. This is the most-called user query in the codebase —
// middleware, server actions, nav — so caching it per request matters.
export const getUserRole = cache(
  async (userId: string): Promise<string | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (error) throwDataError("data.users.get_role", error, { userId });
    return data?.role ?? null;
  },
);

export const isUserAdmin = cache(async (userId: string): Promise<boolean> => {
  return (await getUserRole(userId)) === "admin";
});

export const getUserProfile = cache(
  async (userId: string): Promise<UserProfile | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name, role")
      .eq("id", userId)
      .maybeSingle();
    if (error) throwDataError("data.users.get_profile", error, { userId });
    return data ?? null;
  },
);
