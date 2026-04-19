"use client";

// [QR library choice] nimiq/qr-scanner (~45 KB gzipped). Small, worker-based
// decode, ships TS types, BarcodeDetector fast-path on supported browsers.
// Loaded via `import()` inside useEffect so neither the library nor its
// worker leak into the admin layout bundle or the server build.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type QrScanner from "qr-scanner";
import {
  AlertTriangle,
  CameraOff,
  CheckCircle2,
  Maximize2,
  Minimize2,
  ScanLine,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatFacilityDate, formatHourRange } from "@/lib/timezone";
import { cn } from "@/lib/utils";

import {
  redeemGuestById,
  redeemGuestByQrCode,
  type RedemptionResult,
} from "./actions";

export type ScanSearchGuest = {
  id: string;
  guest_number: number;
  qr_code: string;
  redeemed_at: string | null;
  redeemed_by_name: string | null;
};

export type ScanSearchBooking = {
  id: string;
  start_hour: number;
  end_hour: number;
  court_name: string;
  customer_name: string | null;
  customer_email: string | null;
  walk_in_name: string | null;
  guest_count: number;
  guests: ScanSearchGuest[];
};

type Mode = "camera" | "manual";

type OutcomeKind = RedemptionResult["status"];

// Windows where a single code keeps firing: ignore it for this long before we
// accept the same string again. Prevents the decode loop from slamming the
// server when the scanner locks on to one QR.
const DEDUPE_MS = 2500;

// Auto-dismiss the green success card after this much time; the admin
// immediately returns to scanning. WARN/ERROR outcomes never auto-dismiss.
const SUCCESS_DISMISS_MS = 2000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayNameFromBooking(b: ScanSearchBooking): string {
  return (
    b.customer_name?.trim() ||
    b.walk_in_name?.trim() ||
    b.customer_email ||
    "Guest"
  );
}

export function ScannerView({
  today,
  bookings,
}: {
  today: string;
  bookings: ScanSearchBooking[];
}) {
  const [mode, setMode] = useState<Mode>("camera");
  const [outcome, setOutcome] = useState<RedemptionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [kiosk, setKiosk] = useState(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);

  // Kiosk mode: fixed-overlay view for unattended laptops at the gate. An
  // opaque black panel covers the admin sidebar + page chrome so customers
  // glancing at the screen see only the scanner. Also attempts to go browser
  // fullscreen (belt-and-suspenders — the overlay alone is enough to hide
  // admin UI, fullscreen just hides URL bar/tabs).
  const enterKiosk = useCallback(() => {
    setMode("camera");
    setKiosk(true);
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().catch(() => {
        /* fullscreen blocked (iframe, permissions) — overlay still applies */
      });
    }
  }, []);

  const exitKiosk = useCallback(() => {
    setKiosk(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Sync kiosk state with the native fullscreen state. If the user presses
  // Esc (which exits fullscreen) we also drop out of kiosk so they aren't
  // stuck with the opaque overlay but no URL bar.
  useEffect(() => {
    if (!kiosk) return;
    function onFsChange() {
      if (!document.fullscreenElement) setKiosk(false);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [kiosk]);

  // Auto-dismiss success after SUCCESS_DISMISS_MS. Other outcomes stay until
  // the admin acts on them.
  useEffect(() => {
    if (!outcome || outcome.status !== "success") return;
    const id = window.setTimeout(() => setOutcome(null), SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [outcome]);

  const clearOutcome = useCallback(() => {
    setOutcome(null);
    lastCodeRef.current = null;
  }, []);

  const submitQr = useCallback(
    (qr: string, override = false) => {
      const now = Date.now();
      const prior = lastCodeRef.current;
      if (
        !override &&
        prior &&
        prior.code === qr &&
        now - prior.at < DEDUPE_MS
      ) {
        return;
      }
      lastCodeRef.current = { code: qr, at: now };
      startTransition(async () => {
        let res: RedemptionResult;
        try {
          res = await redeemGuestByQrCode(qr, {
            overrideDateMismatch: override,
          });
        } catch {
          // Data-layer errors bubble as thrown exceptions; surface as a
          // dismissable card so the admin can retry without page reload.
          res = { status: "error", error: "Something went wrong. Try again." };
        }
        setOutcome(res);
        // Reset dedupe on terminal outcomes so the admin can immediately try
        // another code; date_mismatch keeps the dedupe so the same QR doesn't
        // auto-retrigger while the dialog is open.
        if (res.status !== "date_mismatch" && res.status !== "success") {
          lastCodeRef.current = null;
        }
      });
    },
    [startTransition],
  );

  const submitGuestId = useCallback(
    (guestId: string, override = false) => {
      startTransition(async () => {
        let res: RedemptionResult;
        try {
          res = await redeemGuestById(guestId, {
            overrideDateMismatch: override,
          });
        } catch {
          res = { status: "error", error: "Something went wrong. Try again." };
        }
        setOutcome(res);
      });
    },
    [startTransition],
  );

  // "Let them in anyway" from the date-mismatch card. Replays the scan/manual
  // call with override_date_mismatch=true, reusing whatever source got us here.
  const confirmOverride = useCallback(() => {
    if (!outcome || outcome.status !== "date_mismatch") return;
    submitGuestId(outcome.guest.guest_id, true);
  }, [outcome, submitGuestId]);

  // Scanner should be paused while a result card is on screen so the admin
  // can read it without the feed re-triggering on the same code.
  const scannerPaused = !!outcome || pending;

  // In kiosk mode we force camera-only; manual search has no UI in that
  // mode because the chrome around it is hidden.
  const showManual = !kiosk && mode === "manual";

  return (
    <main
      className={cn(
        kiosk
          ? "fixed inset-0 z-50 flex flex-col gap-3 bg-black p-3 sm:p-4"
          : "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8",
      )}
    >
      {!kiosk ? (
        <>
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                QR Scanner
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatFacilityDate(today)} · {bookings.length}{" "}
                {bookings.length === 1 ? "booking" : "bookings"} today
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={enterKiosk}
              className="gap-1.5"
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
              Kiosk mode
            </Button>
          </header>

          <ModeTabs mode={mode} onChange={setMode} />
        </>
      ) : (
        <button
          type="button"
          onClick={exitKiosk}
          aria-label="Exit kiosk mode"
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur hover:bg-white/20 hover:text-white sm:right-4 sm:top-4"
        >
          <Minimize2 className="h-3.5 w-3.5" aria-hidden />
          Exit kiosk
        </button>
      )}

      {showManual ? (
        <ManualPanel
          bookings={bookings}
          pending={pending}
          onRedeem={(guestId) => submitGuestId(guestId)}
        />
      ) : (
        <CameraPanel
          paused={scannerPaused}
          onDecode={submitQr}
          fill={kiosk}
        />
      )}

      {outcome ? (
        <ResultCard
          outcome={outcome}
          pending={pending}
          kiosk={kiosk}
          onDismiss={clearOutcome}
          onConfirmOverride={confirmOverride}
        />
      ) : null}
    </main>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Scan mode"
      className="inline-flex self-start rounded-lg border border-border bg-muted p-1 text-sm"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "camera"}
        onClick={() => onChange("camera")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
          mode === "camera"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ScanLine className="h-4 w-4" aria-hidden />
        Camera
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "manual"}
        onClick={() => onChange("manual")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
          mode === "manual"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Search className="h-4 w-4" aria-hidden />
        Manual
      </button>
    </div>
  );
}

// ============================================================================
// Camera
// ============================================================================
function CameraPanel({
  paused,
  onDecode,
  fill = false,
}: {
  paused: boolean;
  onDecode: (qr: string) => void;
  fill?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  // Mount scanner once. Using a ref-stable onDecode callback so the effect
  // doesn't re-initialize the camera on every parent render (would flash a
  // black frame on mobile every time a pending state changed).
  useEffect(() => {
    let cancelled = false;
    let instance: QrScanner | null = null;

    (async () => {
      try {
        const mod = await import("qr-scanner");
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;

        const QrScannerCtor = mod.default;
        instance = new QrScannerCtor(
          video,
          (res) => onDecodeRef.current(res.data),
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
            returnDetailedScanResult: true,
          },
        );

        await instance.start();
        if (cancelled) {
          instance.destroy();
          return;
        }
        scannerRef.current = instance;
        setStarting(false);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        const message =
          err instanceof Error ? err.message : "Can't access the camera.";
        setPermissionError(message);
      }
    })();

    return () => {
      cancelled = true;
      instance?.destroy();
      scannerRef.current = null;
    };
  }, []);

  // Pause decoding while a result is on screen so the admin has a clean look.
  // Tracks the last applied state so we don't issue a redundant start() right
  // after the mount effect already started the scanner (paused=false on mount).
  const lastPausedRef = useRef<boolean>(false);
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (lastPausedRef.current === paused) return;
    lastPausedRef.current = paused;
    if (paused) {
      scanner.pause();
    } else {
      scanner.start().catch(() => {
        /* stream may have been yanked by the OS; next mount will recover */
      });
    }
  }, [paused]);

  if (permissionError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <CameraOff className="h-4 w-4" aria-hidden />
            Camera unavailable
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{permissionError}</p>
          <p className="text-muted-foreground">
            Allow camera access in your browser settings, or switch to the
            Manual tab to search by name.
          </p>
        </CardContent>
      </Card>
    );
  }

  // In fill mode (kiosk) the video expands to fill all available parent
  // height; otherwise it uses the normal portrait-on-mobile / video ratio.
  return (
    <div
      className={cn(
        fill ? "flex min-h-0 flex-1 flex-col" : "space-y-2",
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-black",
          fill
            ? "flex-1 rounded-lg"
            : "aspect-[3/4] rounded-xl sm:aspect-video",
        )}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {starting ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting camera…
          </div>
        ) : null}
      </div>
      {!fill ? (
        <p className="text-xs text-muted-foreground">
          Point the camera at the guest&apos;s QR code. Results appear
          automatically.
        </p>
      ) : null}
    </div>
  );
}

// ============================================================================
// Manual search
// ============================================================================
function ManualPanel({
  bookings,
  pending,
  onRedeem,
}: {
  bookings: ScanSearchBooking[];
  pending: boolean;
  onRedeem: (guestId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  // Two-pronged search: by customer name/walk-in name, or by qr_code prefix
  // (first 8 chars is enough — any more and the admin would've scanned it).
  const filtered = useMemo(() => {
    if (!trimmed) return bookings;
    return bookings.filter((b) => {
      const name = displayNameFromBooking(b).toLowerCase();
      if (name.includes(trimmed)) return true;
      if (b.guests.some((g) => g.qr_code.toLowerCase().startsWith(trimmed)))
        return true;
      return false;
    });
  }, [bookings, trimmed]);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customer name or QR prefix…"
        className="h-10"
        autoFocus
      />
      {bookings.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No confirmed bookings for today.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No matches. Try a different name or QR prefix.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((b) => (
            <ManualBookingRow
              key={b.id}
              booking={b}
              pending={pending}
              onRedeem={onRedeem}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualBookingRow({
  booking,
  pending,
  onRedeem,
}: {
  booking: ScanSearchBooking;
  pending: boolean;
  onRedeem: (guestId: string) => void;
}) {
  const name = displayNameFromBooking(booking);
  return (
    <li>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">{name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {booking.court_name} ·{" "}
            {formatHourRange(booking.start_hour, booking.end_hour)} ·{" "}
            {booking.guest_count}{" "}
            {booking.guest_count === 1 ? "guest" : "guests"}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="divide-y divide-border/60">
            {booking.guests.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    Guest {g.guest_number} of {booking.guest_count}
                  </span>
                  {g.redeemed_at ? (
                    <span className="text-xs text-emerald-600">
                      ✓ Redeemed {formatTime(g.redeemed_at)}
                      {g.redeemed_by_name ? ` · ${g.redeemed_by_name}` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not redeemed
                    </span>
                  )}
                </div>
                {!g.redeemed_at ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      toast.dismiss();
                      onRedeem(g.id);
                    }}
                  >
                    Mark redeemed
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </li>
  );
}

// ============================================================================
// Result card (shared between scan + manual)
// ============================================================================
function ResultCard({
  outcome,
  pending,
  kiosk = false,
  onDismiss,
  onConfirmOverride,
}: {
  outcome: RedemptionResult;
  pending: boolean;
  kiosk?: boolean;
  onDismiss: () => void;
  onConfirmOverride: () => void;
}) {
  const kind: OutcomeKind = outcome.status;

  const palette = getPalette(kind);

  return (
    <Card
      aria-live="polite"
      className={cn(
        "border-2 shadow-lg",
        palette.border,
        palette.bg,
        kiosk && "shrink-0",
      )}
    >
      <CardHeader>
        <CardTitle
          className={cn(
            "flex items-center gap-2 text-lg",
            palette.title,
          )}
        >
          {palette.icon}
          {palette.heading(outcome)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResultBody outcome={outcome} />

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {outcome.status === "date_mismatch" ? (
            <>
              <Button variant="ghost" onClick={onDismiss} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={onConfirmOverride} disabled={pending}>
                {pending ? "Saving…" : "Confirm entry"}
              </Button>
            </>
          ) : outcome.status === "success" ? (
            <Button variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : (
            <Button variant="outline" onClick={onDismiss}>
              <X className="mr-1 h-4 w-4" aria-hidden />
              Dismiss
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type Palette = {
  border: string;
  bg: string;
  title: string;
  icon: React.ReactNode;
  heading: (o: RedemptionResult) => string;
};

function getPalette(kind: OutcomeKind): Palette {
  if (kind === "success") {
    return {
      border: "border-emerald-500/60",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      title: "text-emerald-700 dark:text-emerald-300",
      icon: <CheckCircle2 className="h-5 w-5" aria-hidden />,
      heading: () => "Entry confirmed",
    };
  }
  if (kind === "date_mismatch") {
    return {
      border: "border-amber-500/60",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      title: "text-amber-700 dark:text-amber-300",
      icon: <AlertTriangle className="h-5 w-5" aria-hidden />,
      heading: () => "Date mismatch",
    };
  }
  if (kind === "already_redeemed") {
    return {
      border: "border-red-500/60",
      bg: "bg-red-50 dark:bg-red-950/30",
      title: "text-red-700 dark:text-red-300",
      icon: <XCircle className="h-5 w-5" aria-hidden />,
      heading: () => "Already redeemed",
    };
  }
  if (kind === "not_found") {
    return {
      border: "border-red-500/60",
      bg: "bg-red-50 dark:bg-red-950/30",
      title: "text-red-700 dark:text-red-300",
      icon: <XCircle className="h-5 w-5" aria-hidden />,
      heading: () => "QR not recognized",
    };
  }
  if (kind === "rate_limited") {
    return {
      border: "border-amber-500/60",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      title: "text-amber-700 dark:text-amber-300",
      icon: <AlertTriangle className="h-5 w-5" aria-hidden />,
      heading: () => "Slow down",
    };
  }
  if (kind === "not_eligible") {
    return {
      border: "border-red-500/60",
      bg: "bg-red-50 dark:bg-red-950/30",
      title: "text-red-700 dark:text-red-300",
      icon: <XCircle className="h-5 w-5" aria-hidden />,
      heading: () => "Not eligible",
    };
  }
  return {
    border: "border-red-500/60",
    bg: "bg-red-50 dark:bg-red-950/30",
    title: "text-red-700 dark:text-red-300",
    icon: <XCircle className="h-5 w-5" aria-hidden />,
    heading: () => "Something went wrong",
  };
}

function ResultBody({ outcome }: { outcome: RedemptionResult }) {
  if (outcome.status === "success") {
    const g = outcome.guest;
    return (
      <div className="space-y-1 text-sm">
        <p className="text-lg font-semibold">{g.customer_display_name}</p>
        <p className="text-muted-foreground">
          Guest {g.guest_number} of {g.guest_count} · {g.court_name} ·{" "}
          {formatHourRange(g.start_hour, g.end_hour)}
        </p>
        <p className="font-medium">Entered at {formatTime(outcome.redeemed_at)}</p>
        {outcome.override_date ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Booked for {formatFacilityDate(g.booking_date)} — date override
            logged.
          </p>
        ) : null}
      </div>
    );
  }

  if (outcome.status === "date_mismatch") {
    const g = outcome.guest;
    return (
      <div className="space-y-1 text-sm">
        <p className="text-lg font-semibold">{g.customer_display_name}</p>
        <p className="text-muted-foreground">
          Guest {g.guest_number} of {g.guest_count} · {g.court_name} ·{" "}
          {formatHourRange(g.start_hour, g.end_hour)}
        </p>
        <p>
          This QR is for{" "}
          <span className="font-semibold">
            {formatFacilityDate(g.booking_date)}
          </span>
          . Today is{" "}
          <span className="font-semibold">
            {formatFacilityDate(outcome.today)}
          </span>
          .
        </p>
        <p className="text-muted-foreground">Let them in anyway?</p>
      </div>
    );
  }

  if (outcome.status === "already_redeemed") {
    const g = outcome.guest;
    return (
      <div className="space-y-1 text-sm">
        <p className="text-lg font-semibold">{g.customer_display_name}</p>
        <p className="text-muted-foreground">
          Guest {g.guest_number} of {g.guest_count} · {g.court_name} ·{" "}
          {formatHourRange(g.start_hour, g.end_hour)}
        </p>
        <p>
          Used at{" "}
          <span className="font-medium">
            {formatTime(outcome.redeemed_at)}
          </span>
          {outcome.redeemed_by_name
            ? ` by ${outcome.redeemed_by_name}`
            : ""}
          .
        </p>
      </div>
    );
  }

  if (outcome.status === "not_eligible") {
    const g = outcome.guest;
    return (
      <div className="space-y-1 text-sm">
        <p className="text-lg font-semibold">{g.customer_display_name}</p>
        <p>{outcome.reason}</p>
      </div>
    );
  }

  if (outcome.status === "not_found") {
    return (
      <p className="text-sm">
        This QR code isn&apos;t in our system. Check that the customer opened
        the right pass, then try manual search.
      </p>
    );
  }

  if (outcome.status === "rate_limited") {
    return <p className="text-sm">{outcome.error}</p>;
  }

  return <p className="text-sm">{outcome.error}</p>;
}
