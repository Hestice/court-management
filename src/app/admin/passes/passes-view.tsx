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
import { formatFacilityDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";

import {
  PASS_STATUSES,
  type PassStatus,
  type PassTypeFilter,
} from "../../entrance/schema";

const STATUS_CLASSES: Record<PassStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
  expired: "border-destructive/40 bg-destructive/10 text-destructive",
};

export type PassRow = {
  id: string;
  pass_date: string;
  guest_count: number;
  redeemed_count: number;
  status: PassStatus;
  total_amount: number;
  expires_at: string | null;
  created_at: string;
  payment_receipt_url: string | null;
  user_id: string | null;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  admin_notes: string | null;
};

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusBadge(status: PassStatus) {
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

export function PassesView({
  rows,
  today,
}: {
  rows: PassRow[];
  today: string;
}) {
  const [statusFilter, setStatusFilter] = useState<Set<PassStatus>>(
    () => new Set<PassStatus>(["pending"]),
  );
  const [typeFilter, setTypeFilter] = useState<PassTypeFilter>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
      if (typeFilter === "registered" && r.user_id === null) return false;
      if (typeFilter === "walkin" && r.user_id !== null) return false;
      if (dateFrom && r.pass_date < dateFrom) return false;
      if (dateTo && r.pass_date > dateTo) return false;
      if (query) {
        const haystack = [
          r.id,
          r.customer_name ?? "",
          r.customer_email ?? "",
          r.walk_in_name ?? "",
          r.walk_in_phone ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, typeFilter, dateFrom, dateTo, search]);

  const sorted = useMemo(() => {
    const order: Record<PassStatus, number> = {
      pending: 0,
      confirmed: 1,
      expired: 2,
      cancelled: 3,
    };
    return filtered.slice().sort((a, b) => {
      const s = order[a.status] - order[b.status];
      if (s !== 0) return s;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [filtered]);

  function toggleStatus(s: PassStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function resetFilters() {
    setStatusFilter(new Set<PassStatus>(["pending"]));
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  const columns: DataTableColumn<PassRow>[] = [
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
    { header: "Date", cell: (r) => formatFacilityDate(r.pass_date) },
    {
      header: "Guests",
      cell: (r) => `${r.guest_count}`,
      className: "tabular-nums",
    },
    {
      header: "Redeemed",
      cell: (r) => (
        <span className="tabular-nums">
          {r.redeemed_count}/{r.guest_count}
        </span>
      ),
    },
    {
      header: "Payment",
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
            Entrance Passes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review receipts, approve or reject pending passes, and see
            redemption status.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/passes/new">
            <Plus className="h-4 w-4" aria-hidden />
            New Walk-in Pass
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <div className="flex flex-wrap gap-2">
            {PASS_STATUSES.map((s) => {
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
                      ? STATUS_CLASSES[s] ||
                          "border-foreground bg-foreground text-background"
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
              Type
            </span>
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as PassTypeFilter)
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
              placeholder="Customer name, email, walk-in name, or pass ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing {filteredCount} of {totalCount} passes.
          {totalCount === 500
            ? " (Showing the 500 most recent — tighten filters to narrow the list.)"
            : ""}
        </p>
        <p className="sr-only" aria-live="polite">
          {filteredCount} passes matched
        </p>
      </section>

      <DataTable
        key={`${Array.from(statusFilter).join(",")}|${typeFilter}|${dateFrom}|${dateTo}|${search}`}
        rows={sorted}
        rowKey={(r) => r.id}
        columns={columns}
        empty={
          <p className="text-sm text-muted-foreground">
            No passes match the current filters.
          </p>
        }
        rowActions={(r) => (
          <Button asChild size="sm" variant="ghost" aria-label="View pass">
            <Link href={`/admin/passes/${r.id}`}>
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
