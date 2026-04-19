"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createBlockedSlot,
  deleteBlockedSlot,
  deleteBlockedSlots,
} from "./actions";
import {
  createBlockSchema,
  type BlockedSlotRow,
  type CourtOption,
  type CreateBlockValues,
} from "./schema";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableBulkActionContext,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  formatFacilityDate as formatDate,
  formatHour,
  formatHourRange as formatRange,
  todayInFacility,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

type Filter = "upcoming" | "past";

export function BlockedSlotsView({
  blocks,
  courts,
  operatingStart,
  operatingEnd,
}: {
  blocks: BlockedSlotRow[];
  courts: CourtOption[];
  operatingStart: number;
  operatingEnd: number;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [deleting, setDeleting] = useState<BlockedSlotRow | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{
    ctx: DataTableBulkActionContext<BlockedSlotRow>;
  } | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [bulkPending, startBulkTransition] = useTransition();
  const router = useRouter();

  const today = todayInFacility();

  const { upcoming, past } = useMemo(() => {
    const up: BlockedSlotRow[] = [];
    const pa: BlockedSlotRow[] = [];
    for (const b of blocks) {
      if (b.slot_date >= today) up.push(b);
      else pa.push(b);
    }
    up.sort(
      (a, b) =>
        a.slot_date.localeCompare(b.slot_date) || a.start_hour - b.start_hour,
    );
    pa.sort(
      (a, b) =>
        b.slot_date.localeCompare(a.slot_date) || b.start_hour - a.start_hour,
    );
    return { upcoming: up, past: pa };
  }, [blocks, today]);

  const rows = filter === "upcoming" ? upcoming : past;

  const columns: DataTableColumn<BlockedSlotRow>[] = [
    {
      header: "Court",
      cell: (b) => b.court_name,
      className: "font-medium",
    },
    { header: "Date", cell: (b) => formatDate(b.slot_date) },
    {
      header: "Time Range",
      cell: (b) => formatRange(b.start_hour, b.end_hour),
    },
    {
      header: "Reason",
      cell: (b) => b.reason ?? "—",
      className: "max-w-xs truncate text-muted-foreground",
    },
    {
      header: "Created By",
      cell: (b) => b.created_by_name ?? "—",
      className: "text-muted-foreground",
    },
  ];

  function onDeleteConfirm() {
    if (!deleting) return;
    const target = deleting;
    startDeleteTransition(async () => {
      const result = await deleteBlockedSlot(target.id);
      if (result.success) {
        toast.success("Slot unblocked");
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to unblock slot.");
      }
    });
  }

  function onBulkConfirm() {
    if (!bulkConfirm) return;
    const { ctx } = bulkConfirm;
    startBulkTransition(async () => {
      const { deletedCount, failedCount } = await deleteBlockedSlots(ctx.ids);
      if (deletedCount > 0 && failedCount === 0) {
        toast.success(
          deletedCount === 1
            ? "Slot unblocked"
            : `${deletedCount} slots unblocked`,
        );
      } else if (deletedCount > 0 && failedCount > 0) {
        toast.warning(
          `Unblocked ${deletedCount}; ${failedCount} failed.`,
        );
      } else {
        toast.error("Failed to unblock selected slots.");
      }
      ctx.clear();
      setBulkConfirm(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Blocked Slots
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Block court/time combinations for maintenance or private events.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={courts.length === 0}>
          <Plus className="h-4 w-4" aria-hidden />
          Add Blocked Slot
        </Button>
      </div>

      <div className="flex w-fit items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
        <FilterButton
          active={filter === "upcoming"}
          onClick={() => setFilter("upcoming")}
        >
          Upcoming ({upcoming.length})
        </FilterButton>
        <FilterButton
          active={filter === "past"}
          onClick={() => setFilter("past")}
        >
          Past ({past.length})
        </FilterButton>
      </div>

      <DataTable
        key={filter}
        rows={rows}
        rowKey={(b) => b.id}
        columns={columns}
        selection
        empty={<p className="text-sm text-muted-foreground">No blocked slots.</p>}
        rowSelectionAriaLabel={(b) =>
          `Select ${b.court_name} ${formatDate(b.slot_date)} ${formatRange(b.start_hour, b.end_hour)}`
        }
        bulkActions={[
          {
            label: (n) => `Unblock ${n}`,
            pendingLabel: () => "Unblocking…",
            pending: bulkPending,
            variant: "destructive",
            icon: Trash2,
            onClick: (ctx) => setBulkConfirm({ ctx }),
          },
        ]}
        rowActions={(b) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleting(b)}
            aria-label="Unblock slot"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        )}
      />

      {addOpen ? (
        <AddBlockedSlotDialog
          courts={courts}
          operatingStart={operatingStart}
          operatingEnd={operatingEnd}
          today={today}
          onClose={() => setAddOpen(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unblock this slot?</DialogTitle>
            <DialogDescription>
              {deleting
                ? `${deleting.court_name} · ${formatDate(deleting.slot_date)} · ${formatRange(
                    deleting.start_hour,
                    deleting.end_hour,
                  )}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleting(null)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDeleteConfirm}
              disabled={deletePending}
            >
              {deletePending ? "Unblocking…" : "Unblock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!bulkConfirm}
        onOpenChange={(o) => !o && !bulkPending && setBulkConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Unblock {bulkConfirm?.ctx.ids.length ?? 0}{" "}
              {bulkConfirm?.ctx.ids.length === 1 ? "slot" : "slots"}?
            </DialogTitle>
            <DialogDescription>
              Selected blocks will be removed and their time becomes bookable
              again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setBulkConfirm(null)}
              disabled={bulkPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onBulkConfirm}
              disabled={bulkPending}
            >
              {bulkPending ? "Unblocking…" : "Unblock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-3 py-1 text-sm transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AddBlockedSlotDialog({
  courts,
  operatingStart,
  operatingEnd,
  today,
  onClose,
  onSaved,
}: {
  courts: CourtOption[];
  operatingStart: number;
  operatingEnd: number;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateBlockValues>({
    resolver: zodResolver(createBlockSchema),
    defaultValues: {
      court_id: courts[0]?.id ?? "",
      slot_date: today,
      start_hour: operatingStart,
      end_hour: Math.min(operatingStart + 1, operatingEnd),
      reason: "",
    },
  });

  // Valid start hours are [operatingStart, operatingEnd - 1];
  // valid end hours are [operatingStart + 1, operatingEnd].
  const startOptions: number[] = [];
  for (let h = operatingStart; h < operatingEnd; h++) startOptions.push(h);
  const endOptions: number[] = [];
  for (let h = operatingStart + 1; h <= operatingEnd; h++) endOptions.push(h);

  function onSubmit(values: CreateBlockValues) {
    startTransition(async () => {
      const result = await createBlockedSlot(values);
      if (result.success) {
        toast.success("Slot blocked");
        onSaved();
        onClose();
      } else {
        toast.error(result.error ?? "Failed to block slot.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add blocked slot</DialogTitle>
          <DialogDescription>
            Block a court/time window for maintenance or private use.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="court_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Court</FormLabel>
                  <FormControl>
                    <SelectInput
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={!!form.formState.errors.court_id}
                    >
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </SelectInput>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slot_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" min={today} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_hour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start</FormLabel>
                    <FormControl>
                      <SelectInput
                        value={String(field.value)}
                        onChange={(v) => field.onChange(Number(v))}
                      >
                        {startOptions.map((h) => (
                          <option key={h} value={h}>
                            {formatHour(h)}
                          </option>
                        ))}
                      </SelectInput>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_hour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End</FormLabel>
                    <FormControl>
                      <SelectInput
                        value={String(field.value)}
                        onChange={(v) => field.onChange(Number(v))}
                      >
                        {endOptions.map((h) => (
                          <option key={h} value={h}>
                            {formatHour(h)}
                          </option>
                        ))}
                      </SelectInput>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Maintenance"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Shown internally; customers only see the slot as unavailable.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Blocking…" : "Block slot"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SelectInput({
  value,
  onChange,
  children,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
