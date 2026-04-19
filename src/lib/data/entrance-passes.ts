import "server-only";

// Stub — the entrance-pass feature is out of scope for the current MVP slice.
// When it lands, export:
//   getEntrancePass(id)
//   listEntrancePassesForUser(userId)
//   listEntrancePasses({ date?, status? })
//   listPassGuestsForPass(passId)
// Follow the pattern in bookings.ts: cache() per request, BookingRaw-style
// typed row, thin "for<Action>" reads for server actions.
export {};
