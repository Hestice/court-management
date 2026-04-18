import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <PagePlaceholder
      title="Contact Us"
      description="Send us a message about events, corporate bookings, or anything else."
    >
      <p className="text-sm text-muted-foreground">
        The inquiry form arrives in a later step. For now, reach us at{" "}
        <a
          href="mailto:hello@yourcourt.com"
          className="font-medium text-primary hover:underline"
        >
          hello@yourcourt.com
        </a>
        .
      </p>
    </PagePlaceholder>
  );
}
