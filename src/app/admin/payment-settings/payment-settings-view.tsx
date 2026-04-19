"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImageOff, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  SCREENSHOT_ACCEPT_ATTRIBUTE,
  isAcceptedScreenshotMime,
} from "@/lib/upload-validation";
import { cn } from "@/lib/utils";

import {
  createPaymentMethod,
  deletePaymentMethod,
  reorderPaymentMethods,
  updatePaymentMethod,
} from "./actions";
import {
  PAYMENT_DETAILS_MAX,
  PAYMENT_LABEL_MAX,
  paymentMethodFormSchema,
  type PaymentMethod,
  type PaymentMethodFormValues,
} from "./schema";

const QR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export function PaymentSettingsView({
  methods: initialMethods,
}: {
  methods: PaymentMethod[];
}) {
  // `optimistic` shadows the server-supplied ordering while a drag is being
  // persisted. When the server revalidates and initialMethods identity
  // changes, reset the override during render — React's supported pattern
  // for prop-driven state resets (https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes).
  const [optimistic, setOptimistic] = useState<PaymentMethod[] | null>(null);
  const [prevInitial, setPrevInitial] = useState(initialMethods);
  if (prevInitial !== initialMethods) {
    setPrevInitial(initialMethods);
    setOptimistic(null);
  }
  const methods = optimistic ?? initialMethods;

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [deleting, setDeleting] = useState<PaymentMethod | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = methods.findIndex((m) => m.id === active.id);
    const newIndex = methods.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(methods, oldIndex, newIndex);
    setOptimistic(next);

    // Fire-and-forget the persist; if it fails, drop the optimistic override so
    // the UI snaps back to the server-confirmed order.
    void reorderPaymentMethods(next.map((m) => m.id)).then((result) => {
      if (!result.success) {
        toast.error(result.error ?? "Couldn't save new order.");
        setOptimistic(null);
      }
    });
  }

  function onDeleteConfirm() {
    if (!deleting) return;
    const target = deleting;
    startDeleteTransition(async () => {
      const result = await deletePaymentMethod(target.id);
      if (result.success) {
        toast.success("Payment method deleted");
        setDeleting(null);
      } else {
        toast.error(result.error ?? "Failed to delete.");
      }
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payment Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure GCash QRs and account details shown to customers at
            checkout.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add Payment Method
        </Button>
      </div>

      {methods.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No payment methods yet. Add one so customers know how to pay.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={methods.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-3">
              {methods.map((method) => (
                <PaymentMethodCard
                  key={method.id}
                  method={method}
                  onEdit={() => setEditing(method)}
                  onDelete={() => setDeleting(method)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {addOpen ? (
        <PaymentMethodDialog
          mode="create"
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {editing ? (
        <PaymentMethodDialog
          mode="edit"
          method={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete payment method</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleting?.label}&rdquo;? Customers will no longer
              see it on the payment page.
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
    </>
  );
}

function PaymentMethodCard({
  method,
  onEdit,
  onDelete,
}: {
  method: PaymentMethod;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: method.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm",
        isDragging && "z-10 shadow-lg",
        !method.is_active && "opacity-60",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${method.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      {method.qr_public_url ? (
        // Thumbnail in the list stays small; click opens the full branded
        // image so the admin can confirm the content (platform headers,
        // account details printed inside the QR) without leaving the page.
        <a
          href={method.qr_public_url}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${method.label} QR at full size`}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted transition-opacity hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={method.qr_public_url}
            alt=""
            className="h-full w-full object-contain"
          />
        </a>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{method.label}</p>
          <Badge variant={method.is_active ? "default" : "secondary"}>
            {method.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">
          {method.account_details}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          aria-label={`Edit ${method.label}`}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          aria-label={`Delete ${method.label}`}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

type DialogMode = "create" | "edit";

function PaymentMethodDialog({
  mode,
  method,
  onClose,
}: {
  mode: DialogMode;
  method?: PaymentMethod;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    method?.qr_public_url ?? null,
  );
  const [removeExisting, setRemoveExisting] = useState(false);

  const form = useForm<PaymentMethodFormValues>({
    resolver: zodResolver(paymentMethodFormSchema),
    defaultValues: {
      label: method?.label ?? "",
      account_details: method?.account_details ?? "",
      is_active: method?.is_active ?? true,
    },
  });

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isAcceptedScreenshotMime(file.type)) {
      toast.error("QR image must be JPG, PNG, or WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > QR_UPLOAD_MAX_BYTES) {
      toast.error("QR image must be 2MB or less.");
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    setRemoveExisting(false);
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPreviewUrl(method?.qr_public_url ?? null);
  }

  function markForRemoval() {
    clearSelectedFile();
    setRemoveExisting(true);
    setPreviewUrl(null);
  }

  async function onSubmit(values: PaymentMethodFormValues) {
    const formData = new FormData();
    formData.set("label", values.label);
    formData.set("account_details", values.account_details);
    formData.set("is_active", values.is_active ? "true" : "false");
    if (selectedFile) {
      formData.set("qr_file", selectedFile);
    }
    if (mode === "edit" && removeExisting && !selectedFile) {
      formData.set("remove_qr", "true");
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createPaymentMethod(formData)
          : await updatePaymentMethod(method!.id, formData);
      if (result.success) {
        toast.success(
          mode === "create" ? "Payment method added" : "Payment method updated",
        );
        onClose();
      } else {
        toast.error(result.error ?? "Failed to save.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add payment method" : `Edit ${method!.label}`}
          </DialogTitle>
          <DialogDescription>
            Shown to customers on the payment page.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={PAYMENT_LABEL_MAX}
                      placeholder="e.g. GCash"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>QR image (optional)</FormLabel>
              <div className="flex items-start gap-3">
                {previewUrl ? (
                  // Preview stays compact in the dialog; admin can click to
                  // open the full-size branded QR in a new tab when the
                  // details inside the image matter (platform headers,
                  // account info burned into the graphic).
                  <a
                    href={previewUrl}
                    target={selectedFile ? undefined : "_blank"}
                    rel="noreferrer"
                    aria-label="View QR at full size"
                    className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted transition-opacity hover:opacity-80"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="QR preview"
                      className="h-full w-full object-contain"
                    />
                  </a>
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    <ImageOff
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={SCREENSHOT_ACCEPT_ATTRIBUTE}
                    onChange={onPickFile}
                    className="block text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs hover:file:bg-accent"
                  />
                  <p className="text-xs text-muted-foreground">
                    JPG/PNG/WebP, max 2MB. Saved as WebP.
                  </p>
                  {(previewUrl && (selectedFile || method?.qr_path)) ? (
                    <div className="flex gap-2">
                      {selectedFile ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={clearSelectedFile}
                        >
                          <X className="h-3 w-3" aria-hidden />
                          Undo
                        </Button>
                      ) : null}
                      {mode === "edit" && method?.qr_path ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={markForRemoval}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                          Remove QR
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </FormItem>

            <FormField
              control={form.control}
              name="account_details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account details</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      maxLength={PAYMENT_DETAILS_MAX}
                      placeholder={`e.g.\nAccount: Juan dela Cruz\nNumber: 0917 123 4567`}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Shown beside the QR image. {PAYMENT_DETAILS_MAX} characters max.
                  </FormDescription>
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
                      Inactive methods stay saved but are hidden from customers.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
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
                {pending
                  ? "Saving…"
                  : mode === "create"
                    ? "Add payment method"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
