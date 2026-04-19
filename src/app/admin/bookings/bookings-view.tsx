"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  formatFacilityDate,
  formatHourRange,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

import {
  BOOKING_STATUSES,
  type BookingRow,
  type BookingStatus,
  type BookingTypeFilter,
} from "./schema";

type CourtOption = { id: string; name: string };

const STATUS_CLASSES: Record<BookingStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled:
    "border-destructive/40 bg-destructive/10 text-destructive",
  completed: "",
};

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusBadge(status: BookingStatus) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_CLASSES[status])}
    >
      {label}
    </Badge>
  );
}

// Re-renders every minute so pending countdowns tick down live; red past-due
// copy makes the "sweep will drop this" case visually obvious.
function PendingExpiry({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const deadline = new Date(expiresAt).getTime();
  const diff = deadline - now;
  if (diff <= 0) {
    const mins = Math.floor(-diff / 60_000);
    const hours = Math.floor(mins / 60);
    const label =
      hours >= 1 ? `expired ${hours}h ago` : `expired ${Math.max(mins, 1)}m ago`;
    return (
      <span className="text-xs font-medium text-destructive">
        Pending — {label}
      </span>
    );
  }
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  const label =
    hours >= 1
      ? `${hours}h${rem ? ` ${rem}m` : ""} left`
      : `${Math.max(mins, 1)}m left`;
  return (
    <span className="text-xs text-muted-foreground">Pending — {label}</span>
  );
}

export function BookingsView({
  rows,
  courts,
  today,
}: {
  rows: BookingRow[];
  courts: CourtOption[];
  today: string;
}) {
  // Defaults match the "things that need attention" framing: only pending is
  // selected, everything else is a click away. Admin lands on a list they can
  // actually work from.
  const [statusFilter, setStatusFilter] = useState<Set<BookingStatus>>(
    () => new Set<BookingStatus>(["pending"]),
  );
  const [courtFilter, setCourtFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<BookingTypeFilter>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
      if (courtFilter !== "all" && r.court_id !== courtFilter) return false;
      if (typeFilter === "registered" && r.user_id === null) return false;
      if (typeFilter === "walkin" && r.user_id !== null) return false;
      if (dateFrom && r.booking_date < dateFrom) return false;
      if (dateTo && r.booking_date > dateTo) return false;
      if (query) {
        const haystack = [
          r.id,
          r.customer_name ?? "",
          r.customer_email ?? "",
          r.walk_in_name ?? "",
          r.walk_in_phone ?? "",
          r.court_name,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, courtFilter, typeFilter, dateFrom, dateTo, search]);

  // Pending first, then newest first within a status. Keeps the admin's
  // attention on the backlog even when they loosen the status filter.
  const sorted = useMemo(() => {
    const order: Record<BookingStatus, number> = {
      pending: 0,
      confirmed: 1,
      completed: 2,
      cancelled: 3,
    };
    return filtered.slice().sort((a, b) => {
      const s = order[a.status] - order[b.status];
      if (s !== 0) return s;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [filtered]);

  function toggleStatus(s: BookingStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function resetFilters() {
    setStatusFilter(new Set<BookingStatus>(["pending"]));
    setCourtFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  const columns: DataTableColumn<BookingRow>[] = [
    {
      header: "Customer",
      cell: (r) =>
        r.user_id === null ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{r.walk_in_name ?? "Walk-in"}</span>
            <Badge
              variant="outline"
              className="w-fit text-[10px] font-medium uppercase tracking-wide"
            >
              Walk-in
            </Badge>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              {r.customer_name ?? r.customer_email ?? "Customer"}
            </span>
            {r.customer_email && r.customer_name ? (
              <span className="text-xs text-muted-foreground">
                {r.customer_email}
              </span>
            ) : null}
          </div>
        ),
      className: "max-w-[16rem]",
    },
    { header: "Court", cell: (r) => r.court_name },
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
            <PendingExpiry expiresAt={r.expires_at} />
          ) : null}
          {r.status === "pending" && r.payment_receipt_url ? (
            <span className="text-xs text-muted-foreground">
              Receipt uploaded
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
  ];

  const filteredCount = sorted.length;
  const totalCount = rows.length;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Bookings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review receipts, approve or reject pending bookings, and manage the
            schedule.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/bookings/new">
            <Plus className="h-4 w-4" aria-hidden />
            New Walk-in Booking
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <div className="flex flex-wrap gap-2">
            {BOOKING_STATUSES.map((s) => {
              const active = statusFilter.has(s);
              const label = s.charAt(0).toUpperCase() + s.slice(1);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? STATUS_CLASSES[s] || "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Court
            </span>
            <select
              value={courtFilter}
              onChange={(e) => setCourtFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All courts</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Type
            </span>
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as BookingTypeFilter)
              }
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All</option>
              <option value="registered">Registered</option>
              <option value="walkin">Walk-in</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              To
            </span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 min-w-[14rem]">
            <span className="text-xs font-medium text-muted-foreground">
              Search
            </span>
            <Input
              placeholder="Customer name, email, walk-in name, or booking ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing {filteredCount} of {totalCount} bookings.
          {totalCount === 500
            ? " (Showing the 500 most recent — tighten filters to narrow the list.)"
            : ""}
        </p>
        <p className="sr-only" aria-live="polite">
          {filteredCount} bookings matched
        </p>
      </section>

      <DataTable
        key={`${Array.from(statusFilter).join(",")}|${courtFilter}|${typeFilter}|${dateFrom}|${dateTo}|${search}`}
        rows={sorted}
        rowKey={(r) => r.id}
        columns={columns}
        empty={
          <p className="text-sm text-muted-foreground">
            No bookings match the current filters.
          </p>
        }
        rowActions={(r) => (
          <Button asChild size="sm" variant="ghost" aria-label="View booking">
            <Link href={`/admin/bookings/${r.id}`}>
              <Eye className="h-4 w-4" aria-hidden />
              View
            </Link>
          </Button>
        )}
      />

      <p className="text-xs text-muted-foreground">
        Today is {today} in facility time.
      </p>
    </>
  );
}
