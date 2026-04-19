"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ImageOff, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CLIENT_UPLOAD_MAX_BYTES,
  SCREENSHOT_ACCEPT_ATTRIBUTE,
  isAcceptedScreenshotMime,
} from "@/lib/upload-validation";
import {
  formatFacilityDate,
  formatHourRange,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

import { uploadReceipt } from "./actions";

export type PaymentMethodForCustomer = {
  id: string;
  label: string;
  account_details: string;
  qr_public_url: string | null;
};

type BookingSummary = {
  court: string;
  date: string;
  startHour: number;
  endHour: number;
  totalAmount: number;
  status: string;
};

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PaymentView({
  bookingId,
  summary,
  methods,
  initialReceipt,
  isAdminViewer,
}: {
  bookingId: string;
  summary: BookingSummary;
  methods: PaymentMethodForCustomer[];
  initialReceipt: { path: string; signedUrl: string | null } | null;
  isAdminViewer: boolean;
}) {
  const [receipt, setReceipt] = useState<{
    path: string;
    signedUrl: string | null;
  } | null>(initialReceipt);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const canUpload = !isAdminViewer && summary.status === "pending";

  function submitFile(file: File) {
    if (!isAcceptedScreenshotMime(file.type)) {
      toast.error("Please upload a screenshot of your payment (image only).");
      return;
    }
    if (file.size > CLIENT_UPLOAD_MAX_BYTES) {
      toast.error("Image is too large. Maximum size is 10MB.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadReceipt(bookingId, formData);
      if (result.success) {
        setReceipt({ path: result.path, signedUrl: result.signedUrl });
        toast.success("Receipt uploaded");
      } else {
        toast.error(result.error);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    submitFile(file);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!canUpload) return;
    const file = event.dataTransfer.files?.[0];
    if (file) submitFile(file);
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Payment Instructions
        </h1>
        <p className="text-sm text-muted-foreground">
          Send payment to any of the methods below, then upload a screenshot of
          your receipt.
        </p>
      </div>

      <section
        aria-labelledby="summary-heading"
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="summary-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Booking summary
          </h2>
          <StatusBadge status={summary.status} />
        </div>
        <SummaryRow label="Court" value={summary.court} />
        <SummaryRow
          label="Date"
          value={formatFacilityDate(summary.date)}
        />
        <SummaryRow
          label="Time"
          value={formatHourRange(summary.startHour, summary.endHour)}
        />
        <SummaryRow
          label="Total"
          value={formatPHP(summary.totalAmount)}
          strong
        />
      </section>

      <section aria-labelledby="methods-heading" className="flex flex-col gap-3">
        <h2 id="methods-heading" className="text-lg font-medium">
          Payment Methods
        </h2>
        {methods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No payment methods have been configured yet. Please contact the
            facility.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {methods.map((method) => (
              <li
                key={method.id}
                className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-start"
              >
                {method.qr_public_url ? (
                  // Branded QRs (GCash/Maya/bank exports) often embed header
                  // text, logos, and account details directly in the image.
                  // Render at natural aspect up to a generous max size so the
                  // scan code and the surrounding details both stay legible.
                  <a
                    href={method.qr_public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block self-center overflow-hidden rounded-md border border-border bg-muted sm:self-start"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={method.qr_public_url}
                      alt={`${method.label} QR`}
                      className="h-auto w-full max-w-xs object-contain sm:w-56"
                    />
                  </a>
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center self-center rounded-md border border-border bg-muted sm:self-start">
                    <ImageOff
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{method.label}</p>
                  <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">
                    {method.account_details}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="upload-heading" className="flex flex-col gap-3">
        <h2 id="upload-heading" className="text-lg font-medium">
          Upload Payment Receipt
        </h2>

        {isAdminViewer ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Admin view — uploading is only available to the customer who made
            the booking.
          </div>
        ) : summary.status !== "pending" ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Your booking is {summary.status}. Upload is no longer available.
          </div>
        ) : (
          <>
            {receipt ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  One receipt uploaded. Uploading a new file will replace it.
                </p>
                {receipt.signedUrl ? (
                  <a
                    href={receipt.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block overflow-hidden rounded-md border border-border bg-background"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receipt.signedUrl}
                      alt="Uploaded receipt"
                      className="max-h-72 w-full object-contain"
                    />
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Preview unavailable — your file is saved.
                  </p>
                )}
              </div>
            ) : null}

            <label
              htmlFor="receipt-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/60 hover:bg-accent/40",
                pending && "pointer-events-none opacity-60",
              )}
            >
              <Upload
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
              <p className="text-sm font-medium">
                {pending
                  ? "Uploading…"
                  : receipt
                    ? "Replace receipt"
                    : "Drag a screenshot here or click to upload"}
              </p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WebP, or HEIC. Maximum 10MB. Saved as WebP.
              </p>
              <input
                ref={fileInputRef}
                id="receipt-file"
                type="file"
                accept={SCREENSHOT_ACCEPT_ATTRIBUTE}
                className="sr-only"
                onChange={onPickFile}
                disabled={pending}
              />
            </label>

            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Your booking is pending admin review. You&apos;ll receive an email
              once confirmed.
            </p>
          </>
        )}
      </section>

      <div className="flex gap-3">
        <Button asChild variant="ghost">
          <Link href="/my-bookings">View my bookings</Link>
        </Button>
      </div>
    </>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(strong ? "text-base font-semibold" : "font-medium")}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const classes: Record<string, string> = {
    pending:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    confirmed:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
    completed: "",
  };
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", classes[normalized] ?? "")}
    >
      {normalized === "confirmed" ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden />
      ) : null}
      {label}
    </Badge>
  );
}
