import { redirect } from "next/navigation";

// The booking flow now lands straight on /payment/[id]. This route remains
// as a permanent redirect so any stale bookmarks or browser back-forward
// navigations still reach the right place.
export default async function BookingConfirmationRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/payment/${id}`);
}
