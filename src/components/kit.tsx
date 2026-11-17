"use client";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const inputCls =
  "inp h-10 rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:opacity-70";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "warn" | "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-2 truncate text-xl font-semibold tabular-nums sm:text-2xl", tone === "warn" && "text-orange-600", tone === "danger" && "text-red-600")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className={cn("flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </header>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>button]:max-sm:flex-1">{footer}</footer>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmLabel = "Confirm", danger, busy, onConfirm, onClose, children }: { open: boolean; title: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <Button variant="outline" onClick={onClose}>Back</Button>
      <Button disabled={busy} onClick={onConfirm} className={danger ? "bg-red-600 text-white hover:bg-red-700" : ""}>{busy && <Loader2 className="animate-spin" />}{confirmLabel}</Button>
    </>}>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {children}
    </Modal>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />)}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-secondary text-primary"><Inbox className="size-6" /></div>
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <AlertTriangle className="size-5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-neutral-100 text-neutral-600 ring-neutral-500/20",
};
export function Tag({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone])}>{children}</span>;
}
export const statusTone = (s: string) =>
  ({ paid: "green", confirmed: "green", issued: "green", active: "green", partial: "orange", unpaid: "red", cancelled: "red" } as Record<string, string>)[s] ?? "gray";

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>{total} records</span>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <span className="tabular-nums">Page {page} / {pages}</span>
        <Button size="icon" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  );
}

/** Responsive table wrapper with consistent styling. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLTableElement>(null);
  // On phones the table becomes a list of cards; each cell shows its column title (see .rtable in globals.css).
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    const labels = [...t.querySelectorAll("thead th")].map((th) => th.textContent ?? "");
    t.querySelectorAll("tbody tr").forEach((tr) => [...tr.children].forEach((td, i) => ((td as HTMLElement).dataset.label = labels[i] ?? "")));
  });
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table ref={ref} className="rtable w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative h-6 w-11 rounded-full transition", checked ? "bg-primary" : "bg-neutral-300")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export const rupees = (paise: number) => (paise / 100).toFixed(2);
export const toPaise = (r: string | number) => Math.round(Number(r || 0) * 100 + 1e-9);

export function VegMark({ type }: { type?: string }) {
  const c = type === "veg" ? "border-emerald-600 text-emerald-600" : type === "egg" ? "border-amber-500 text-amber-500" : "border-red-600 text-red-600";
  return <span title={type} className={cn("inline-grid size-4 shrink-0 place-items-center rounded-[3px] border-2", c)}><span className="size-1.5 rounded-full bg-current" /></span>;
}
