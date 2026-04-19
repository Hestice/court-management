import { redirect } from "next/navigation";

// Entrance pass is merged into the booking flow — every booking includes
// per-head entrance. Legacy /entrance URLs bounce to /booking so external
// links and bookmarks still land somewhere sensible.
export default function EntrancePage() {
  redirect("/booking?from=entrance");
}
