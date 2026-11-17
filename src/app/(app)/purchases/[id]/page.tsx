"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Banknote, FileText, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, ErrorBox, Field, Loading, Modal, PageHeader, Panel, Stat, Table, Tag, Td, inputCls, rupees, statusTone, toPaise } from "@/components/kit";
import { PurchaseForm } from "@/components/purchase-form";
import { api, fmtDate, isoDay, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

export default function PurchaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<any>(`/api/purchases/${id}`);
  const [mode, setMode] = useState<null | "edit" | "cancel" | "pay">(null);
  const [reason, setReason] = useState(""), [amount, setAmount] = useState(""), [method, setMethod] = useState("cash"), [date, setDate] = useState(isoDay()), [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  if (loading && !data) return <Loading rows={5} />;
  if (error || !data) return <ErrorBox message={error ?? "Not found"} onRetry={reload} />;
  const { purchase: p, items } = data;
  const cancelled = p.status === "cancelled";
  const due = p.total - p.paidAmount;

  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setErr(""); try { await fn(); toast.success(ok); setMode(null); reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  return (
    <>
      <Link href="/purchases" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Purchases</Link>
      <PageHeader title={p.purchaseNo} subtitle={`${p.supplier?.name} · ${fmtDate(p.date)}${p.invoiceNo ? ` · Invoice ${p.invoiceNo}` : ""}`} actions={<>
        <Tag tone={statusTone(cancelled ? "cancelled" : p.paymentStatus) as any}>{cancelled ? "cancelled" : p.paymentStatus}</Tag>
        {p.attachment && <a href={p.attachment} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><FileText className="size-4" />Invoice</a>}
        {!cancelled && due > 0 && <Button variant="outline" onClick={() => { setAmount(rupees(due)); setErr(""); setMode("pay"); }}><Banknote />Record payment</Button>}
        {!cancelled && <Button variant="outline" onClick={() => setMode("edit")}><Pencil />Edit</Button>}
        {!cancelled && <Button variant="outline" className="border-red-200 text-red-600" onClick={() => { setReason(""); setErr(""); setMode("cancel"); }}><Ban />Cancel</Button>}
      </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Subtotal" value={fmtINR(p.subtotal)} /><Stat label="Total" value={fmtINR(p.total)} hint={`Disc ${fmtINR(p.discount)} · Tax ${fmtINR(p.tax)} · Other ${fmtINR(p.charges)}`} /><Stat label="Paid" value={fmtINR(p.paidAmount)} /><Stat label="Balance" value={fmtINR(due)} tone={due > 0 && !cancelled ? "warn" : undefined} />
      </div>
      {cancelled && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Cancelled {fmtDate(p.cancelledAt)}: {p.cancelReason}. Stock added by this purchase was removed.</div>}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Panel title="Items">
          <Table head={["Item", "Quantity", "Rate", "Expiry", "Amount"]} className="-mx-4 -my-2">
            {items.map((i: any) => <tr key={i._id}><Td className="font-medium">{i.name}</Td><Td>{i.quantity} {i.unit}</Td><Td className="tabular-nums">{fmtINR(i.rate)}/{i.unit}</Td><Td className="text-muted-foreground">{i.expiryDate ? fmtDate(i.expiryDate) : "-"}</Td><Td className="tabular-nums">{fmtINR(i.amount)}</Td></tr>)}
          </Table>
        </Panel>
        <Panel title="Payment history">
          {p.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : <ul className="divide-y divide-border text-sm">{p.payments.map((x: any, i: number) => <li key={i} className="flex justify-between py-2"><span className="capitalize">{x.method}<span className="block text-xs text-muted-foreground">{fmtDate(x.date)}{x.reference ? ` · ${x.reference}` : ""}</span></span><span className="tabular-nums font-medium">{fmtINR(x.amount)}</span></li>)}</ul>}
        </Panel>
      </div>

      {mode === "edit" && <PurchaseForm id={id} initial={data} onClose={() => setMode(null)} onSaved={reload} />}
      <Confirm open={mode === "cancel"} danger busy={busy} title="Cancel this purchase?" confirmLabel="Cancel purchase" onClose={() => setMode(null)}
        message="The stock it added will be removed. This fails if that stock has already been used."
        onConfirm={() => (reason.trim().length < 3 ? setErr("Please enter a reason") : run(() => api(`/api/purchases/${id}/cancel`, { body: { reason } }), "Purchase cancelled"))}>
        <Field label="Reason (required)"><textarea className={inputCls + " mt-2 h-20 py-2"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}
      </Confirm>
      <Modal open={mode === "pay"} onClose={() => setMode(null)} title="Record supplier payment" footer={<Button disabled={busy} onClick={() => run(() => api(`/api/purchases/${id}/payments`, { body: { amount: toPaise(amount), method, date, reference: reference || undefined } }), "Payment recorded")}>{busy && <Loader2 className="animate-spin" />}Save payment</Button>}>
        <div className="space-y-4">
          <Field label={`Amount ₹ (balance ${rupees(due)})`}><input className={inputCls} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></select></Field><Field label="Date"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
          <Field label="Reference"><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
