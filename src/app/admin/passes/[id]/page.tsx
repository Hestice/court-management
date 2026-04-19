import { notFound } from "next/navigation";

import { listPassActivity } from "@/lib/data/audit-logs";
import {
  getPassForAdmin,
  listPassGuestsForPass,
} from "@/lib/data/entrance-passes";
import { createReceiptSignedUrl } from "@/lib/receipt";

import type { PassStatus } from "../../../entrance/schema";
import {
  PassDetailView,
  type ActivityEntry,
  type PassDetailRow,
  type PassGuestRow,
} from "./detail-view";

export const metadata = { title: "Pass Detail — Admin" };

const ACTIVITY_ACTIONS = [
  "pass.created",
  "pass.walkin_created",
  "pass.receipt_uploaded",
  "pass.approved",
  "pass.rejected",
  "pass.cancelled",
  "pass.note_updated",
  "pass.guest_redeemed",
] as const;

export default async function AdminPassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [pass, guests, activity] = await Promise.all([
    getPassForAdmin(id),
    listPassGuestsForPass(id),
    listPassActivity({ passId: id, actions: ACTIVITY_ACTIONS }),
  ]);

  if (!pass) notFound();

  const row: PassDetailRow = {
    id: pass.id,
    pass_date: pass.pass_date,
    guest_count: pass.guest_count,
    status: pass.status as PassStatus,
    total_amount: Number(pass.total_amount),
    expires_at: pass.expires_at,
    created_at: pass.created_at,
    payment_receipt_url: pass.payment_receipt_url,
    user_id: pass.user_id,
    walk_in_name: pass.walk_in_name,
    walk_in_phone: pass.walk_in_phone,
    customer_name: pass.customer?.name ?? null,
    customer_email: pass.customer?.email ?? null,
    admin_notes: pass.admin_notes,
  };

  const guestRows: PassGuestRow[] = guests.map((g) => ({
    id: g.id,
    guest_number: g.guest_number,
    qr_code: g.qr_code,
    redeemed_at: g.redeemed_at,
    redeemed_by_name: g.redeemed_by_user?.name ?? null,
    redeemed_by_email: g.redeemed_by_user?.email ?? null,
  }));

  const receiptSignedUrl = pass.payment_receipt_url
    ? await createReceiptSignedUrl(pass.payment_receipt_url)
    : null;

  const activityEntries: ActivityEntry[] = activity.map((a) => ({
    id: a.id,
    action: a.action,
    createdAt: a.created_at,
    actorName: a.actor?.name ?? a.actor?.email ?? null,
    metadata: a.metadata,
  }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <PassDetailView
        pass={row}
        guests={guestRows}
        receiptSignedUrl={receiptSignedUrl}
        activity={activityEntries}
      />
    </main>
  );
}
