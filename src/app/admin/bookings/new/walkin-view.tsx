"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { loadAvailability } from "@/app/booking/availability-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AvailabilityStatus,
  CourtAvailability,
} from "@/lib/availability";
import {
  formatFacilityDate,
  formatHour,
  formatHourRange,
} from "@/lib/timezone";
import { addDaysIso, BOOKING_DATE_MAX_DAYS } from "@/lib/zod-helpers";
import { cn } from "@/lib/utils";

import { createWalkinBooking } from "../actions";

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: "Available",
  booked_pending: "Booked",
  booked_confirmed: "Booked",
  blocked: "Blocked",
  past: "Past",
  outside_hours: "Outside hours",
};

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function WalkinView({
  today,
  initialDate,
  initialAvailability,
  operatingStart,
  operatingEnd,
  maxDuration,
}: {
  today: string;
  initialDate: string;
  initialAvailability: CourtAvailability[];
  operatingStart: number;
  operatingEnd: number;
  maxDuration: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(initialDate);
  const [availability, setAvailability] =
    useState<CourtAvailability[]>(initialAvailability);
  const [courtId, setCourtId] = useState(
    initialAvailability[0]?.court.id ?? "",
  );
  const [startHour, setStartHour] = useState(operatingStart);
  const [duration, setDuration] = useState(1);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmitting] = useTransition();

  const maxDate = addDaysIso(today, BOOKING_DATE_MAX_DAYS);

  const selectedCourt = useMemo(
    () => availability.find((c) => c.court.id === courtId) ?? null,
    [availability, courtId],
  );

  const hoursInRange = useMemo(() => {
    const arr: number[] = [];
    for (let h = operatingStart; h < operatingEnd; h++) arr.push(h);
    return arr;
  }, [operatingStart, operatingEnd]);

  const maxPossibleDuration = useMemo(() => {
    if (!selectedCourt) return 0;
    const startSlot = selectedCourt.hours.find((h) => h.hour === startHour);
    if (!startSlot || startSlot.status !== "available") return 0;
    let count = 0;
    for (let h = startHour; h < operatingEnd; h++) {
      const slot = selectedCourt.hours.find((s) => s.hour === h);
      if (!slot || slot.status !== "available") break;
      count++;
    }
    return Math.min(count, maxDuration);
  }, [selectedCourt, startHour, operatingEnd, maxDuration]);

  const effectiveDuration =
    maxPossibleDuration === 0
      ? 0
      : Math.min(Math.max(1, duration), maxPossibleDuration);

  const summaryEndHour = startHour + effectiveDuration;
  const totalAmount =
    selectedCourt && effectiveDuration > 0
      ? selectedCourt.court.hourly_rate * effectiveDuration
      : 0;

  function handleDateChange(next: string) {
    if (!next || next === date) return;
    if (next < today || next > maxDate) return;
    setDate(next);
    startLoading(async () => {
      const res = await loadAvailability(next);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setAvailability(res.courts);
      if (!res.courts.some((c) => c.court.id === courtId)) {
        setCourtId(res.courts[0]?.court.id ?? "");
      }
      setStartHour(operatingStart);
      setDuration(1);
    });
  }

  function refreshAvailability() {
    startLoading(async () => {
      const res = await loadAvailability(date);
      if (res.success) setAvailability(res.courts);
    });
  }

  function onSubmit() {
    if (!name.trim() || !courtId || effectiveDuration === 0) return;
    startSubmitting(async () => {
      const res = await createWalkinBooking({
        walk_in_name: name.trim(),
        walk_in_phone: phone.trim() || undefined,
        court_id: courtId,
        booking_date: date,
        start_hour: startHour,
        duration_hours: effectiveDuration,
      });
      if (res.success) {
        toast.success("Walk-in booking created");
        router.push(`/admin/bookings/${res.bookingId}`);
      } else {
        toast.error(res.error);
        if (res.slotTaken) refreshAvailability();
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/bookings">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to bookings
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          New walk-in booking
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manually book a court for a customer who walked up. Payment is
          assumed collected in person — the booking is confirmed immediately.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Date</span>
              <Input
                type="date"
                value={date}
                min={today}
                max={maxDate}
                onChange={(e) => handleDateChange(e.target.value)}
                disabled={loading || submitting}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              {formatFacilityDate(date)}
            </p>
          </div>

          {availability.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No active courts to book.
            </div>
          ) : (
            <AvailabilityGrid
              availability={availability}
              hoursInRange={hoursInRange}
              loading={loading}
            />
          )}
        </section>

        <aside className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-background p-4 lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold">Walk-in details</h2>

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
            <span className="text-sm font-medium">Court</span>
            <select
              value={courtId}
              onChange={(e) => {
                setCourtId(e.target.value);
                setStartHour(operatingStart);
                setDuration(1);
              }}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={availability.length === 0 || loading || submitting}
            >
              {availability.map((c) => (
                <option key={c.court.id} value={c.court.id}>
                  {c.court.name} · {formatPHP(c.court.hourly_rate)}/hr
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Start time</span>
            <select
              value={String(startHour)}
              onChange={(e) => {
                setStartHour(Number(e.target.value));
                setDuration(1);
              }}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedCourt || loading || submitting}
            >
              {hoursInRange.map((h) => {
                const slot = selectedCourt?.hours.find((s) => s.hour === h);
                const available = slot?.status === "available";
                return (
                  <option key={h} value={h} disabled={!available}>
                    {formatHour(h)}
                    {!available && slot
                      ? ` — ${STATUS_LABEL[slot.status]}`
                      : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Duration</span>
            <select
              value={String(effectiveDuration)}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={maxPossibleDuration === 0 || loading || submitting}
            >
              {maxPossibleDuration === 0 ? (
                <option value="0">No hours available</option>
              ) : (
                Array.from({ length: maxPossibleDuration }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? "hour" : "hours"}
                    </option>
                  ),
                )
              )}
            </select>
            {maxPossibleDuration === 0 ? (
              <p className="text-xs text-destructive">
                Pick a start time that&apos;s marked available.
              </p>
            ) : null}
          </label>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            {selectedCourt && effectiveDuration > 0 ? (
              <div className="flex flex-col gap-1">
                <p>
                  <span className="font-medium">
                    {selectedCourt.court.name}
                  </span>
                  {" · "}
                  {formatFacilityDate(date)}
                </p>
                <p className="text-muted-foreground">
                  {formatHourRange(startHour, summaryEndHour)} (
                  {effectiveDuration}{" "}
                  {effectiveDuration === 1 ? "hour" : "hours"})
                </p>
                <p className="font-semibold">{formatPHP(totalAmount)}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Pick a court and start time to see the total.
              </p>
            )}
          </div>

          <Button
            onClick={onSubmit}
            disabled={
              submitting ||
              loading ||
              !name.trim() ||
              !courtId ||
              effectiveDuration === 0
            }
          >
            {submitting ? "Creating…" : "Create booking"}
          </Button>
          <p className="text-xs text-muted-foreground">
            This booking goes straight to confirmed — no pending state and no
            receipt collection.
          </p>
        </aside>
      </div>
    </>
  );
}

function AvailabilityGrid({
  availability,
  hoursInRange,
  loading,
}: {
  availability: CourtAvailability[];
  hoursInRange: number[];
  loading: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-border",
        loading && "opacity-60",
      )}
      aria-busy={loading}
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/40">
            <th className="sticky left-0 z-10 w-32 bg-muted/40 px-3 py-2 text-left font-medium">
              Court
            </th>
            {hoursInRange.map((h) => (
              <th
                key={h}
                className="min-w-14 px-2 py-2 text-center font-medium"
              >
                {formatHour(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {availability.map((c) => (
            <tr key={c.court.id} className="border-t border-border">
              <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">
                {c.court.name}
              </td>
              {hoursInRange.map((h) => {
                const slot = c.hours.find((s) => s.hour === h);
                return (
                  <td
                    key={h}
                    className="border-l border-border p-0.5"
                    title={
                      slot
                        ? `${formatHour(h)} — ${STATUS_LABEL[slot.status]}`
                        : undefined
                    }
                  >
                    <Cell status={slot?.status ?? "outside_hours"} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ status }: { status: AvailabilityStatus }) {
  const base = "h-6 w-full rounded-sm";
  switch (status) {
    case "available":
      return (
        <div
          className={cn(
            base,
            "bg-emerald-100 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700",
          )}
        />
      );
    case "booked_pending":
      return (
        <div
          className={cn(
            base,
            "bg-amber-100 ring-1 ring-inset ring-amber-300 dark:bg-amber-900/30 dark:ring-amber-700",
          )}
        />
      );
    case "booked_confirmed":
      return (
        <div
          className={cn(
            base,
            "bg-muted-foreground/30 ring-1 ring-inset ring-muted-foreground/40",
          )}
        />
      );
    case "blocked":
      return (
        <div
          className={cn(
            base,
            "ring-1 ring-inset ring-border bg-[repeating-linear-gradient(135deg,theme(colors.muted.DEFAULT)_0_4px,transparent_4px_8px)]",
          )}
        />
      );
    case "past":
      return <div className={cn(base, "bg-muted/40")} />;
    case "outside_hours":
      return <div className={cn(base, "bg-transparent")} />;
  }
}
