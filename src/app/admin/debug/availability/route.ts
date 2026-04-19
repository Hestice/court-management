import { NextResponse, type NextRequest } from "next/server";

import { getAvailability } from "@/lib/availability";

// Temporary sanity-check endpoint for getAvailability. Remove once the
// customer booking grid is built on top of it.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const courtId = searchParams.get("courtId") ?? undefined;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date query param required in YYYY-MM-DD format" },
      { status: 400 },
    );
  }

  try {
    const availability = await getAvailability({ date, courtId });
    return NextResponse.json({ date, courtId: courtId ?? null, availability });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
