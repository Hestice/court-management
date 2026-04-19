import { listConfirmedBookingsForDateWithGuests } from "@/lib/data/bookings";
import { todayInFacility } from "@/lib/timezone";

import { ScannerView, type ScanSearchBooking } from "./scanner-view";

export const metadata = { title: "QR Scanner — Admin" };

export default async function AdminScanPage() {
  const today = todayInFacility();
  const bookings = await listConfirmedBookingsForDateWithGuests(today);

  const rows: ScanSearchBooking[] = bookings.map((b) => ({
    id: b.id,
    start_hour: b.start_hour,
    end_hour: b.end_hour,
    court_name: b.court?.name ?? "—",
    customer_name: b.customer?.name ?? null,
    customer_email: b.customer?.email ?? null,
    walk_in_name: b.walk_in_name,
    guest_count: b.guest_count,
    guests: [...b.guests]
      .sort((a, b) => a.guest_number - b.guest_number)
      .map((g) => ({
        id: g.id,
        guest_number: g.guest_number,
        qr_code: g.qr_code,
        redeemed_at: g.redeemed_at,
        redeemed_by_name:
          g.redeemed_by_user?.name ?? g.redeemed_by_user?.email ?? null,
      })),
  }));

  return <ScannerView today={today} bookings={rows} />;
}
