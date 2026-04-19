"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createCourts,
  deleteCourt,
  deleteCourts,
  getLatestCourtRate,
  updateCourt,
} from "./actions";
import {
  courtFormSchema,
  createCourtsSchema,
  highestCourtNumber,
  type Court,
  type CourtFormValues,
  type CreateCourtsValues,
} from "./schema";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

export function CourtsTable({ courts }: { courts: Court[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Court | null>(null);
  const [deleting, setDeleting] = useState<Court | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [bulkConfirm, setBulkConfirm] = useState<{
    ctx: DataTableBulkActionContext<Court>;
  } | null>(null);
  const [bulkPending, startBulkTransition] = useTransition();

  const columns: DataTableColumn<Court>[] = [
    { header: "Name", cell: (c) => c.name, className: "font-medium" },
    { header: "Hourly Rate", cell: (c) => PHP.format(c.hourly_rate) },
    {
      header: "Status",
      cell: (c) => (
        <Badge variant={c.is_active ? "default" : "secondary"}>
          {c.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  function onDeleteConfirm() {
    if (!deleting) return;
    const target = deleting;
    startDeleteTransition(async () => {
      const result = await deleteCourt(target.id, target.name);
      if (result.success) {
        toast.success("Court deleted");
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to delete court.");
      }
    });
  }

  function onBulkDeleteConfirm() {
    if (!bulkConfirm) return;
    const { ctx } = bulkConfirm;
    startBulkTransition(async () => {
      const { deletedCount, failedNames } = await deleteCourts(ctx.ids);
      if (deletedCount > 0 && failedNames.length === 0) {
        toast.success(
          deletedCount === 1
            ? "Court deleted"
            : `${deletedCount} courts deleted`,
        );
      } else if (deletedCount > 0 && failedNames.length > 0) {
        toast.warning(
          `Deleted ${deletedCount}. Couldn't delete ${failedNames.join(", ")} — existing bookings.`,
        );
      } else {
        toast.error(
          `Couldn't delete ${failedNames.join(", ")} — they have existing bookings. Toggle inactive instead.`,
        );
      }
      ctx.clear();
      setBulkConfirm(null);
      router.refresh();
    });
  }

  const pendingBulkCount = bulkConfirm?.ctx.ids.length ?? 0;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Courts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage court names, rates, and availability.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add Court
        </Button>
      </div>

      <DataTable
        rows={courts}
        rowKey={(c) => c.id}
        columns={columns}
        selection
        empty={
          <p className="text-sm text-muted-foreground">
            No courts yet. Add your first court to get started.
          </p>
        }
        rowSelectionAriaLabel={(c) => `Select ${c.name}`}
        bulkActions={[
          {
            label: (n) => `Delete ${n}`,
            pendingLabel: () => "Deleting…",
            pending: bulkPending,
            variant: "destructive",
            icon: Trash2,
            onClick: (ctx) => setBulkConfirm({ ctx }),
          },
        ]}
        rowActions={(court) => (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(court)}
              aria-label={`Edit ${court.name}`}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleting(court)}
              aria-label={`Delete ${court.name}`}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </>
        )}
      />

      {addOpen ? (
        <AddCourtsDialog
          courts={courts}
          onClose={() => setAddOpen(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {editing ? (
        <EditCourtDialog
          court={editing}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete court</DialogTitle>
            <DialogDescription>
              Delete {deleting?.name}? This cannot be undone.
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
              {deletePending ? "Deleting…" : "Delete"}
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
              Delete {pendingBulkCount}{" "}
              {pendingBulkCount === 1 ? "court" : "courts"}?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Courts with existing bookings will be
              skipped — toggle those inactive instead.
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
              onClick={onBulkDeleteConfirm}
              disabled={bulkPending}
            >
              {bulkPending
                ? "Deleting…"
                : `Delete ${pendingBulkCount} ${pendingBulkCount === 1 ? "court" : "courts"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddCourtsDialog({
  courts,
  onClose,
  onSaved,
}: {
  courts: Court[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const startNumber = highestCourtNumber(courts.map((c) => c.name)) + 1;

  const form = useForm<CreateCourtsValues>({
    resolver: zodResolver(createCourtsSchema),
    defaultValues: { quantity: 1, hourly_rate: 0 },
  });

  useEffect(() => {
    let cancelled = false;
    getLatestCourtRate().then((rate) => {
      if (!cancelled) form.setValue("hourly_rate", rate);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quantity = form.watch("quantity");
  const previewCount = Math.max(1, Math.min(quantity || 1, 20));
  const previewNames = Array.from(
    { length: previewCount },
    (_, i) => `Court ${startNumber + i}`,
  );
  const previewText =
    previewNames.length <= 4
      ? previewNames.join(", ")
      : `${previewNames.slice(0, 3).join(", ")}, … ${
          previewNames[previewNames.length - 1]
        }`;

  function onSubmit(values: CreateCourtsValues) {
    startTransition(async () => {
      const result = await createCourts(values);
      if (result.success) {
        toast.success(
          values.quantity === 1
            ? "Court added"
            : `${values.quantity} courts added`,
        );
        onSaved();
        onClose();
      } else {
        toast.error(result.error ?? "Failed to add courts.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add courts</DialogTitle>
          <DialogDescription>
            Courts are numbered automatically. Rename from the edit dialog if
            you need to.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={20}
                        step={1}
                        autoFocus
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? 1
                              : e.target.valueAsNumber,
                          )
                        }
                        value={Number.isFinite(field.value) ? field.value : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hourly_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly rate (PHP)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? 0
                              : e.target.valueAsNumber,
                          )
                        }
                        value={Number.isFinite(field.value) ? field.value : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Adds: <span className="font-medium text-foreground">{previewText}</span>
            </div>
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
                {pending
                  ? "Adding…"
                  : quantity > 1
                  ? `Add ${quantity} courts`
                  : "Add court"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditCourtDialog({
  court,
  onClose,
  onSaved,
}: {
  court: Court;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const form = useForm<CourtFormValues>({
    resolver: zodResolver(courtFormSchema),
    defaultValues: {
      name: court.name,
      hourly_rate: court.hourly_rate,
      is_active: court.is_active,
    },
  });

  function onSubmit(values: CourtFormValues) {
    startTransition(async () => {
      const result = await updateCourt(court.id, values);
      if (result.success) {
        toast.success("Court updated");
        onSaved();
        onClose();
      } else {
        toast.error(result.error ?? "Failed to update court.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {court.name}</DialogTitle>
          <DialogDescription>
            Update this court&apos;s name, rate, or active state.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hourly_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hourly rate (PHP)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      {...field}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === ""
                            ? 0
                            : e.target.valueAsNumber,
                        )
                      }
                      value={Number.isFinite(field.value) ? field.value : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm">Active</FormLabel>
                    <FormDescription>
                      Inactive courts are hidden from customers.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
