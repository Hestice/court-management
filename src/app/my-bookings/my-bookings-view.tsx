"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFacilityDate, formatHourRange } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export type MyBookingGuest = {
  id: string;
  guest_number: number;
  qr_code: string;
  redeemed_at: string | null;
};

export type MyBookingRow = {
  id: string;
  court_name: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  guest_count: number;
  expires_at: string | null;
  has_receipt: boolean;
  guests: MyBookingGuest[];
};

type Filter = "upcoming" | "past";

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const classes: Record<string, string> = {
    pending:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    confirmed:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
    completed: "",
  };
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", classes[normalized] ?? "")}
    >
      {label}
    </Badge>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) {
    return (
      <span className="text-xs text-destructive">Expired — awaiting sweep</span>
    );
  }
  const totalMinutes = Math.floor(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const text =
    hours >= 1
      ? `Expires in ${hours}h${minutes ? ` ${minutes}m` : ""}`
      : `Expires in ${minutes}m`;
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

function formatRedeemedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

export function MyBookingsView({
  rows,
  today,
}: {
  rows: MyBookingRow[];
  today: string;
}) {
  const [filter, setFilter] = useState<Filter>("upcoming");

  const { upcoming, past } = useMemo(() => {
    const up: MyBookingRow[] = [];
    const pa: MyBookingRow[] = [];
    for (const r of rows) {
      if (r.booking_date >= today) up.push(r);
      else pa.push(r);
    }
    up.sort(
      (a, b) =>
        a.booking_date.localeCompare(b.booking_date) ||
        a.start_hour - b.start_hour,
    );
    pa.sort(
      (a, b) =>
        b.booking_date.localeCompare(a.booking_date) ||
        b.start_hour - a.start_hour,
    );
    return { upcoming: up, past: pa };
  }, [rows, today]);

  const visible = filter === "upcoming" ? upcoming : past;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            My Bookings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your upcoming and past court reservations.
          </p>
        </div>
        <Button asChild>
          <Link href="/booking">Book a court</Link>
        </Button>
      </div>

      <div className="flex w-fit items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
        <FilterButton
          active={filter === "upcoming"}
          onClick={() => setFilter("upcoming")}
        >
          Upcoming ({upcoming.length})
        </FilterButton>
        <FilterButton
          active={filter === "past"}
          onClick={() => setFilter("past")}
        >
          Past ({past.length})
        </FilterButton>
      </div>

      {visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((r) => (
            <BookingCard key={r.id} row={r} />
          ))}
        </ul>
      )}
    </>
  );
}

function BookingCard({ row }: { row: MyBookingRow }) {
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">
            {row.court_name} · {formatFacilityDate(row.booking_date)}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatHourRange(row.start_hour, row.end_hour)} ·{" "}
            {row.guest_count} {row.guest_count === 1 ? "guest" : "guests"} ·{" "}
            {formatPHP(row.total_amount)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {statusBadge(row.status)}
          {row.status === "pending" && row.expires_at ? (
            <ExpiryCountdown expiresAt={row.expires_at} />
          ) : null}
          {row.status === "pending" && row.has_receipt ? (
            <span className="text-xs text-muted-foreground">
              Receipt uploaded — awaiting review
            </span>
          ) : null}
        </div>
      </div>

      {row.status === "pending" ? (
        <div>
          <Button
            asChild
            size="sm"
            variant={row.has_receipt ? "ghost" : "default"}
          >
            <Link href={`/payment/${row.id}`}>
              {row.has_receipt ? "View Payment" : "Upload Payment"}
            </Link>
          </Button>
        </div>
      ) : null}

      {row.status === "confirmed" && row.guests.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            Show at the gate — one QR per guest
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {row.guests.map((g) => (
              <GuestQr
                key={g.id}
                guest={g}
                total={row.guest_count}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function GuestQr({
  guest,
  total,
}: {
  guest: MyBookingGuest;
  total: number;
}) {
  const redeemed = !!guest.redeemed_at;
  return (
    <li
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-border bg-background p-3 text-center",
        redeemed && "opacity-60",
      )}
    >
      <div
        className={cn(
          "rounded-md border border-border bg-white p-2",
          redeemed && "bg-muted",
        )}
      >
        <QRCodeSVG
          value={guest.qr_code}
          size={160}
          level="M"
          aria-label={`QR code for guest ${guest.guest_number}`}
        />
      </div>
      <p className="text-sm font-medium">
        Guest {guest.guest_number} of {total}
        {redeemed ? (
          <>
            {" "}
            — <span className="text-emerald-600">✓ Redeemed</span>
          </>
        ) : null}
      </p>
      {redeemed && guest.redeemed_at ? (
        <p className="text-xs text-muted-foreground">
          {formatRedeemedAt(guest.redeemed_at)}
        </p>
      ) : null}
    </li>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  if (filter === "past") {
    return <p className="text-sm text-muted-foreground">No past bookings.</p>;
  }
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-sm text-muted-foreground">
      <p>No bookings yet.</p>
      <Button asChild size="sm">
        <Link href="/booking">Book a court →</Link>
      </Button>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-3 py-1 text-sm transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
