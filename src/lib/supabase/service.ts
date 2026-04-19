import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client. Bypasses RLS; use ONLY in server code after
// the caller's identity + authorization have already been verified by the
// route's normal auth flow (middleware + explicit ownership check).
//
// This exists because Supabase Storage evaluates RLS inside the storage
// service's own connection pool, which applies policy changes inconsistently
// in the presence of cached query plans — even a `WITH CHECK (true)` policy
// can return "new row violates row-level security policy" until the pool
// recycles. Going through the service role skips the whole class of issues
// and is the officially-recommended pattern for server-side admin operations.
//
// Never import this file from a module that can run in the browser. The
// service role key MUST NOT ship to the client.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local — get the value from Supabase Dashboard → Project Settings → API.",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
