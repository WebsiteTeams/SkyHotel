"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, BookOpen, Boxes, Bell, ChefHat, ClipboardList, Cog, FileText, LayoutDashboard, LogOut, Menu, Receipt,
  ShoppingBasket, Store, Tags, Truck, UserCog, UserRound, UtensilsCrossed, Wallet, X, ArrowLeftRight, Clock, ShieldCheck,
} from "lucide-react";
import { SessionProvider, type ClientSession, useSession } from "./session";
import { api, useApi, fmtDateTime } from "@/lib/client";
import { ROLE_LABEL, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";

/** perm: null = everyone; any: visible if the user has at least one of these. */
type Item = { href: string; label: string; icon: any; perm: Permission | null; any?: Permission[] };
const NAV: Array<{ group: string; items: Item[] }> = [
  { group: "Operations", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: null },
    { href: "/pos", label: "POS Billing", icon: Receipt, perm: "pos.use" },
    { href: "/billing/history", label: "Billing History", icon: ClipboardList, perm: "billing.view" },
    { href: "/shift", label: "Shift Management", icon: Clock, perm: null, any: ["shift.view", "shift.open"] },
    { href: "/approvals", label: "Approvals", icon: ShieldCheck, perm: "approvals.manage" },
  ] },
  { group: "Menu", items: [
    { href: "/categories", label: "Categories", icon: Tags, perm: "catalog.manage" },
    { href: "/food-items", label: "Food Items", icon: UtensilsCrossed, perm: "catalog.view" },
    { href: "/recipes", label: "Recipes", icon: ChefHat, perm: "recipes.manage" },
  ] },
  { group: "Stock", items: [
    { href: "/inventory", label: "Inventory", icon: Boxes, perm: "inventory.view" },
    { href: "/inventory/movements", label: "Stock Movements", icon: ArrowLeftRight, perm: "inventory.view" },
    { href: "/purchases", label: "Purchases", icon: ShoppingBasket, perm: "purchases.manage" },
    { href: "/suppliers", label: "Suppliers", icon: Truck, perm: "suppliers.manage" },
  ] },
  { group: "Finance", items: [
    { href: "/expenses", label: "Expenses", icon: Wallet, perm: "expenses.manage" },
    { href: "/reports/sales", label: "Sales Report", icon: BarChart3, perm: "reports.view" },
    { href: "/reports/inventory", label: "Inventory Report", icon: BookOpen, perm: "reports.view" },
    { href: "/reports/profit", label: "Profit Report", icon: FileText, perm: "reports.profit" },
  ] },
  { group: "Account", items: [
    { href: "/staff", label: "Staff", icon: UserCog, perm: "staff.manage" },
    { href: "/settings", label: "Settings", icon: Cog, perm: "settings.manage" },
    { href: "/profile", label: "My Profile", icon: UserRound, perm: null },
  ] },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const s = useSession();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((g) => {
        const items = g.items.filter((i) => (i.any ? i.any.some((p) => s.permissions.includes(p)) : !i.perm || s.permissions.includes(i.perm)));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.group}</p>
            {items.map((i) => {
              const active = path === i.href || (i.href !== "/inventory" && path.startsWith(i.href + "/")) || (i.href === "/inventory" && /^\/inventory\/(?!movements)/.test(path));
              return (
                <Link key={i.href} href={i.href} onClick={onNavigate}
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", active ? "bg-secondary text-orange-700" : "text-neutral-600 hover:bg-muted hover:text-foreground")}>
                  <i.icon className={cn("size-[18px]", active && "text-primary")} />{i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  const s = useSession();
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <div className="grid size-9 place-items-center rounded-xl bg-primary text-white shadow-sm"><Store className="size-5" /></div>
      <div className="min-w-0 leading-tight">
        <p className="text-base font-semibold tracking-tight">SkyHotel</p>
        <p className="truncate text-xs text-muted-foreground">{s.hotelName}</p>
      </div>
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<{ items: any[]; unread: number }>("/api/notifications");
  useEffect(() => { const t = setInterval(reload, 60_000); return () => clearInterval(t); }, [reload]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications" className="relative rounded-lg p-2 text-neutral-600 hover:bg-muted">
        <Bell className="size-5" />
        {!!data?.unread && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">{data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[88vw] rounded-xl border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {!!data?.unread && <button className="text-xs font-medium text-primary" onClick={async () => { await api("/api/notifications", { method: "POST", body: {} }); reload(); }}>Mark all read</button>}
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {data?.items.length ? data.items.map((n) => (
                <li key={n._id} className={cn("px-4 py-3 text-sm", !n.read && "bg-secondary/60")}>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
                </li>
              )) : <li className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const s = useSession();
  const router = useRouter();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const pos = path === "/pos";
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-white lg:flex print:hidden">
        <Brand /><Nav />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <button className="absolute right-3 top-4 rounded-lg p-1.5 hover:bg-muted" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="size-5" /></button>
            <Brand /><Nav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-white/90 px-3 backdrop-blur sm:gap-3 sm:px-4 print:hidden">
          <button className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex-1" />
          <Notifications />
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium">{s.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABEL[s.role]}</p>
          </div>
          <button aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-neutral-600 hover:bg-muted"
            onClick={async () => { await api("/api/auth/logout", { method: "POST", body: {} }); router.replace("/login"); }}>
            <LogOut className="size-5" />
          </button>
        </header>
        <main className={cn("min-w-0 flex-1", pos ? "p-2 sm:p-3" : "mx-auto w-full max-w-7xl p-3 sm:p-6 2xl:max-w-[1600px]")}>{children}</main>
      </div>
    </div>
  );
}

export function Shell({ session, children }: { session: ClientSession; children: ReactNode }) {
  return <SessionProvider value={session}><Inner>{children}</Inner></SessionProvider>;
}
