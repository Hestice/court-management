"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Plus } from "lucide-react";

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

type LinkedBookingRef = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  court_name: string;
  customer_label: string | null;
};

export type EntryRow = {
  id: string;
  entry_date: string;
  guest_count: number;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  total_amount: number;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  linked_booking: LinkedBookingRef | null;
};

type LinkFilter = "all" | "linked" | "unlinked";

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function EntriesView({
  rows,
  today,
}: {
  rows: EntryRow[];
  today: string;
}) {
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (linkFilter === "linked" && !r.linked_booking) return false;
      if (linkFilter === "unlinked" && r.linked_booking) return false;
      if (dateFrom && r.entry_date < dateFrom) return false;
      if (dateTo && r.entry_date > dateTo) return false;
      if (q) {
        const hay = [
          r.id,
          r.walk_in_name ?? "",
          r.walk_in_phone ?? "",
          r.linked_booking?.customer_label ?? "",
          r.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, linkFilter, dateFrom, dateTo, search]);

  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      const d = b.entry_date.localeCompare(a.entry_date);
      if (d !== 0) return d;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [filtered]);

  const columns: DataTableColumn<EntryRow>[] = [
    {
      header: "Date",
      cell: (r) => formatFacilityDate(r.entry_date),
    },
    {
      header: "Name",
      cell: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {r.walk_in_name ?? (
              <span className="italic text-muted-foreground">Anonymous</span>
            )}
          </span>
          {r.walk_in_phone ? (
            <span className="text-xs text-muted-foreground">
              {r.walk_in_phone}
            </span>
          ) : null}
        </div>
      ),
      className: "max-w-[14rem]",
    },
    {
      header: "Guests",
      cell: (r) => r.guest_count,
      className: "tabular-nums",
    },
    {
      header: "Total",
      cell: (r) => formatPHP(r.total_amount),
      className: "tabular-nums",
    },
    {
      header: "Linked booking",
      cell: (r) =>
        r.linked_booking ? (
          <Link
            href={`/admin/bookings/${r.linked_booking.id}`}
            className="inline-flex flex-col gap-0.5 hover:underline"
          >
            <span className="text-sm font-medium">
              {r.linked_booking.court_name} ·{" "}
              {formatHourRange(
                r.linked_booking.start_hour,
                r.linked_booking.end_hour,
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatFacilityDate(r.linked_booking.booking_date)}
              {r.linked_booking.customer_label
                ? ` · ${r.linked_booking.customer_label}`
                : ""}
            </span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      header: "Logged by",
      cell: (r) => (
        <span className="text-sm">{r.created_by_name ?? "—"}</span>
      ),
    },
  ];

  function resetFilters() {
    setLinkFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Walk-in Entries
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log of people entering the facility without their own booking
            (spectators, friends joining a booking, casual entries).
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/entries/new">
            <Plus className="h-4 w-4" aria-hidden />
            Log walk-in entry
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Linked booking
            </span>
            <select
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All</option>
              <option value="linked">Linked to a booking</option>
              <option value="unlinked">No linked booking</option>
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
              placeholder="Name, phone, linked customer, or notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing {sorted.length} of {rows.length} entries.
        </p>
      </section>

      <DataTable
        key={`${linkFilter}|${dateFrom}|${dateTo}|${search}`}
        rows={sorted}
        rowKey={(r) => r.id}
        columns={columns}
        empty={
          <p className="text-sm text-muted-foreground">
            No walk-in entries match the current filters.
          </p>
        }
        rowActions={(r) => (
          <Button asChild size="sm" variant="ghost" aria-label="View entry">
            <Link href={`/admin/entries/${r.id}`}>
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
