// Shared helpers for the data-layer (src/lib/data/*).
//
// The data layer is server-only. Every read function here:
// - uses the request-scoped Supabase server client
// - is wrapped in React.cache() so identical calls within a single request
//   dedupe (rendering the same page twice in one render will hit the DB once)
// - throws on unexpected DB errors (bubbles to Next.js error.tsx) and returns
//   null / [] for "not found"
//
// Never import these from a client component.

import "server-only";

import { logError } from "@/lib/logger";

// Thrown when a data-layer read hits an unexpected Supabase error. The raw
// message is logged via logError for Vercel's log pane; callers see a
// generic Error that bubbles to Next's error boundary.
export class DataLayerError extends Error {
  constructor(public action: string) {
    super(`data layer: ${action} failed`);
    this.name = "DataLayerError";
  }
}

// Log + throw helper. Each data-layer function pattern:
//   const { data, error } = await supabase.from(...)...;
//   if (error) throwDataError("entity.op", error, context);
//   return data ?? fallback;
export function throwDataError(
  action: string,
  error: unknown,
  context?: Record<string, unknown>,
): never {
  logError(action, error, context);
  throw new DataLayerError(action);
}
