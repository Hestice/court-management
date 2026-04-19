"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFacilityDate } from "@/lib/timezone";
import { GUEST_COUNT_MAX, GUEST_COUNT_MIN } from "@/lib/zod-helpers";

import { createWalkinPass } from "../actions";

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function WalkinPassView({
  today,
  maxDate,
  pricePerGuest,
}: {
  today: string;
  maxDate: string;
  pricePerGuest: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(today);
  const [guestCount, setGuestCount] = useState(1);
  const [submitting, startTransition] = useTransition();

  const safeGuests = Math.min(
    Math.max(Number.isFinite(guestCount) ? guestCount : 0, 0),
    GUEST_COUNT_MAX,
  );
  const total = pricePerGuest * safeGuests;
  const canSubmit =
    !!name.trim() &&
    safeGuests >= GUEST_COUNT_MIN &&
    safeGuests <= GUEST_COUNT_MAX &&
    date >= today &&
    date <= maxDate;

  function onSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createWalkinPass({
        walk_in_name: name.trim(),
        walk_in_phone: phone.trim() || undefined,
        pass_date: date,
        guest_count: safeGuests,
      });
      if (res.success) {
        toast.success("Walk-in pass created");
        router.push(`/admin/passes/${res.passId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/passes">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to passes
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          New walk-in pass
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a pass for a guest who walked up. Payment is assumed collected
          in person — the pass is confirmed immediately.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <Input
            value={name}
            maxLength={100}
            placeholder="e.g. Juan dela Cruz"
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Phone <span className="text-muted-foreground">(optional)</span>
          </span>
          <Input
            value={phone}
            maxLength={40}
            placeholder="e.g. 0917 123 4567"
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Date</span>
          <Input
            type="date"
            value={date}
            min={today}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            disabled={submitting}
          />
          <span className="text-xs text-muted-foreground">
            {formatFacilityDate(date)}
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Number of guests</span>
          <Input
            type="number"
            inputMode="numeric"
            min={GUEST_COUNT_MIN}
            max={GUEST_COUNT_MAX}
            step={1}
            value={Number.isFinite(guestCount) ? guestCount : ""}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              setGuestCount(Number.isFinite(n) ? Math.floor(n) : 0);
            }}
            disabled={submitting}
          />
          <span className="text-xs text-muted-foreground">
            Between {GUEST_COUNT_MIN} and {GUEST_COUNT_MAX}.
          </span>
        </label>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {safeGuests} {safeGuests === 1 ? "guest" : "guests"} ×{" "}
            {formatPHP(pricePerGuest)} ={" "}
            <span className="text-base font-semibold">{formatPHP(total)}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Goes straight to confirmed — no receipt collected.
          </p>
        </div>

        <Button onClick={onSubmit} disabled={submitting || !canSubmit}>
          {submitting ? "Creating…" : "Create pass"}
        </Button>
      </section>
    </>
  );
}
