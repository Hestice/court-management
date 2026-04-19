import { redirect } from "next/navigation";

// Passes were rolled into bookings — QR codes now live on /my-bookings.
export default function MyPassesPage() {
  redirect("/my-bookings");
}
