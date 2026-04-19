"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatFacilityDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";

import type { PassStatus } from "../../../entrance/schema";
import {
  approvePass,
  cancelPass,
  manualRedeemPassGuest,
  rejectPass,
  savePassNotes,
} from "../actions";

export type PassDetailRow = {
  id: string;
  pass_date: string;
  guest_count: number;
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

export type PassGuestRow = {
  id: string;
  guest_number: number;
  qr_code: string;
  redeemed_at: string | null;
  redeemed_by_name: string | null;
  redeemed_by_email: string | null;
};

export type ActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
};

const STATUS_CLASSES: Record<PassStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
  expired: "border-destructive/40 bg-destructive/10 text-destructive",
};

const NOTES_AUTOSAVE_DEBOUNCE_MS = 1000;
const NOTES_MAX = 2000;

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PassDetailView({
  pass,
  guests,
  receiptSignedUrl,
  activity,
}: {
  pass: PassDetailRow;
  guests: PassGuestRow[];
  receiptSignedUrl: string | null;
  activity: ActivityEntry[];
}) {
  const router = useRouter();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const isWalkin = pass.user_id === null;
  const canApprove =
    pass.status === "pending" && !!pass.payment_receipt_url;
  const canReject = pass.status === "pending";
  const canCancel = pass.status === "pending" || pass.status === "confirmed";

  const redeemedCount = guests.filter((g) => g.redeemed_at).length;

  function onActionDone() {
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/passes">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to passes
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Pass detail
            </h1>
            <p className="font-mono text-xs text-muted-foreground">{pass.id}</p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "px-3 py-1 text-sm font-medium",
              STATUS_CLASSES[pass.status],
            )}
          >
            {pass.status.charAt(0).toUpperCase() + pass.status.slice(1)}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              {isWalkin ? "Walk-in customer" : "Customer"}
            </p>
            {isWalkin ? (
              <>
                <p className="font-medium">
                  {pass.walk_in_name ?? "Walk-in"}{" "}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    Walk-in
                  </Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  {pass.walk_in_phone ?? "No phone on file"}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">{pass.customer_name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">
                  {pass.customer_email}
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">Date</p>
            <p className="font-medium">{formatFacilityDate(pass.pass_date)}</p>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">Guests</p>
            <p className="font-medium">
              {pass.guest_count}{" "}
              {pass.guest_count === 1 ? "guest" : "guests"}
            </p>
            <p className="text-sm text-muted-foreground">
              {redeemedCount}/{pass.guest_count} redeemed
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">
              {formatPHP(pass.total_amount)}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">Created</p>
            <p className="text-sm">{formatTimestamp(pass.created_at)}</p>
          </div>

          {pass.status === "pending" && pass.expires_at ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">
                Expires
              </p>
              <p className="text-sm">{formatTimestamp(pass.expires_at)}</p>
            </div>
          ) : null}
        </div>
      </section>

      {isWalkin ? null : (
        <ReceiptSection
          hasReceipt={!!pass.payment_receipt_url}
          signedUrl={receiptSignedUrl}
          onOpen={() => setReceiptOpen(true)}
        />
      )}

      <section className="flex flex-wrap gap-2">
        {pass.status === "pending" ? (
          <Button
            onClick={() => setApproveOpen(true)}
            disabled={!canApprove}
            title={
              canApprove
                ? undefined
                : "Customer hasn't uploaded a receipt yet"
            }
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Approve
          </Button>
        ) : null}
        {canReject ? (
          <Button variant="destructive" onClick={() => setRejectOpen(true)}>
            <XCircle className="h-4 w-4" aria-hidden />
            Reject
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            variant="outline"
            onClick={() => setCancelOpen(true)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Cancel
          </Button>
        ) : null}
      </section>

      <GuestListSection guests={guests} total={pass.guest_count} onDone={onActionDone} />

      <AdminNotes passId={pass.id} initial={pass.admin_notes ?? ""} />

      <ActivityTimeline entries={activity} />

      <ReceiptModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        signedUrl={receiptSignedUrl}
      />
      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        passId={pass.id}
        onDone={onActionDone}
      />
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        passId={pass.id}
        onDone={onActionDone}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        passId={pass.id}
        onDone={onActionDone}
      />
    </>
  );
}

function ReceiptSection({
  hasReceipt,
  signedUrl,
  onOpen,
}: {
  hasReceipt: boolean;
  signedUrl: string | null;
  onOpen: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium text-muted-foreground">
        Payment receipt
      </h2>
      {!hasReceipt ? (
        <p className="text-sm text-muted-foreground">
          No receipt uploaded yet.
        </p>
      ) : signedUrl ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full overflow-hidden rounded-md border border-border bg-muted text-left transition-opacity hover:opacity-90"
          aria-label="View receipt full size"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt="Uploaded payment receipt"
            loading="lazy"
            className="max-h-72 w-full object-contain"
          />
        </button>
      ) : (
        <p className="text-sm text-destructive">
          Couldn&apos;t sign the receipt URL. Try refreshing.
        </p>
      )}
    </section>
  );
}

function ReceiptModal({
  open,
  onOpenChange,
  signedUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signedUrl: string | null;
}) {
  if (!signedUrl) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Payment receipt</DialogTitle>
          <DialogDescription>
            Click the image to open in a new tab at full resolution.
          </DialogDescription>
        </DialogHeader>
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-md border border-border bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt="Full-size payment receipt"
            className="max-h-[70vh] w-full object-contain"
          />
        </a>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({
  open,
  onOpenChange,
  passId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  passId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function onConfirm() {
    startTransition(async () => {
      const res = await approvePass(passId);
      if (res.success) {
        toast.success("Pass approved");
        onOpenChange(false);
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve this pass?</DialogTitle>
          <DialogDescription>
            The receipt will be deleted from storage once the pass is
            confirmed. QR codes become visible to the customer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Approving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  passId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  passId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setReason("");
  }

  function onConfirm() {
    const trimmed = reason.trim();
    if (trimmed.length < 1) {
      toast.error("A reason is required.");
      return;
    }
    startTransition(async () => {
      const res = await rejectPass(passId, { reason: trimmed });
      if (res.success) {
        toast.success("Pass rejected");
        onOpenChange(false);
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this pass?</DialogTitle>
          <DialogDescription>
            This is terminal — the pass becomes cancelled and the receipt is
            deleted. Give a short reason for the admin trail.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={4}
          maxLength={500}
          placeholder="e.g. Receipt doesn't match the expected amount"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          {reason.trim().length}/500 characters
        </p>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Rejecting…" : "Reject pass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  passId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  passId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setReason("");
  }

  function onConfirm() {
    startTransition(async () => {
      const res = await cancelPass(passId, {
        reason: reason.trim() || undefined,
      });
      if (res.success) {
        toast.success("Pass cancelled");
        onOpenChange(false);
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this pass?</DialogTitle>
          <DialogDescription>
            Any receipt on file is deleted. Already-redeemed guests stay
            redeemed for audit.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          maxLength={500}
          placeholder="Optional reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
        />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Keep pass
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel pass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GuestListSection({
  guests,
  total,
  onDone,
}: {
  guests: PassGuestRow[];
  total: number;
  onDone: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Guests ({total})
        </h2>
      </div>
      {guests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No guest rows found for this pass.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {guests.map((g) => (
            <GuestRow key={g.id} guest={g} total={total} onDone={onDone} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GuestRow({
  guest,
  total,
  onDone,
}: {
  guest: PassGuestRow;
  total: number;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const redeemed = !!guest.redeemed_at;

  function onConfirm() {
    startTransition(async () => {
      const res = await manualRedeemPassGuest(guest.id);
      if (res.success) {
        toast.success(`Guest ${guest.guest_number} marked redeemed`);
        setConfirmOpen(false);
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  // Truncate the QR code for admin reference — full value would overflow on
  // small screens. First 12 chars is enough to eyeball a match against a
  // scanner log if something goes sideways.
  const truncatedQr =
    guest.qr_code.length > 16
      ? `${guest.qr_code.slice(0, 16)}…`
      : guest.qr_code;

  return (
    <>
      <li className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex flex-col">
          <p className="text-sm font-medium">
            Guest {guest.guest_number} of {total}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {truncatedQr}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {redeemed ? (
            <div className="flex flex-col items-end text-xs">
              <span className="font-medium text-emerald-600">
                ✓ Redeemed
              </span>
              <span className="text-muted-foreground">
                {formatTimestamp(guest.redeemed_at!)}
                {guest.redeemed_by_name || guest.redeemed_by_email
                  ? ` · ${guest.redeemed_by_name ?? guest.redeemed_by_email}`
                  : ""}
              </span>
            </div>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                Not redeemed
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
              >
                Mark redeemed
              </Button>
            </>
          )}
        </div>
      </li>
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => !o && !pending && setConfirmOpen(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark guest {guest.guest_number} redeemed?</DialogTitle>
            <DialogDescription>
              Use this for gate entries that bypassed the scanner. The action
              is logged in the activity trail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={pending}>
              {pending ? "Saving…" : "Mark redeemed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AdminNotes({
  passId,
  initial,
}: {
  passId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const baselineRef = useRef(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value === baselineRef.current) {
      baselineRef.current = initial;
      setValue(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function scheduleSave(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (next === baselineRef.current) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      const res = await savePassNotes(passId, { notes: next });
      if (res.success) {
        baselineRef.current = next;
        setStatus("saved");
      } else {
        setStatus("error");
        toast.error(res.error);
      }
    }, NOTES_AUTOSAVE_DEBOUNCE_MS);
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Admin notes
          </h2>
          <p className="text-xs text-muted-foreground">
            Internal — never shown to the customer. Autosaves as you type.
          </p>
        </div>
        <span
          className={cn(
            "text-xs",
            status === "saving" && "text-muted-foreground",
            status === "saved" && "text-emerald-600",
            status === "error" && "text-destructive",
          )}
          aria-live="polite"
        >
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : status === "error"
                ? "Save failed"
                : ""}
        </span>
      </div>
      <Textarea
        rows={5}
        maxLength={NOTES_MAX}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleSave(e.target.value);
        }}
        placeholder="Context from the customer, payment verification notes…"
      />
      <p className="text-xs text-muted-foreground">
        {value.length}/{NOTES_MAX}
      </p>
    </section>
  );
}

function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
        <p className="text-sm text-muted-foreground">No activity recorded.</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
      <ol className="flex flex-col gap-3 border-l border-border pl-4">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-muted-foreground/70" />
            <div className="flex flex-col">
              <p className="text-sm">
                {describeActivity(entry)}
                {entry.actorName ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    {entry.actorName}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTimestamp(entry.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function describeActivity(entry: ActivityEntry): string {
  switch (entry.action) {
    case "pass.created":
      return "Pass created";
    case "pass.walkin_created":
      return "Walk-in pass created";
    case "pass.receipt_uploaded":
      return "Receipt uploaded";
    case "pass.approved":
      return "Pass approved";
    case "pass.rejected":
      return "Pass rejected";
    case "pass.cancelled":
      return "Pass cancelled";
    case "pass.note_updated":
      return "Admin notes updated";
    case "pass.guest_redeemed": {
      const guestId = entry.metadata?.guest_id;
      const manual = entry.metadata?.manual;
      const who = manual ? "Guest manually redeemed" : "Guest redeemed";
      return typeof guestId === "string" ? `${who}` : who;
    }
    default:
      return entry.action;
  }
}
