import { createClient } from "@/lib/supabase/server";

import { AuditLogView, type AuditLogRow } from "./audit-log-view";

export const metadata = { title: "Audit Log — Admin" };

type AuditLogWithActor = {
  id: string;
  actor_user_id: string | null;
  action: string;
  metadata: unknown;
  ip_address: string | null;
  created_at: string;
  actor: { name: string | null; email: string } | null;
};

const PAGE_LIMIT = 500;

export default async function AdminAuditLogPage() {
  const supabase = await createClient();

  // Fetch the most recent N entries. The table is admin-SELECT-only via RLS;
  // non-admin requests return zero rows here (the middleware also blocks).
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, actor_user_id, action, metadata, ip_address, created_at, actor:users!audit_logs_actor_user_id_fkey(name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);

  if (error) {
    throw new Error(`Failed to load audit log: ${error.message}`);
  }

  const rows: AuditLogRow[] = (
    (data ?? []) as unknown as AuditLogWithActor[]
  ).map((r) => ({
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
