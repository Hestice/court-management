// Back-compat re-export. The implementation moved to src/lib/data/availability.ts
// as part of the data-layer refactor. New code should import from there
// directly; existing client components keep working via this barrel.
export {
  getAvailability,
  type AvailabilityStatus,
  type CourtAvailability,
  type HourAvailability,
  type AvailabilityParams,
} from "@/lib/data/availability";
