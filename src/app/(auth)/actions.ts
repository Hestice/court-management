"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  checkPreset,
  formatRetryAfter,
  getRequestIp,
} from "@/lib/rate-limit";

export type AuthResult = { error?: string } | void;

export async function login(_prev: AuthResult, formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const ip = await getRequestIp();
  const rate = await checkPreset("login", ip);
  if (!rate.allowed) {
    return { error: `Too many login attempts. ${formatRetryAfter(rate.retryAfterSeconds)}` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let redirectTo = next && next.startsWith("/") ? next : "/";
  if (user && !next) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "admin") {
      redirectTo = "/admin";
    }
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function register(_prev: AuthResult, formData: FormData): Promise<AuthResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const origin = String(formData.get("origin") ?? "");

  if (name.length < 2) {
    return { error: "Name must be at least 2 characters." };
  }
  if (name.length > 100) {
    return { error: "Name must be 100 characters or less." };
  }
  if (/<[a-zA-Z!/]|&#[0-9a-zA-Z]/.test(name)) {
    return { error: "Name must not contain HTML." };
  }
  if (email.length > 254) {
    return { error: "Email is too long." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password.length > 128) {
    return { error: "Password must be 128 characters or less." };
  }

  const ip = await getRequestIp();
  const rate = await checkPreset("register", ip);
  if (!rate.allowed) {
    return {
      error: `Too many signups from this address. ${formatRetryAfter(rate.retryAfterSeconds)}`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  if (!data.session) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
