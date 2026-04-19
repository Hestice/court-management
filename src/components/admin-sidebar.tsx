"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Cog,
  CreditCard,
  FileText,
  Inbox,
  LayoutGrid,
  LogOut,
  Map,
  QrCode,
  ScanLine,
  ShieldBan,
  Ticket,
  Users,
} from "lucide-react";

import { logout } from "@/app/(auth)/actions";
import { useNavGuardCheck } from "@/components/admin-nav-guard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/admin/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/admin/passes", label: "Entrance Passes", icon: Ticket },
  { href: "/admin/scan", label: "QR Scanner", icon: ScanLine },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/courts", label: "Courts", icon: LayoutGrid },
  { href: "/admin/floor-plan", label: "Floor Plan", icon: Map },
  { href: "/admin/blocked-slots", label: "Blocked Slots", icon: ShieldBan },
  { href: "/admin/payment-settings", label: "Payment Settings", icon: CreditCard },
  { href: "/admin/inquiries", label: "Inquiries", icon: Inbox },
  { href: "/admin/audit-log", label: "Audit Log", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Cog },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const checkGuard = useNavGuardCheck();

  const onNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (!checkGuard()) e.preventDefault();
  };

  return (
    <aside className="flex shrink-0 flex-col border-b border-border bg-card md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0">
      <div className="flex items-center gap-2 px-4 py-4 md:px-6">
        <QrCode className="h-5 w-5 text-primary" aria-hidden />
        <Link
          href="/admin"
          onClick={onNavClick}
          className="font-semibold tracking-tight"
        >
          Admin Panel
        </Link>
      </div>
      <nav
        aria-label="Admin navigation"
        className="flex-1 overflow-x-auto px-2 pb-2 md:overflow-x-visible md:overflow-y-auto md:px-3 md:pb-4"
      >
        <ul className="flex gap-1 md:flex-col">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavClick}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="hidden border-t border-border p-3 md:block">
        <form action={logout}>
          <Button type="submit" variant="ghost" className="w-full justify-start gap-2">
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </Button>
        </form>
      </div>
    </aside>
  );
}
