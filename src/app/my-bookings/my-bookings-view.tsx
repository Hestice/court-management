"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  formatFacilityDate,
  formatHourRange,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

export type MyBookingRow = {
  id: string;
  court_name: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  status: string;
  total_amount: number;
  expires_at: string | null;
  has_receipt: boolean;
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
  const label =
    normalized.charAt(0).toUpperCase() + normalized.slice(1);
  // Pending = amber, Confirmed = emerald, Cancelled = destructive, Completed = muted.
  const classes: Record<string, string> = {
    pending:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    confirmed:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    cancelled:
      "border-destructive/40 bg-destructive/10 text-destructive",
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

// Live countdown tied to the booking's expires_at — re-renders every minute
// so "Expires in 3h" ticks down as time passes.
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const deadline = new Date(expiresAt).getTime();
  const msLeft = deadline - now;

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
    // Upcoming: earliest first. Past: most recent first.
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

  const columns: DataTableColumn<MyBookingRow>[] = [
    {
      header: "Court",
      cell: (r) => r.court_name,
      className: "font-medium",
    },
    { header: "Date", cell: (r) => formatFacilityDate(r.booking_date) },
    {
      header: "Time",
      cell: (r) => formatHourRange(r.start_hour, r.end_hour),
    },
    {
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          {statusBadge(r.status)}
          {r.status === "pending" && r.expires_at ? (
            <ExpiryCountdown expiresAt={r.expires_at} />
          ) : null}
          {r.status === "pending" && r.has_receipt ? (
            <span className="text-xs text-muted-foreground">
              Receipt uploaded — awaiting admin review
            </span>
          ) : null}
        </div>
      ),
    },
    {
      header: "Total",
      cell: (r) => formatPHP(r.total_amount),
      className: "tabular-nums",
    },
    {
      header: "Payment",
      cell: (r) => <PaymentCell row={r} />,
    },
  ];

  const emptyUpcoming = (
    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
      <p>No bookings yet.</p>
      <Button asChild size="sm">
        <Link href="/booking">Book a court →</Link>
      </Button>
    </div>
  );
  const emptyPast = (
    <p className="text-sm text-muted-foreground">No past bookings.</p>
  );

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

      <DataTable
        key={filter}
        rows={visible}
        rowKey={(r) => r.id}
        columns={columns}
        empty={filter === "upcoming" ? emptyUpcoming : emptyPast}
      />
    </>
  );
}

function PaymentCell({ row }: { row: MyBookingRow }) {
  if (row.status !== "pending") return <span>—</span>;
  if (!row.has_receipt) {
    return (
      <Button asChild size="sm">
        <Link href={`/payment/${row.id}`}>Upload Payment</Link>
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="ghost">
      <Link href={`/payment/${row.id}`}>View Payment</Link>
    </Button>
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
