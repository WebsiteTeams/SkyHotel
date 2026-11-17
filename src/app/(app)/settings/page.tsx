"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, ErrorBox, Field, Loading, PageHeader, Panel, Table, Td, Toggle, inputCls } from "@/components/kit";
import Link from "next/link";
import { AuditLogTable } from "@/components/audit-log";
import { ImageUpload } from "@/components/image-upload";
import { Receipt, printReceipt, type Paper } from "@/components/receipt";
import { useCan, useSession } from "@/components/session";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { cn } from "@/lib/utils";

const TABS = [["hotel", "Hotel"], ["invoice", "Invoice & printing"], ["tax", "Tax"], ["loyalty", "Repeat customers"], ["stock", "Stock & alerts"], ["cashiers", "Cashier permissions"], ["backup", "Backup"], ["audit", "Audit log"]] as const;

function Backup() {
  const me = useSession();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<any>(null), [busy, setBusy] = useState(false);
  if (me.role !== "super_admin") return <Panel title="Backup & restore"><p className="text-sm text-muted-foreground">Only a Super Admin can export or restore backups.</p></Panel>;
  return (
    <Panel title="Backup & restore">
      <div className="space-y-5 text-sm">
        <div><p className="font-medium">Export</p><p className="mb-2 text-muted-foreground">Download all hotel data (menu, stock, bills, purchases, expenses) as JSON.</p><a href="/api/settings/backup" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 font-medium hover:bg-muted"><Download className="size-4" />Download backup</a></div>
        <div><p className="font-medium">Restore</p><p className="mb-2 text-muted-foreground">Replaces current business data with the backup file. Staff accounts are not changed. Export first!</p>
          <Button variant="outline" onClick={() => file.current?.click()}><Upload />Choose backup file</Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setPending(JSON.parse(await f.text())); } catch { toast.error("That file is not valid JSON"); } }} /></div>
      </div>
      <Confirm open={!!pending} danger busy={busy} title="Restore this backup?" confirmLabel="Restore & replace data" message={`This replaces ALL current menu, stock, bills and purchase data with the backup from ${pending?.exportedAt ?? "unknown date"}.`} onClose={() => setPending(null)}
        onConfirm={async () => { setBusy(true); try { const r = await api<any>("/api/settings/backup", { body: { confirm: "RESTORE", backup: pending } }); toast.success(`Restored ${r.restored} records`); setPending(null); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }} />
    </Panel>
  );
}

export default function Settings() {
  const can = useCan();
  const { data, error, loading, reload } = useApi<any>(can("settings.manage") ? "/api/settings" : null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("hotel");
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false), [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setS({ hotel: { ...data.hotel }, invoice: { ...data.settings.invoice }, tax: { ...data.settings.tax }, stock: { ...data.settings.stock }, notifications: { ...data.settings.notifications }, loyalty: { enabled: data.settings.loyalty?.enabled ?? true, minVisits: data.settings.loyalty?.minVisits ?? 2, percent: data.settings.loyalty?.percent ?? 5 }, tables: data.settings.tables }); }, [data]);
  if (!can("settings.manage")) return <ErrorBox message="You do not have access to settings." />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !s) return <Loading rows={6} />;
  const up = (g: string, k: string, v: any) => setS((x: any) => ({ ...x, [g]: { ...x[g], [k]: v } }));

  const save = async () => {
    setBusy(true); setErrs({});
    try {
      await api("/api/settings", { method: "PUT", body: { hotel: { name: s.hotel.name, address: s.hotel.address ?? "", phone: s.hotel.phone ?? "", email: s.hotel.email ?? "", gstin: s.hotel.gstin ?? "", logo: s.hotel.logo ?? "" }, invoice: s.invoice, tax: { ...s.tax, defaultRate: Number(s.tax.defaultRate) }, stock: { ...s.stock, expiryAlertDays: Number(s.stock.expiryAlertDays) }, notifications: s.notifications, loyalty: { ...s.loyalty, minVisits: Number(s.loyalty.minVisits), percent: Number(s.loyalty.percent) }, tables: Number(s.tables) } });
      toast.success("Settings saved"); reload();
    } catch (e: any) { setErrs(e.fields ?? {}); toast.error(e.message); } finally { setBusy(false); }
  };
  const sample = { hotel: { name: s.hotel.name, address: s.hotel.address, phone: s.hotel.phone, gstin: s.invoice.showGstin ? s.hotel.gstin : "", logo: s.hotel.logo }, invoiceNo: `${s.invoice.prefix}-${new Date().getFullYear()}-${"1".padStart(s.invoice.padding, "0")}`, date: new Date(), type: "dine_in", table: "4", cashier: "Cashier",
    items: [{ name: "Chicken Biryani", variation: "Full", qty: 2, unitPrice: 22000, discount: 0, gstRate: 5, total: 46200 }], subtotal: 44000, itemDiscount: 0, billDiscount: 0, taxable: 44000, gst: 2200, gstBreakup: [{ rate: 5, taxable: 44000, gst: 2200 }], roundOff: 0, grandTotal: 46200, footer: s.invoice.footer };

  return (
    <>
      <PageHeader title="Settings" subtitle="Hotel profile, invoicing, tax and stock rules" actions={!["backup", "audit", "cashiers"].includes(tab) && <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save changes</Button>} />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium", tab === k ? "border-primary text-orange-700" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>

      {tab === "hotel" && <Panel title="Hotel profile"><div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><p className="mb-1.5 text-sm font-medium">Logo</p><ImageUpload value={s.hotel.logo} onChange={(u) => up("hotel", "logo", u)} label="Upload logo" /></div>
        <Field label="Hotel name" error={errs["hotel.name"]}><input className={inputCls} value={s.hotel.name} onChange={(e) => up("hotel", "name", e.target.value)} /></Field>
        <Field label="Contact number"><input className={inputCls} value={s.hotel.phone ?? ""} onChange={(e) => up("hotel", "phone", e.target.value)} /></Field>
        <Field label="Email"><input className={inputCls} value={s.hotel.email ?? ""} onChange={(e) => up("hotel", "email", e.target.value)} /></Field>
        <Field label="GSTIN"><input className={inputCls} value={s.hotel.gstin ?? ""} onChange={(e) => up("hotel", "gstin", e.target.value.toUpperCase())} /></Field>
        <Field label="Address" className="sm:col-span-2"><textarea className={inputCls + " h-20 py-2"} value={s.hotel.address ?? ""} onChange={(e) => up("hotel", "address", e.target.value)} /></Field>
        <Field label="Number of tables (POS)"><input className={inputCls} type="number" min="1" max="200" value={s.tables} onChange={(e) => setS({ ...s, tables: e.target.value })} /></Field>
        <Field label="Currency"><input className={inputCls} value="INR (₹)" disabled readOnly /></Field>
      </div></Panel>}

      {tab === "invoice" && <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Panel title="Invoice settings"><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice prefix"><input className={inputCls} value={s.invoice.prefix} onChange={(e) => up("invoice", "prefix", e.target.value.toUpperCase())} /></Field>
          <Field label="Number digits"><input className={inputCls} type="number" min="3" max="8" value={s.invoice.padding} onChange={(e) => up("invoice", "padding", Number(e.target.value))} /></Field>
          <Field label="Default paper size"><select className={inputCls} value={s.invoice.paperSize} onChange={(e) => up("invoice", "paperSize", e.target.value)}><option value="58mm">58mm thermal</option><option value="80mm">80mm thermal</option><option value="A4">A4 invoice</option></select></Field>
          <Field label="Receipt footer"><input className={inputCls} value={s.invoice.footer} onChange={(e) => up("invoice", "footer", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Toggle label="Restart numbering every year (INV-2026-00001)" checked={s.invoice.resetYearly} onChange={(v) => up("invoice", "resetYearly", v)} /><Toggle label="Show GSTIN on receipt" checked={s.invoice.showGstin} onChange={(v) => up("invoice", "showGstin", v)} /></div>
        </div></Panel>
        <Panel title="Preview" action={<Button size="sm" variant="outline" onClick={() => printReceipt(s.invoice.paperSize)}>Test print</Button>}><div className="flex justify-center overflow-x-auto bg-neutral-100 p-3"><Receipt snapshot={sample} paper={s.invoice.paperSize as Paper} payments={[{ kind: "payment", method: "cash", amount: 46200 }]} /></div></Panel>
      </div>}

      {tab === "tax" && <Panel title="Tax configuration"><div className="max-w-xl space-y-1">
        <Toggle label="Charge GST on bills" checked={s.tax.enabled} onChange={(v) => up("tax", "enabled", v)} />
        <Toggle label="Menu prices already include GST" checked={s.tax.inclusive} onChange={(v) => up("tax", "inclusive", v)} />
        <Toggle label="Round bill total to the nearest rupee" checked={s.tax.roundOff} onChange={(v) => up("tax", "roundOff", v)} />
        <p className="pt-3 text-xs text-muted-foreground">GST rate is set per food item. Receipts split it into CGST and SGST.</p>
      </div></Panel>}

      {tab === "loyalty" && <Panel title="Repeat-customer discount"><div className="max-w-xl space-y-3">
        <Toggle label="Give repeat customers an automatic discount" checked={s.loyalty.enabled} onChange={(v) => up("loyalty", "enabled", v)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visits before discount starts" hint="2 = discount from the 3rd visit"><input className={inputCls} type="number" min="0" value={s.loyalty.minVisits} onChange={(e) => up("loyalty", "minVisits", e.target.value)} /></Field>
          <Field label="Discount (%)" hint="Applied to the bill after item discounts"><input className={inputCls} type="number" min="0" max="50" step="0.5" value={s.loyalty.percent} onChange={(e) => up("loyalty", "percent", e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">Customers are recognised by mobile number entered at billing. If a cashier also enters a larger manual bill discount, the larger one applies; they never stack. Cancelling a bill removes that visit.</p>
      </div></Panel>}

      {tab === "stock" && <div className="grid max-w-3xl gap-5"><Panel title="Stock deduction"><Toggle label="Automatically deduct ingredients when a bill is confirmed" checked={s.stock.autoDeduct} onChange={(v) => up("stock", "autoDeduct", v)} /><Toggle label="Block bills when an ingredient is insufficient" checked={s.stock.blockOnInsufficient} onChange={(v) => up("stock", "blockOnInsufficient", v)} />
        <p className="pt-2 text-xs text-muted-foreground">If blocking is off, the available quantity is deducted (never below zero) and a low-stock alert is raised.</p></Panel>
        <Panel title="Notifications"><Toggle label="Low and out-of-stock alerts" checked={s.notifications.lowStock} onChange={(v) => up("notifications", "lowStock", v)} /><Toggle label="Expiry alerts" checked={s.notifications.expiry} onChange={(v) => up("notifications", "expiry", v)} />
          <Field label="Alert this many days before expiry" className="mt-3 max-w-48"><input className={inputCls} type="number" min="0" value={s.stock.expiryAlertDays} onChange={(e) => up("stock", "expiryAlertDays", e.target.value)} /></Field></Panel></div>}

      {tab === "backup" && <Backup />}
      {tab === "audit" && <AuditLogTable />}
      {tab === "cashiers" && <Panel title="Cashier permissions"><p className="mb-4 max-w-xl text-sm text-muted-foreground">Create cashier accounts, switch individual permissions on or off, set discount limits, reset passwords and review shifts and approvals from Staff &amp; access.</p><Link href="/staff" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white">Open Staff &amp; access</Link></Panel>}
    </>
  );
}
