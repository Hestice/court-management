"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatFacilityDate,
  formatHourRange,
} from "@/lib/timezone";
import {
  addDaysIso,
  GUEST_COUNT_MAX,
  GUEST_COUNT_MIN,
  NAME_MAX,
  PHONE_MAX,
  REASON_MAX,
} from "@/lib/zod-helpers";

import { createWalkInEntry } from "../actions";

export type LinkableBookingOption = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  court_name: string;
  customer_label: string;
};

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function NewEntryView({
  today,
  pricePerGuest,
  bookings,
}: {
  today: string;
  pricePerGuest: number;
  bookings: LinkableBookingOption[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [guestCount, setGuestCount] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bookingId, setBookingId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, startTransition] = useTransition();

  const safeGuests = Math.min(
    Math.max(Number.isFinite(guestCount) ? guestCount : 0, 0),
    GUEST_COUNT_MAX,
  );
  const total = pricePerGuest * safeGuests;

  // Default the booking-picker to today + a small window so recent + near-
  // future reservations are the only clutter. Matches listLinkableBookings
  // on the server; duplicated here only for the display label.
  const minDate = addDaysIso(today, -30);
  const maxDate = addDaysIso(today, 365);

  const bookingsByKey = useMemo(
    () => new Map(bookings.map((b) => [b.id, b])),
    [bookings],
  );

  function onSubmit() {
    if (safeGuests < GUEST_COUNT_MIN || safeGuests > GUEST_COUNT_MAX) return;
    startTransition(async () => {
      const res = await createWalkInEntry({
        entry_date: date,
        guest_count: safeGuests,
        walk_in_name: name.trim() || undefined,
        walk_in_phone: phone.trim() || undefined,
        linked_booking_id: bookingId || undefined,
        notes: notes.trim() || undefined,
      });
      if (res.success) {
        toast.success("Walk-in entry logged");
        router.push("/admin/entries");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/entries">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to entries
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Log walk-in entry
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record people entering without their own booking (spectators, casual
          entries, guests joining a friend&apos;s booking). Payment is
          collected at the gate.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Entry date</span>
          <Input
            type="date"
            value={date}
            min={minDate}
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
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Name <span className="text-muted-foreground">(optional)</span>
          </span>
          <Input
            value={name}
            maxLength={NAME_MAX}
            placeholder="Anonymous"
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
            maxLength={PHONE_MAX}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Link to existing booking{" "}
            <span className="text-muted-foreground">(optional)</span>
          </span>
          <select
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            disabled={submitting}
          >
            <option value="">Not linked</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.customer_label} · {b.court_name} ·{" "}
                {formatFacilityDate(b.booking_date)}{" "}
                {formatHourRange(b.start_hour, b.end_hour)}
              </option>
            ))}
          </select>
          {bookingId && bookingsByKey.get(bookingId) ? (
            <span className="text-xs text-muted-foreground">
              Linked to {bookingsByKey.get(bookingId)!.customer_label}
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Notes <span className="text-muted-foreground">(optional)</span>
          </span>
          <Textarea
            rows={3}
            maxLength={REASON_MAX}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />
          <span className="text-xs text-muted-foreground">
            {notes.length}/{REASON_MAX} characters
          </span>
        </label>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {safeGuests} {safeGuests === 1 ? "guest" : "guests"} ×{" "}
            {formatPHP(pricePerGuest)} ={" "}
            <span className="text-base font-semibold">{formatPHP(total)}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Total collected from the customer at the gate.
          </p>
        </div>

        <Button
          onClick={onSubmit}
          disabled={
            submitting ||
            safeGuests < GUEST_COUNT_MIN ||
            safeGuests > GUEST_COUNT_MAX
          }
        >
          {submitting ? "Saving…" : "Log entry"}
        </Button>
      </section>
    </>
  );
}
