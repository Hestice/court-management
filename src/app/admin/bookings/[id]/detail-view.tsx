"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  XCircle,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AvailabilityStatus,
  CourtAvailability,
} from "@/lib/availability";
import {
  formatFacilityDate,
  formatHour,
  formatHourRange,
} from "@/lib/timezone";
import { addDaysIso, BOOKING_DATE_MAX_DAYS } from "@/lib/zod-helpers";
import { cn } from "@/lib/utils";

import { loadAvailability } from "@/app/booking/availability-action";

import {
  approveBooking,
  cancelBooking,
  completeBooking,
  editBookingGuestCount,
  manualRedeemBookingGuest,
  rejectBooking,
  rescheduleBooking,
  saveBookingNotes,
} from "../actions";
import type { BookingRow, BookingStatus } from "../schema";
import { GUEST_COUNT_MAX, GUEST_COUNT_MIN } from "@/lib/zod-helpers";

export type ActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
};

export type BookingGuestRow = {
  id: string;
  guest_number: number;
  qr_code: string;
  redeemed_at: string | null;
  redeemed_by_name: string | null;
  redeemed_by_email: string | null;
};

type CourtOption = {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
};

const STATUS_CLASSES: Record<BookingStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
  completed: "",
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

export function BookingDetailView({
  booking,
  guests,
  receiptSignedUrl,
  activity,
  courts,
  operatingStart,
  operatingEnd,
  maxDuration,
  entrancePricePerGuest,
  today,
}: {
  booking: BookingRow;
  guests: BookingGuestRow[];
  receiptSignedUrl: string | null;
  activity: ActivityEntry[];
  courts: CourtOption[];
  operatingStart: number;
  operatingEnd: number;
  maxDuration: number;
  entrancePricePerGuest: number;
  today: string;
}) {
  const router = useRouter();

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [guestEditOpen, setGuestEditOpen] = useState(false);

  const canEditGuests =
    booking.status === "pending" || booking.status === "confirmed";

  const canApprove =
    booking.status === "pending" && !!booking.payment_receipt_url;
  const canReject = booking.status === "pending";
  const canReschedule =
    booking.status === "pending" || booking.status === "confirmed";
  const canCancel =
    booking.status === "pending" || booking.status === "confirmed";
  const canComplete =
    booking.status === "confirmed" && booking.booking_date < today;

  function onActionDone() {
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/bookings">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to bookings
          </Link>
        </Button>
      </div>

      <SummaryCard
        booking={booking}
        entrancePricePerGuest={entrancePricePerGuest}
        canEditGuests={canEditGuests}
        onEditGuests={() => setGuestEditOpen(true)}
      />

      <ReceiptSection
        hasReceipt={!!booking.payment_receipt_url}
        signedUrl={receiptSignedUrl}
        onOpen={() => setReceiptOpen(true)}
      />

      <section className="flex flex-wrap gap-2">
        {booking.status === "pending" ? (
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
        {canReschedule ? (
          <Button variant="outline" onClick={() => setRescheduleOpen(true)}>
            <CalendarClock className="h-4 w-4" aria-hidden />
            Reschedule
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
        {canComplete ? (
          <Button variant="outline" onClick={() => setCompleteOpen(true)}>
            Mark as completed
          </Button>
        ) : null}
      </section>

      <GuestListSection
        guests={guests}
        total={booking.guest_count}
        onDone={onActionDone}
      />

      <AdminNotes bookingId={booking.id} initial={booking.admin_notes ?? ""} />

      <ActivityTimeline entries={activity} />

      {/* Dialogs */}
      <ReceiptModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        signedUrl={receiptSignedUrl}
      />
      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        bookingId={booking.id}
        onDone={onActionDone}
      />
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        bookingId={booking.id}
        onDone={onActionDone}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        bookingId={booking.id}
        onDone={onActionDone}
      />
      <CompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        bookingId={booking.id}
        onDone={onActionDone}
      />
      {rescheduleOpen ? (
        <RescheduleDialog
          booking={booking}
          courts={courts}
          operatingStart={operatingStart}
          operatingEnd={operatingEnd}
          maxDuration={maxDuration}
          today={today}
          onClose={() => setRescheduleOpen(false)}
          onDone={() => {
            setRescheduleOpen(false);
            onActionDone();
          }}
        />
      ) : null}
      <GuestCountDialog
        open={guestEditOpen}
        onOpenChange={setGuestEditOpen}
        bookingId={booking.id}
        currentCount={booking.guest_count}
        onDone={onActionDone}
      />
    </>
  );
}

function SummaryCard({
  booking,
  entrancePricePerGuest,
  canEditGuests,
  onEditGuests,
}: {
  booking: BookingRow;
  entrancePricePerGuest: number;
  canEditGuests: boolean;
  onEditGuests: () => void;
}) {
  const duration = booking.end_hour - booking.start_hour;
  const isWalkin = booking.user_id === null;
  const courtRental = booking.court_hourly_rate * duration;
  const entrance = entrancePricePerGuest * booking.guest_count;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Booking detail
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            {booking.id}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "px-3 py-1 text-sm font-medium",
            STATUS_CLASSES[booking.status],
          )}
        >
          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
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
                {booking.walk_in_name ?? "Walk-in"}{" "}
                <Badge variant="outline" className="ml-1 text-[10px]">
                  Walk-in
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                {booking.walk_in_phone ?? "No phone on file"}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">{booking.customer_name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">
                {booking.customer_email}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Court</p>
          <p className="font-medium">{booking.court_name}</p>
          <p className="text-sm text-muted-foreground">
            {formatPHP(booking.court_hourly_rate)} / hour
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Date &amp; time
          </p>
          <p className="font-medium">{formatFacilityDate(booking.booking_date)}</p>
          <p className="text-sm text-muted-foreground">
            {formatHourRange(booking.start_hour, booking.end_hour)} (
            {duration} {duration === 1 ? "hour" : "hours"})
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Guests</p>
            {canEditGuests ? (
              <button
                type="button"
                onClick={onEditGuests}
                className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                Edit
              </button>
            ) : null}
          </div>
          <p className="font-medium">
            {booking.guest_count}{" "}
            {booking.guest_count === 1 ? "guest" : "guests"}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Total</p>
          <p className="text-lg font-semibold">
            {formatPHP(booking.total_amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            Court {formatPHP(courtRental)} + entrance {formatPHP(entrance)}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Created</p>
          <p className="text-sm">{formatTimestamp(booking.created_at)}</p>
        </div>

        {booking.status === "pending" && booking.expires_at ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              Expires
            </p>
            <p className="text-sm">{formatTimestamp(booking.expires_at)}</p>
          </div>
        ) : null}
      </div>
    </section>
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
      <h2 className="text-sm font-medium text-muted-foreground">Payment receipt</h2>
      {!hasReceipt ? (
        <p className="text-sm text-muted-foreground">No receipt uploaded yet.</p>
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
  bookingId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function onConfirm() {
    startTransition(async () => {
      const res = await approveBooking(bookingId);
      if (res.success) {
        toast.success("Booking approved");
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
          <DialogTitle>Approve this booking?</DialogTitle>
          <DialogDescription>
            The receipt will be deleted from storage once the booking is
            confirmed. The customer will be notified by email.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
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
  bookingId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  // Reset the reason each time the dialog opens; done in-render per React's
  // "adjusting state based on props" guidance so we don't trigger a double
  // render via useEffect.
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
      const res = await rejectBooking(bookingId, { reason: trimmed });
      if (res.success) {
        toast.success("Booking rejected");
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
          <DialogTitle>Reject this booking?</DialogTitle>
          <DialogDescription>
            This is terminal — the booking becomes cancelled and the receipt
            is deleted. Give a short reason for the admin trail.
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
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Rejecting…" : "Reject booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  bookingId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
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
      const res = await cancelBooking(bookingId, {
        reason: reason.trim() || undefined,
      });
      if (res.success) {
        toast.success("Booking cancelled");
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
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            The slot becomes available again and any receipt on file is
            deleted. You can add an optional reason for your records.
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
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  open,
  onOpenChange,
  bookingId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function onConfirm() {
    startTransition(async () => {
      const res = await completeBooking(bookingId);
      if (res.success) {
        toast.success("Booking marked completed");
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
          <DialogTitle>Mark as completed?</DialogTitle>
          <DialogDescription>
            Closes out this past booking. This is a one-way transition.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Saving…" : "Mark completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminNotes({
  bookingId,
  initial,
}: {
  bookingId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const baselineRef = useRef(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Server-driven updates (e.g. action revalidatePath) override local text
    // only when the local text hasn't diverged from the last-seen baseline —
    // otherwise we'd clobber the admin's unsaved keystrokes.
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
      const res = await saveBookingNotes(bookingId, { notes: next });
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
        placeholder="Reminders for the team, context from the customer, payment verification notes…"
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
    case "booking.created":
      return "Booking created";
    case "booking.walkin_created":
      return "Walk-in booking created";
    case "booking.receipt_uploaded":
      return "Receipt uploaded";
    case "booking.approved":
      return "Booking approved";
    case "booking.rejected":
      return "Booking rejected";
    case "booking.rescheduled":
      return "Booking rescheduled";
    case "booking.cancelled":
      return "Booking cancelled";
    case "booking.completed":
      return "Booking marked completed";
    case "booking.note_updated":
      return "Admin notes updated";
    case "booking.guest_count_changed": {
      const from = entry.metadata?.from;
      const to = entry.metadata?.to;
      return typeof from === "number" && typeof to === "number"
        ? `Guest count: ${from} → ${to}`
        : "Guest count changed";
    }
    case "booking.guest_redeemed":
      return entry.metadata?.manual
        ? "Guest manually redeemed"
        : "Guest redeemed";
    default:
      return entry.action;
  }
}

function GuestListSection({
  guests,
  total,
  onDone,
}: {
  guests: BookingGuestRow[];
  total: number;
  onDone: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium text-muted-foreground">
        Guests ({total})
      </h2>
      {guests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          QR codes are generated when the booking is confirmed.
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
  guest: BookingGuestRow;
  total: number;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const redeemed = !!guest.redeemed_at;
  // Truncate the QR string — first 16 chars is enough to eyeball a match
  // against the scanner log on a support call.
  const truncatedQr =
    guest.qr_code.length > 16
      ? `${guest.qr_code.slice(0, 16)}…`
      : guest.qr_code;

  function onConfirm() {
    startTransition(async () => {
      const res = await manualRedeemBookingGuest(guest.id);
      if (res.success) {
        toast.success(`Guest ${guest.guest_number} marked redeemed`);
        setConfirmOpen(false);
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

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
              <span className="font-medium text-emerald-600">✓ Redeemed</span>
              <span className="text-muted-foreground">
                {formatTimestamp(guest.redeemed_at!)}
                {guest.redeemed_by_name || guest.redeemed_by_email
                  ? ` · ${guest.redeemed_by_name ?? guest.redeemed_by_email}`
                  : ""}
              </span>
            </div>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">Not redeemed</span>
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
            <DialogTitle>
              Mark guest {guest.guest_number} redeemed?
            </DialogTitle>
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

function GuestCountDialog({
  open,
  onOpenChange,
  bookingId,
  currentCount,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  currentCount: number;
  onDone: () => void;
}) {
  const [count, setCount] = useState(currentCount);
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setCount(currentCount);
  }

  function onSubmit() {
    startTransition(async () => {
      const res = await editBookingGuestCount(bookingId, {
        guest_count: count,
      });
      if (res.success) {
        toast.success("Guest count updated");
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
          <DialogTitle>Edit guest count</DialogTitle>
          <DialogDescription>
            Adjust the number of people on this booking. Already-redeemed
            guests can&apos;t be dropped. Total recalculates automatically.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Number of guests</span>
          <Input
            type="number"
            inputMode="numeric"
            min={GUEST_COUNT_MIN}
            max={GUEST_COUNT_MAX}
            step={1}
            value={Number.isFinite(count) ? count : ""}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              setCount(Number.isFinite(n) ? Math.floor(n) : 0);
            }}
            disabled={pending}
          />
          <span className="text-xs text-muted-foreground">
            Between {GUEST_COUNT_MIN} and {GUEST_COUNT_MAX}.
          </span>
        </label>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              pending ||
              count < GUEST_COUNT_MIN ||
              count > GUEST_COUNT_MAX ||
              count === currentCount
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// RESCHEDULE DIALOG (full availability picker, excludes this booking itself)
// ============================================================================

const MAX_RESCHEDULE_DAYS = BOOKING_DATE_MAX_DAYS;

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: "Available",
  booked_pending: "Booked",
  booked_confirmed: "Booked",
  blocked: "Blocked",
  past: "Past",
  outside_hours: "Outside hours",
};

function RescheduleDialog({
  booking,
  operatingStart,
  operatingEnd,
  maxDuration,
  today,
  onClose,
  onDone,
}: {
  booking: BookingRow;
  courts: CourtOption[];
  operatingStart: number;
  operatingEnd: number;
  maxDuration: number;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState<string>(booking.booking_date);
  const [availability, setAvailability] = useState<CourtAvailability[]>([]);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmitting] = useTransition();
  const [courtId, setCourtId] = useState(booking.court_id);
  const [startHour, setStartHour] = useState(booking.start_hour);
  const [duration, setDuration] = useState(
    booking.end_hour - booking.start_hour,
  );

  // Initial + subsequent loads use the same action so we never have to
  // hand-maintain a separate availability fetcher here. Excluding the current
  // booking id lets the admin keep (or shrink into) the current slot without
  // the UI showing it as self-occupied.
  useEffect(() => {
    startLoading(async () => {
      const res = await loadAvailability(date, booking.id);
      if (res.success) {
        setAvailability(res.courts);
      } else {
        toast.error(res.error);
      }
    });
  }, [date, booking.id]);

  const maxDate = addDaysIso(today, MAX_RESCHEDULE_DAYS);

  const selectedCourt = useMemo(
    () => availability.find((c) => c.court.id === courtId) ?? null,
    [availability, courtId],
  );

  const hoursInRange = useMemo(() => {
    const arr: number[] = [];
    for (let h = operatingStart; h < operatingEnd; h++) arr.push(h);
    return arr;
  }, [operatingStart, operatingEnd]);

  const maxPossibleDuration = useMemo(() => {
    if (!selectedCourt) return 0;
    const startSlot = selectedCourt.hours.find((h) => h.hour === startHour);
    if (!startSlot || startSlot.status !== "available") return 0;
    let count = 0;
    for (let h = startHour; h < operatingEnd; h++) {
      const slot = selectedCourt.hours.find((s) => s.hour === h);
      if (!slot || slot.status !== "available") break;
      count++;
    }
    return Math.min(count, maxDuration);
  }, [selectedCourt, startHour, operatingEnd, maxDuration]);

  const effectiveDuration =
    maxPossibleDuration === 0
      ? 0
      : Math.min(Math.max(1, duration), maxPossibleDuration);

  function onSubmit() {
    if (!courtId || effectiveDuration === 0) return;
    startSubmitting(async () => {
      const res = await rescheduleBooking(booking.id, {
        court_id: courtId,
        booking_date: date,
        start_hour: startHour,
        duration_hours: effectiveDuration,
      });
      if (res.success) {
        toast.success("Booking rescheduled");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reschedule booking</DialogTitle>
          <DialogDescription>
            Pick a new date, court, and time. The status stays the same.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Date</span>
              <Input
                type="date"
                value={date}
                min={today}
                max={maxDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setDate(v);
                }}
                disabled={loading || submitting}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Court</span>
              <select
                value={courtId}
                onChange={(e) => {
                  setCourtId(e.target.value);
                  setStartHour(operatingStart);
                  setDuration(1);
                }}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={loading || submitting}
              >
                {availability.map((c) => (
                  <option key={c.court.id} value={c.court.id}>
                    {c.court.name} · {formatPHP(c.court.hourly_rate)}/hr
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Start</span>
              <select
                value={String(startHour)}
                onChange={(e) => {
                  setStartHour(Number(e.target.value));
                  setDuration(1);
                }}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={!selectedCourt || loading || submitting}
              >
                {hoursInRange.map((h) => {
                  const slot = selectedCourt?.hours.find((s) => s.hour === h);
                  const available = slot?.status === "available";
                  return (
                    <option key={h} value={h} disabled={!available}>
                      {formatHour(h)}
                      {!available && slot
                        ? ` — ${STATUS_LABEL[slot.status]}`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Duration</span>
              <select
                value={String(effectiveDuration)}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={maxPossibleDuration === 0 || loading || submitting}
              >
                {maxPossibleDuration === 0 ? (
                  <option value="0">Not available</option>
                ) : (
                  Array.from({ length: maxPossibleDuration }, (_, i) => i + 1).map(
                    (d) => (
                      <option key={d} value={d}>
                        {d} {d === 1 ? "hour" : "hours"}
                      </option>
                    ),
                  )
                )}
              </select>
            </label>
          </div>

          <AvailabilityGrid
            availability={availability}
            hoursInRange={hoursInRange}
            loading={loading}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              submitting ||
              loading ||
              !courtId ||
              effectiveDuration === 0
            }
          >
            {submitting ? "Saving…" : "Save reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityGrid({
  availability,
  hoursInRange,
  loading,
}: {
  availability: CourtAvailability[];
  hoursInRange: number[];
  loading: boolean;
}) {
  return (
    <div
      className={cn(
        "max-h-64 overflow-auto rounded-lg border border-border",
        loading && "opacity-60",
      )}
      aria-busy={loading}
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/40">
            <th className="sticky left-0 z-10 w-28 bg-muted/40 px-3 py-2 text-left font-medium">
              Court
            </th>
            {hoursInRange.map((h) => (
              <th
                key={h}
                className="min-w-12 px-1 py-2 text-center font-medium"
              >
                {formatHour(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {availability.map((c) => (
            <tr key={c.court.id} className="border-t border-border">
              <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">
                {c.court.name}
              </td>
              {hoursInRange.map((h) => {
                const slot = c.hours.find((s) => s.hour === h);
                return (
                  <td
                    key={h}
                    className="border-l border-border p-0.5"
                    title={
                      slot
                        ? `${formatHour(h)} — ${STATUS_LABEL[slot.status]}`
                        : undefined
                    }
                  >
                    <Cell status={slot?.status ?? "outside_hours"} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ status }: { status: AvailabilityStatus }) {
  const base = "h-5 w-full rounded-sm";
  switch (status) {
    case "available":
      return (
        <div
          className={cn(
            base,
            "bg-emerald-100 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700",
          )}
        />
      );
    case "booked_pending":
      return (
        <div
          className={cn(
            base,
            "bg-amber-100 ring-1 ring-inset ring-amber-300 dark:bg-amber-900/30 dark:ring-amber-700",
          )}
        />
      );
    case "booked_confirmed":
      return (
        <div
          className={cn(
            base,
            "bg-muted-foreground/30 ring-1 ring-inset ring-muted-foreground/40",
          )}
        />
      );
    case "blocked":
      return (
        <div
          className={cn(
            base,
            "ring-1 ring-inset ring-border bg-[repeating-linear-gradient(135deg,theme(colors.muted.DEFAULT)_0_4px,transparent_4px_8px)]",
          )}
        />
      );
    case "past":
      return <div className={cn(base, "bg-muted/40")} />;
    case "outside_hours":
      return <div className={cn(base, "bg-transparent")} />;
  }
}
