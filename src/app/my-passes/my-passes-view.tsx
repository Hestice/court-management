"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFacilityDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export type PassGuestCard = {
  id: string;
  guest_number: number;
  qr_code: string;
  redeemed_at: string | null;
};

export type MyPassCard = {
  id: string;
  pass_date: string;
  guest_count: number;
  status: string;
  total_amount: number;
  expires_at: string | null;
  has_receipt: boolean;
  guests: PassGuestCard[];
};

type Filter = "upcoming" | "past";

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const classes: Record<string, string> = {
    pending:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    confirmed:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
    expired: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", classes[normalized] ?? "")}
    >
      {normalized === "confirmed" ? (
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
      ) : null}
      {label}
    </Badge>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const deadline = new Date(expiresAt).getTime();
  const msLeft = deadline - now;

  if (msLeft <= 0) {
    return (
      <span className="text-xs text-destructive">Expired — awaiting sweep</span>
    );
  }
  const totalMinutes = Math.floor(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const text =
    hours >= 1
      ? `Expires in ${hours}h${minutes ? ` ${minutes}m` : ""}`
      : `Expires in ${minutes}m`;
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

function formatRedeemedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

export function MyPassesView({
  cards,
  today,
}: {
  cards: MyPassCard[];
  today: string;
}) {
  const [filter, setFilter] = useState<Filter>("upcoming");

  const { upcoming, past } = useMemo(() => {
    const up: MyPassCard[] = [];
    const pa: MyPassCard[] = [];
    for (const c of cards) {
      if (c.pass_date >= today) up.push(c);
      else pa.push(c);
    }
    up.sort((a, b) => a.pass_date.localeCompare(b.pass_date));
    pa.sort((a, b) => b.pass_date.localeCompare(a.pass_date));
    return { upcoming: up, past: pa };
  }, [cards, today]);

  const visible = filter === "upcoming" ? upcoming : past;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            My Passes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your purchased entrance passes and QR codes.
          </p>
        </div>
        <Button asChild>
          <Link href="/entrance">Buy a pass</Link>
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

      {visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((c) => (
            <PassCard key={c.id} card={c} />
          ))}
        </ul>
      )}
    </>
  );
}

function PassCard({ card }: { card: MyPassCard }) {
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">
            {formatFacilityDate(card.pass_date)}
          </p>
          <p className="text-sm text-muted-foreground">
            {card.guest_count}{" "}
            {card.guest_count === 1 ? "guest" : "guests"} ·{" "}
            {formatPHP(card.total_amount)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {statusBadge(card.status)}
          {card.status === "pending" && card.expires_at ? (
            <ExpiryCountdown expiresAt={card.expires_at} />
          ) : null}
          {card.status === "pending" && card.has_receipt ? (
            <span className="text-xs text-muted-foreground">
              Receipt uploaded — awaiting review
            </span>
          ) : null}
        </div>
      </div>

      {card.status === "pending" ? (
        <div>
          <Button asChild size="sm" variant={card.has_receipt ? "ghost" : "default"}>
            <Link href={`/payment/${card.id}`}>
              {card.has_receipt ? "View Payment" : "Upload Payment"}
            </Link>
          </Button>
        </div>
      ) : null}

      {card.status === "confirmed" && card.guests.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            Show at the gate — one QR per guest
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {card.guests.map((g) => (
              <GuestQr key={g.id} total={card.guest_count} guest={g} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function GuestQr({
  guest,
  total,
}: {
  guest: PassGuestCard;
  total: number;
}) {
  const redeemed = !!guest.redeemed_at;
  return (
    <li
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-border bg-background p-3 text-center",
        redeemed && "opacity-60",
      )}
    >
      <div
        className={cn(
          "rounded-md border border-border bg-white p-2",
          redeemed && "bg-muted",
        )}
      >
        <QRCodeSVG
          value={guest.qr_code}
          size={160}
          level="M"
          aria-label={`QR code for guest ${guest.guest_number}`}
        />
      </div>
      <p className="text-sm font-medium">
        Guest {guest.guest_number} of {total}
        {redeemed ? (
          <>
            {" "}
            — <span className="text-emerald-600">✓ Redeemed</span>
          </>
        ) : null}
      </p>
      {redeemed && guest.redeemed_at ? (
        <p className="text-xs text-muted-foreground">
          {formatRedeemedAt(guest.redeemed_at)}
        </p>
      ) : null}
    </li>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  if (filter === "past") {
    return (
      <p className="text-sm text-muted-foreground">No past passes.</p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-sm text-muted-foreground">
      <p>No passes yet.</p>
      <Button asChild size="sm">
        <Link href="/entrance">Buy an entrance pass →</Link>
      </Button>
    </div>
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
