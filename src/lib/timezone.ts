// Single-facility MVP: treat the facility as operating in Manila time so that
// "today" and the current hour match what a customer at the facility would see.
// All date/hour math in the app should route through the helpers here rather
// than calling `new Date()` directly, so that swapping this string (or making
// it configurable per facility) is the only change needed later.
export const FACILITY_TIMEZONE = "Asia/Manila";

export type FacilityNow = { today: string; currentHour: number };

// Returns today's date (YYYY-MM-DD) and the current hour (0–23) as seen in
// the facility's local timezone. Uses en-CA because its short date format is
// ISO (YYYY-MM-DD) — easier than assembling parts from en-US.
export function facilityNow(): FacilityNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FACILITY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  // en-CA with hour12=false emits "24" at the instant that would otherwise be
  // midnight of the following day; normalize it back to 0.
  const rawHour = Number(parts.find((p) => p.type === "hour")!.value);
  const currentHour = rawHour === 24 ? 0 : rawHour;

  return { today: `${year}-${month}-${day}`, currentHour };
}

export function todayInFacility(): string {
  return facilityNow().today;
}

// e.g. 14 → "2pm", 0 → "12am", 12 → "12pm", 24 → "12am"
export function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized < 12 ? "am" : "pm";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display}${suffix}`;
}

export function formatHourRange(start: number, end: number): string {
  return `${formatHour(start)}–${formatHour(end)}`;
}

// Parses a YYYY-MM-DD string into a pretty display string ("Sat, Apr 25, 2026").
// We intentionally treat the date as calendar-only (no timezone) so that the
// string the admin stored renders identically regardless of where the reader is.
export function formatFacilityDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
