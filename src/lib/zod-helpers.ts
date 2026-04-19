import * as z from "zod";

// Shared length caps. Keep these as single source of truth so both the
// schemas and the DB migrations (when we add CHECK constraints) can reference
// the same numbers.
export const NAME_MAX = 100;
export const MESSAGE_MAX = 2000;
export const REASON_MAX = 500;
export const PHONE_MAX = 40;
export const EMAIL_MAX = 254; // RFC 5321

// Upper bound on future dates, per data-entry surface.
export const BOOKING_DATE_MAX_DAYS = 90;
export const PASS_DATE_MAX_DAYS = 90;
export const BLOCK_DATE_MAX_DAYS = 365;

// Monetary bounds (PHP). Upper bound keeps a bad admin (or a tampered form)
// from persisting absurd values. 100k/hr covers any realistic court rate.
export const HOURLY_RATE_MAX = 100_000;

// Guest count bounds for entrance passes.
export const GUEST_COUNT_MIN = 1;
export const GUEST_COUNT_MAX = 50;

// Add N days to a YYYY-MM-DD string, returning YYYY-MM-DD. Treats the input
// as a calendar date (timezone-free) — appropriate for comparing facility-local
// dates that are already normalized.
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Very conservative rejection of anything that looks like embedded HTML.
// We don't render user text via dangerouslySetInnerHTML, so React already
// escapes output — but persisting tags is still a signal of abuse and keeps
// future email/export surfaces safe without extra sanitization. Treat `<` or
// `&#` followed by a letter/bang/hash as suspicious; whitespace and common
// punctuation are fine.
const HTML_LIKE_RE = /<[a-zA-Z!/]|&#[0-9a-zA-Z]/;

export function looksLikeHtml(s: string): boolean {
  return HTML_LIKE_RE.test(s);
}

// Trimmed, length-bounded text that rejects HTML-like content. Use this for
// every user-editable free-text field (names, reasons, messages, admin notes).
export function safeText(
  opts: { min?: number; max: number; label?: string } = { max: NAME_MAX },
): z.ZodString {
  const { min = 0, max, label = "Value" } = opts;
  let schema = z
    .string()
    .trim()
    .max(max, { message: `${label} must be ${max} characters or less.` })
    .refine((s) => !looksLikeHtml(s), {
      message: `${label} must not contain HTML.`,
    });
  if (min > 0) {
    schema = schema.min(min, { message: `${label} must be at least ${min} characters.` });
  }
  return schema as unknown as z.ZodString;
}

// Build an ISO YYYY-MM-DD schema that checks the date falls in [today, today+maxDays]
// in the facility's local calendar. Import FACILITY_TIMEZONE via the timezone helper
// at the call site and pass `today` in (validator is synchronous).
export function dateBetween(
  today: string,
  maxDays: number,
  label = "Date",
): z.ZodString {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: `${label} must be a date.` })
    .refine((d) => d >= today, {
      message: `${label} must be today or later.`,
    })
    .refine(
      (d) => {
        const [y, m, day] = d.split("-").map(Number);
        const [ty, tm, td] = today.split("-").map(Number);
        const dt = Date.UTC(y, m - 1, day);
        const tt = Date.UTC(ty, tm - 1, td);
        return (dt - tt) / (24 * 60 * 60 * 1000) <= maxDays;
      },
      { message: `${label} must be within ${maxDays} days.` },
    ) as unknown as z.ZodString;
}
