import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Payment Instructions" };

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title="Payment Instructions"
      description={`Pay and upload a receipt for booking or pass ${id}.`}
    />
  );
}
