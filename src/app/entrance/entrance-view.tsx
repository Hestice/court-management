"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFacilityDate } from "@/lib/timezone";
import { GUEST_COUNT_MAX, GUEST_COUNT_MIN } from "@/lib/zod-helpers";

import { purchasePass } from "./actions";

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function EntranceView({
  today,
  maxDate,
  pricePerGuest,
}: {
  today: string;
  maxDate: string;
  pricePerGuest: number;
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [guestCount, setGuestCount] = useState(1);
  const [submitting, startTransition] = useTransition();

  const safeGuests = Math.min(
    Math.max(Number.isFinite(guestCount) ? guestCount : 0, 0),
    GUEST_COUNT_MAX,
  );
  const total = pricePerGuest * safeGuests;
  const canSubmit =
    safeGuests >= GUEST_COUNT_MIN &&
    safeGuests <= GUEST_COUNT_MAX &&
    date >= today &&
    date <= maxDate;

  function onSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await purchasePass({
        pass_date: date,
        guest_count: safeGuests,
      });
      if (res.success) {
        router.push(`/payment/${res.passId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-background p-5">
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
          You&apos;ll upload payment on the next page. QR codes are issued
          after admin confirms your receipt.
        </p>
      </div>

      <Button onClick={onSubmit} disabled={submitting || !canSubmit}>
        {submitting ? "Creating…" : "Buy pass"}
      </Button>
    </section>
  );
}
