"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AvailabilityStatus, CourtAvailability } from "@/lib/availability";
import {
  formatFacilityDate,
  formatHour,
  formatHourRange,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

import { loadAvailability } from "./availability-action";
import { createBooking } from "./actions";

const MAX_DAYS_AHEAD = 30;

// Keep these in sync with AvailabilityStatus. Outside-hours cells are rendered
// as invisible placeholders so columns line up across courts.
const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: "Available",
  booked_pending: "Booked",
  booked_confirmed: "Booked",
  blocked: "Blocked",
  past: "Past",
  outside_hours: "Outside hours",
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BookingView({
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
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [availability, setAvailability] =
    useState<CourtAvailability[]>(initialAvailability);
  const [selectedCourtId, setSelectedCourtId] = useState<string>(
    initialAvailability[0]?.court.id ?? "",
  );
  const [selectedStartHour, setSelectedStartHour] = useState<number>(
    operatingStart,
  );
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [loading, startLoadTransition] = useTransition();
  const [submitting, startSubmitTransition] = useTransition();
  const router = useRouter();

  const maxDate = addDays(today, MAX_DAYS_AHEAD);

  const selectedCourt = useMemo(
    () => availability.find((c) => c.court.id === selectedCourtId) ?? null,
    [availability, selectedCourtId],
  );

  const hoursInRange = useMemo(() => {
    const arr: number[] = [];
    for (let h = operatingStart; h < operatingEnd; h++) arr.push(h);
    return arr;
  }, [operatingStart, operatingEnd]);

  // Walk forward from selectedStartHour on the selected court and count
  // consecutive 'available' slots. That count caps the duration dropdown
  // (further capped by max_booking_duration_hours from settings).
  const maxPossibleDuration = useMemo(() => {
    if (!selectedCourt) return 0;
    const startSlot = selectedCourt.hours.find(
      (h) => h.hour === selectedStartHour,
    );
    if (!startSlot || startSlot.status !== "available") return 0;
    let count = 0;
    for (let h = selectedStartHour; h < operatingEnd; h++) {
      const slot = selectedCourt.hours.find((s) => s.hour === h);
      if (!slot || slot.status !== "available") break;
      count++;
    }
    return Math.min(count, maxDuration);
  }, [selectedCourt, selectedStartHour, operatingEnd, maxDuration]);

  const durationOptions = useMemo(() => {
    const out: number[] = [];
    for (let d = 1; d <= maxPossibleDuration; d++) out.push(d);
    return out;
  }, [maxPossibleDuration]);

  // Clamp duration into the valid range whenever the upper bound changes
  // (e.g. switching courts or start time). useMemo for derived clamped value
  // avoids a sync effect loop.
  const effectiveDuration =
    maxPossibleDuration === 0
      ? 0
      : Math.min(Math.max(1, selectedDuration), maxPossibleDuration);

  function handleDateChange(next: string) {
    if (!next || next === selectedDate) return;
    if (next < today || next > maxDate) return;
    setSelectedDate(next);
    startLoadTransition(async () => {
      const result = await loadAvailability(next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setAvailability(result.courts);
      // Keep the selected court if it still exists; otherwise reset to first.
      const stillExists = result.courts.some(
        (c) => c.court.id === selectedCourtId,
      );
      if (!stillExists) {
        setSelectedCourtId(result.courts[0]?.court.id ?? "");
      }
      // Reset start hour + duration — the prior selection may no longer be
      // available (e.g. past hours shift when date becomes today).
      setSelectedStartHour(operatingStart);
      setSelectedDuration(1);
    });
  }

  function handleCourtChange(id: string) {
    setSelectedCourtId(id);
    setSelectedStartHour(operatingStart);
    setSelectedDuration(1);
  }

  function handleStartChange(hour: number) {
    setSelectedStartHour(hour);
    setSelectedDuration(1);
  }

  function refreshAvailability() {
    startLoadTransition(async () => {
      const result = await loadAvailability(selectedDate);
      if (result.success) setAvailability(result.courts);
    });
  }

  function handleSubmit() {
    if (!selectedCourtId || effectiveDuration === 0) return;
    startSubmitTransition(async () => {
      const result = await createBooking({
        court_id: selectedCourtId,
        booking_date: selectedDate,
        start_hour: selectedStartHour,
        duration_hours: effectiveDuration,
      });
      if (result.success) {
        router.push(`/booking/confirmation/${result.bookingId}`);
      } else {
        toast.error(result.error);
        if (result.slotTaken) refreshAvailability();
      }
    });
  }

  // Offer every operating hour as a start option; individual options are
  // disabled below when that hour isn't 'available' on the selected court.
  const startHourOptions = hoursInRange;

  const totalAmount =
    selectedCourt && effectiveDuration > 0
      ? selectedCourt.court.hourly_rate * effectiveDuration
      : 0;
  const summaryEndHour = selectedStartHour + effectiveDuration;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="booking-date"
              className="text-sm font-medium"
            >
              Date
            </label>
            <Input
              id="booking-date"
              type="date"
              value={selectedDate}
              min={today}
              max={maxDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-auto"
              disabled={loading}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatFacilityDate(selectedDate)}
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

        <Legend />
      </section>

      <aside className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-background p-4 lg:sticky lg:top-6">
        <h2 className="text-lg font-semibold">Reserve a court</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="booking-court" className="text-sm font-medium">
            Court
          </label>
          <SelectInput
            id="booking-court"
            value={selectedCourtId}
            onChange={handleCourtChange}
            disabled={availability.length === 0 || loading}
          >
            {availability.map((c) => (
              <option key={c.court.id} value={c.court.id}>
                {c.court.name} · {formatPHP(c.court.hourly_rate)}/hr
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="booking-start" className="text-sm font-medium">
            Start time
          </label>
          <SelectInput
            id="booking-start"
            value={String(selectedStartHour)}
            onChange={(v) => handleStartChange(Number(v))}
            disabled={!selectedCourt || loading}
          >
            {startHourOptions.map((h) => {
              const slot = selectedCourt?.hours.find((s) => s.hour === h);
              const isAvailable = slot?.status === "available";
              return (
                <option key={h} value={h} disabled={!isAvailable}>
                  {formatHour(h)}
                  {!isAvailable && slot
                    ? ` — ${STATUS_LABEL[slot.status]}`
                    : ""}
                </option>
              );
            })}
          </SelectInput>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="booking-duration" className="text-sm font-medium">
            Duration
          </label>
          <SelectInput
            id="booking-duration"
            value={String(effectiveDuration)}
            onChange={(v) => setSelectedDuration(Number(v))}
            disabled={durationOptions.length === 0 || loading}
          >
            {durationOptions.length === 0 ? (
              <option value="0">No hours available</option>
            ) : (
              durationOptions.map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "hour" : "hours"}
                </option>
              ))
            )}
          </SelectInput>
          {maxPossibleDuration === 0 ? (
            <p className="text-xs text-destructive">
              This start time isn&apos;t available. Pick a different time or
              court.
            </p>
          ) : maxPossibleDuration < maxDuration ? (
            <p className="text-xs text-muted-foreground">
              Capped at {maxPossibleDuration}{" "}
              {maxPossibleDuration === 1 ? "hour" : "hours"} — the next slot is
              already taken.
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          {selectedCourt && effectiveDuration > 0 ? (
            <div className="flex flex-col gap-1">
              <p>
                <span className="font-medium">{selectedCourt.court.name}</span>
                {" · "}
                {formatFacilityDate(selectedDate)}
              </p>
              <p className="text-muted-foreground">
                {formatHourRange(selectedStartHour, summaryEndHour)} (
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
          onClick={handleSubmit}
          disabled={
            submitting ||
            loading ||
            !selectedCourtId ||
            effectiveDuration === 0
          }
        >
          {submitting ? "Reserving…" : "Reserve"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Your booking stays pending until an admin confirms your payment.
        </p>
      </aside>
    </div>
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
            "bg-emerald-100 ring-1 ring-inset ring-emerald-300 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:ring-emerald-700",
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
          className={cn(base, "bg-muted-foreground/30 ring-1 ring-inset ring-muted-foreground/40")}
        />
      );
    case "blocked":
      return (
        <div
          className={cn(
            base,
            "ring-1 ring-inset ring-border",
            "bg-[repeating-linear-gradient(135deg,theme(colors.muted.DEFAULT)_0_4px,transparent_4px_8px)]",
          )}
        />
      );
    case "past":
      return <div className={cn(base, "bg-muted/40")} />;
    case "outside_hours":
      return <div className={cn(base, "bg-transparent")} />;
  }
}

function Legend() {
  const items: { status: AvailabilityStatus; label: string }[] = [
    { status: "available", label: "Available" },
    { status: "booked_pending", label: "Booked (pending)" },
    { status: "booked_confirmed", label: "Booked (confirmed)" },
    { status: "blocked", label: "Blocked" },
    { status: "past", label: "Past" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map((it) => (
        <div key={it.status} className="flex items-center gap-2">
          <span className="inline-block h-4 w-6 overflow-hidden rounded-sm">
            <Cell status={it.status} />
          </span>
          {it.label}
        </div>
      ))}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  children,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
