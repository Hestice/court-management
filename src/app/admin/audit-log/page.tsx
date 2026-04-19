import { listAuditLogs } from "@/lib/data/audit-logs";

import { AuditLogView, type AuditLogRow } from "./audit-log-view";

export const metadata = { title: "Audit Log — Admin" };

const PAGE_LIMIT = 500;

export default async function AdminAuditLogPage() {
  // Fetch the most recent N entries. The table is admin-SELECT-only via RLS;
  // non-admin requests return zero rows here (the middleware also blocks).
  const rowsRaw = await listAuditLogs({ limit: PAGE_LIMIT });

  const rows: AuditLogRow[] = rowsRaw.map((r) => ({
    id: r.id,
    action: r.action,
    actor_name:
      r.actor?.name?.trim() || r.actor?.email || r.actor_user_id || null,
    ip_address: r.ip_address,
    metadata: r.metadata,
    created_at: r.created_at,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Audit Log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Security-relevant events. Shows the latest {PAGE_LIMIT} entries.
        </p>
      </div>
      <AuditLogView rows={rows} />
    </main>
  );
}
