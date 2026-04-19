# Data Layer

The Court Management System uses a single convention for Supabase access: **centralized reads, co-located writes**. This doc is the whole rulebook — read it once and you'll know where every query belongs.

## The shape

- **`src/lib/data/<entity>.ts`** — read functions, one file per table (`bookings.ts`, `courts.ts`, `facility-settings.ts`, …). Server-only. No side effects.
- **`src/app/**/actions.ts`** — server actions (writes). Co-located with the route that uses them. Validate → authorize → call data-layer reads → mutate → revalidate.
- **`src/lib/actions.ts`** — tiny helpers (`requireUser`, `requireAdmin`, `ActionResult`) shared across action files.

Supabase clients never live in pages, components, or ad-hoc helpers. If it reads the DB, it goes through `src/lib/data/`.

## Naming

Within each entity file:

- `get<Entity>(id)` — single row by id, returns `<Entity> | null`
- `list<Entity>({ filters })` — multiple rows, returns `<Entity>[]` (empty when nothing matches)
- `count<Entity>({ filters })` — a number
- Domain-specific reads get a verb phrase: `getLatestCourtHourlyRate`, `listActivePaymentMethods`, `listOverlappingBookings`, `listBookingActivity`.

Use narrow per-action reads when a server action only needs a few columns:

- `getBookingForOwnership(id)` returns `{ id, user_id, status, payment_receipt_url }`
- `getBookingForApprove(id)` returns `{ id, status, payment_receipt_url }`

This keeps the SQL tight, the type of the return precise, and makes it obvious at a glance what a given action touches.

## Rules for read functions

1. **Server-only.** Every file starts with `import "server-only"`. Never import a data-layer function from a client component.
2. **Typed input and output.** No `any`, no untyped `data`. Relations use named types (`BookingRaw`, `BlockedSlotWithRelations`).
3. **Throw on unexpected errors, return null/[] for missing data.**
   - Use `throwDataError(action, error, context?)` from `./_shared.ts`. It logs through `logError` then throws a generic `DataLayerError` that surfaces via Next's error boundary — raw DB messages never reach the UI.
   - Return `null` when a `maybeSingle()` finds nothing, `[]` when a list is empty.
4. **Per-request dedupe with `React.cache()`.** Wrap every read in `cache(...)`. Two components rendering the same page that both call `getFacilitySettings()` hit Supabase once.
5. **No mutations.** Reads are pure. If you need to write, do it in a server action.

## Rules for server actions

Every action follows the same skeleton:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions";
import { getBookingForApprove } from "@/lib/data/bookings";
import { logError } from "@/lib/logger";

export async function approveBooking(bookingId: string): Promise<ActionResult> {
  // 1. validate input
  const parsed = approveSchema.safeParse({ bookingId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // 2. authorize server-side (never trust the client)
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, userId } = auth;

  // 3. read via the data layer
  const booking = await getBookingForApprove(bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (booking.status !== "pending") {
    return { success: false, error: `Booking is already ${booking.status}.` };
  }

  // 4. mutate inline (writes are action-specific)
  const { error } = await supabase
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", bookingId);
  if (error) {
    logError("booking.approve_failed", error, { bookingId });
    return { success: false, error: "Couldn't approve booking." };
  }

  // 5. audit log (optional, but required for booking state changes)
  await logAuditEvent("booking.approved", {
    actorUserId: userId,
    metadata: { booking_id: bookingId },
  });

  // 6. revalidate every route that renders this booking
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/my-bookings");

  return { success: true };
}
```

### Non-negotiables

- **Zod validate** at the top of every action, even for a single string arg when the input crosses a trust boundary.
- **Server-side permission re-check** via `requireUser()` / `requireAdmin()`. RLS is a backstop, not the primary gate.
- **Typed `ActionResult`.** Always `{ success: true } | { success: false; error: string }` (plus optional `data` or flag fields like `slotTaken`). Never throw to the client; never return an unshaped error.
- **Sanitize errors.** A user sees `"Couldn't approve booking."`, not `new row violates row-level security policy for table "bookings"`. Log the raw error via `logError`; return a friendly string.
- **Revalidate every affected route.** If the mutation changes data rendered at `/admin/bookings`, revalidate `/admin/bookings`. Missed revalidation is the #1 source of stale UI after an action.

### When to inline vs. extract a write

**Mutations stay in the action.** Each action has its own validation chain, audit metadata, and side-effect ordering — trying to abstract "update booking status" into the data layer ends up with an API that either leaks flags (`bypassStatusCheck: true`) or forces every caller to duplicate the same pre-checks. Keep writes inline.

**Exception:** if the same write appears in ≥2 actions *with identical semantics and validation*, extract it. Not before.

## Caching

Two layers work together:

### `React.cache()` — per-request dedupe

Used on every data-layer read. Cheap, automatic, scoped to a single render. Two server components that both call `listActiveCourts()` hit Supabase once per page render.

### `unstable_cache` — cross-request cache with tags

Used for data that changes rarely and is read everywhere. Currently applied to `facility_settings` (tag: `FACILITY_SETTINGS_TAG`).

```ts
// src/lib/data/facility-settings.ts
const cachedFetch = unstable_cache(fetchFacilitySettings, ["facility-settings-v1"], {
  tags: [FACILITY_SETTINGS_TAG],
  revalidate: 3600,
});
```

The update action in `src/app/admin/settings/actions.ts` calls `updateTag(FACILITY_SETTINGS_TAG)` after a successful mutation — Next 16's read-your-own-writes primitive. Settings changes are visible immediately.

**When to add `unstable_cache`:**

- Data is read by many pages / many renders.
- Row is either public or has the same value for every caller (no per-user RLS divergence).
- You have a clear invalidation point (a single action that owns mutations on that entity).

**When *not* to:** per-user data (bookings, sessions), high-churn tables (audit logs), anything where staleness would surprise the user.

### `revalidatePath` vs `revalidateTag`/`updateTag`

- **`revalidatePath(path)`** — drops the rendered output and any `fetch()` cache for that route. Use after every mutation that affects visible pages.
- **`updateTag(tag)`** — inside a server action, immediately expires any `unstable_cache` entry with that tag. Use for read-your-own-writes.
- **`revalidateTag(tag, "max")`** — same idea, but safe outside server actions (route handlers, webhooks). Current code uses `updateTag` because all our tag-backed data is mutated from server actions only.

### Pitfall: double-invalidation

If the action calls `revalidatePath(route)` and the caller also calls `router.refresh()`, the client re-fetches twice. Pick one — we default to `revalidatePath` on the server and let Next.js push the update. `router.refresh()` is only needed when the action doesn't know which route to revalidate (rare).

## Adding a new entity

1. Create `src/lib/data/<entity>.ts`.
2. Export typed row shape(s).
3. Add reads following the naming above. Wrap in `cache(...)`. Handle errors with `throwDataError`.
4. For writes, add a server action in the route where it's used. Co-locate with the page.
5. Revalidate every route that renders the entity.
6. If reads are frequent and the row is user-agnostic, consider `unstable_cache` with a tag — and add the matching `updateTag` call in whatever action mutates it.

## Common pitfalls

- **Inline queries in pages.** If you're writing `supabase.from("...")` outside `src/lib/data/` (reads) or a server action (writes), stop — add a data-layer function instead.
- **Raw error.message in returned errors.** Log the raw message with `logError`; return a sanitized one.
- **Mutation-only actions that skip revalidation.** The UI will look right until the next deploy and then break mysteriously. Always revalidate.
- **Wrapping user-scoped reads in `unstable_cache`.** The first caller's data gets served to everyone. Use `React.cache()` instead for anything that depends on `auth.getUser()` context.
- **Returning `{ success: boolean; error?: string }` loosely.** Use the discriminated union `{ success: true } | { success: false; error: string }` so TypeScript narrows on `success`.

## Reference

- Shared helpers: `src/lib/actions.ts` (`requireUser`, `requireAdmin`, result types)
- Error helper: `src/lib/data/_shared.ts` (`throwDataError`, `DataLayerError`)
- Supabase clients: `src/lib/supabase/server.ts` (user-scoped), `src/lib/supabase/service.ts` (service role — restricted use; see its doc comment)
- Audit logging: `src/lib/audit.ts`
- Structured error logging: `src/lib/logger.ts`
