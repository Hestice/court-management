import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Booking Detail — Admin" };

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title="Booking Detail"
      description={`Review, approve, reschedule, or cancel booking ${id}.`}
    />
  );
}
