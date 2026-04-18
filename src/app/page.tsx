import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Your Facility
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        Reserve a court online in minutes.
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/booking">Book a Court</Link>
      </Button>
    </main>
  );
}
