"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  formatFacilityDate,
  formatHourRange,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

import { deleteWalkInEntry, saveWalkInEntryNotes } from "../actions";

export type LinkedBooking = {
  id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  court_name: string;
  customer_label: string | null;
};

export type EntryDetailRow = {
  id: string;
  entry_date: string;
  guest_count: number;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  total_amount: number;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  linked_booking: LinkedBooking | null;
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

export function EntryDetailView({ entry }: { entry: EntryDetailRow }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/entries">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to entries
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Walk-in entry
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              {entry.id}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" value={formatFacilityDate(entry.entry_date)} />
          <Field
            label="Name"
            value={
              entry.walk_in_name ?? (
                <span className="italic text-muted-foreground">Anonymous</span>
              )
            }
          />
          <Field
            label="Phone"
            value={entry.walk_in_phone ?? "—"}
          />
          <Field label="Guests" value={entry.guest_count.toString()} />
          <Field label="Total collected" value={formatPHP(entry.total_amount)} />
          <Field
            label="Logged"
            value={`${formatTimestamp(entry.created_at)}${entry.created_by_name ? ` · ${entry.created_by_name}` : ""}`}
          />
        </div>
      </section>

      <LinkedBookingSection linked={entry.linked_booking} />

      <EntryNotes entryId={entry.id} initial={entry.notes ?? ""} />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entryId={entry.id}
        onDeleted={() => router.push("/admin/entries")}
      />
    </>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function LinkedBookingSection({ linked }: { linked: LinkedBooking | null }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium text-muted-foreground">
        Linked booking
      </h2>
      {!linked ? (
        <p className="text-sm text-muted-foreground">
          Not linked to any booking.
        </p>
      ) : (
        <Link
          href={`/admin/bookings/${linked.id}`}
          className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/30 p-3 hover:bg-muted/50"
        >
          <span className="text-sm font-medium">
            {linked.court_name} ·{" "}
            {formatHourRange(linked.start_hour, linked.end_hour)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatFacilityDate(linked.booking_date)}
            {linked.customer_label ? ` · ${linked.customer_label}` : ""}
          </span>
        </Link>
      )}
    </section>
  );
}

function EntryNotes({
  entryId,
  initial,
}: {
  entryId: string;
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
      const res = await saveWalkInEntryNotes(entryId, { notes: next });
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
          <h2 className="text-sm font-medium text-muted-foreground">Notes</h2>
          <p className="text-xs text-muted-foreground">
            Autosaves as you type.
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
        rows={4}
        maxLength={NOTES_MAX}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleSave(e.target.value);
        }}
        placeholder="Additional context for this entry…"
      />
      <p className="text-xs text-muted-foreground">
        {value.length}/{NOTES_MAX}
      </p>
    </section>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  entryId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entryId: string;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function onConfirm() {
    startTransition(async () => {
      const res = await deleteWalkInEntry(entryId);
      if (res.success) {
        toast.success("Entry deleted");
        onDeleted();
      } else {
        toast.error(res.error);
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this entry?</DialogTitle>
          <DialogDescription>
            This removes the log entry permanently. Use this only to correct a
            logging mistake — real entries should stay for the audit trail.
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
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
