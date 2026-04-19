"use client";

import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

export type AuditLogRow = {
  id: string;
  action: string;
  actor_name: string | null;
  ip_address: string | null;
  metadata: unknown;
  created_at: string;
};

function formatTimestamp(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionBadge(action: string) {
  // Muted defaults; highlight login failures + rate-limit hits in red/amber.
  const classes: Record<string, string> = {
    "auth.login.failure":
      "border-destructive/40 bg-destructive/10 text-destructive",
    "rate_limit.hit":
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    "auth.login.success":
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  };
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-xs", classes[action] ?? "")}
    >
      {action}
    </Badge>
  );
}

function formatMetadata(meta: unknown): string {
  if (meta === null || meta === undefined) return "—";
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

export function AuditLogView({ rows }: { rows: AuditLogRow[] }) {
  const columns: DataTableColumn<AuditLogRow>[] = [
    {
      header: "When",
      cell: (r) => formatTimestamp(r.created_at),
      className: "whitespace-nowrap tabular-nums text-muted-foreground",
    },
    {
      header: "Action",
      cell: (r) => actionBadge(r.action),
    },
    {
      header: "Actor",
      cell: (r) => r.actor_name ?? "—",
      className: "max-w-[14rem] truncate",
    },
    {
      header: "IP",
      cell: (r) => r.ip_address ?? "—",
      className: "font-mono text-xs text-muted-foreground",
    },
    {
      header: "Metadata",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {formatMetadata(r.metadata)}
        </span>
      ),
      className: "max-w-md truncate",
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      empty={
        <p className="text-sm text-muted-foreground">
          No audit events yet.
        </p>
      }
    />
  );
}
