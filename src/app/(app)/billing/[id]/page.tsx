"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, Loader2, Printer, RotateCcw, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, ErrorBox, Field, Loading, Modal, PageHeader, Panel, Table, Tag, Td, inputCls, rupees, statusTone, toPaise } from "@/components/kit";
import { Receipt, printReceipt, type Paper } from "@/components/receipt";
import { useCan } from "@/components/session";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

type Mode = "cancel" | "refund" | "pay" | "reqCancel" | "reqRefund" | null;

export default function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<any>(`/api/orders/${id}`);
  const can = useCan();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState(""), [amount, setAmount] = useState(""), [method, setMethod] = useState("cash"), [ref, setRef] = useState("");
  const [paper, setPaper] = useState<Paper | "">("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [mgr, setMgr] = useState({ email: "", pin: "" });

  if (loading && !data) return <Loading rows={6} />;
  if (error || !data) return <ErrorBox message={error ?? "Not found"} onRetry={reload} />;
  const { order: o, items, invoice, payments } = data;
  const cancelled = o.status === "cancelled";
  const due = o.grandTotal - o.paidAmount;
  const refundable = o.paidAmount - o.refundedAmount;
  const size: Paper = (paper || invoice.snapshot.paperSize || "80mm") as Paper;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr("");
    try { await fn(); toast.success(ok); setMode(null); setReason(""); setAmount(""); reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const open = (m: Mode) => { setErr(""); setReason(""); setMgr({ email: "", pin: "" }); setAmount(m === "pay" ? rupees(due) : m === "refund" || m === "reqRefund" ? rupees(refundable) : ""); setMode(m); };
  const sendRequest = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api<any>(`/api/orders/${id}/request`, { body: { type: mode === "reqCancel" ? "cancel_bill" : "refund", reason, ...(mode === "reqRefund" ? { amount: toPaise(amount), method } : {}), approval: mgr.email && mgr.pin ? { managerEmail: mgr.email.trim(), pin: mgr.pin } : undefined } });
      toast.success(r.executed ? "Approved by manager and processed" : "Request sent to a manager for approval");
      setMode(null); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Link href="/billing/history" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All bills</Link>
      <PageHeader title={o.orderNo} subtitle={`${fmtDateTime(o.createdAt)} · by ${o.createdBy?.name ?? "-"}`} actions={<>
        <Tag tone={statusTone(o.status) as any}>{o.status}</Tag><Tag tone={statusTone(o.paymentStatus) as any}>{o.paymentStatus}</Tag>
        {can("billing.reprint") && <Button variant="outline" onClick={async () => { await api(`/api/orders/${id}/reprint`, { method: "POST", body: {} }).catch(() => {}); printReceipt(size); }}><Printer />Print</Button>}
        {!cancelled && due > 0 && can("pos.use") && <Button variant="outline" onClick={() => open("pay")}><Banknote />Receive payment</Button>}
        {!cancelled && refundable > 0 && can("billing.refund") && <Button variant="outline" onClick={() => open("refund")}><RotateCcw />Refund</Button>}
        {!cancelled && can("billing.cancel") && <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => open("cancel")}><Ban />Cancel bill</Button>}
        {!cancelled && !can("billing.cancel") && <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => open("reqCancel")}><Ban />Request cancellation</Button>}
        {!cancelled && refundable > 0 && !can("billing.refund") && <Button variant="outline" onClick={() => open("reqRefund")}><RotateCcw />Request refund</Button>}
      </>} />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Panel title="Items">
            <Table head={["Item", "Qty", "Rate", "Discount", "GST", "Total"]} className="-mx-4 -my-2">
              {items.map((i: any) => (
                <tr key={i._id}>
                  <Td><p className="font-medium">{i.name}{i.variation && ` (${i.variation})`}</p>{i.addons?.length > 0 && <p className="text-xs text-muted-foreground">+ {i.addons.map((a: any) => a.name).join(", ")}</p>}{i.notes && <p className="text-xs italic text-muted-foreground">{i.notes}</p>}</Td>
                  <Td>{i.qty}</Td><Td className="tabular-nums">{fmtINR(i.unitPrice)}</Td><Td className="tabular-nums">{fmtINR(i.discount)}</Td><Td>{i.gstRate}%</Td><Td className="tabular-nums font-medium">{fmtINR(i.total)}</Td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Payments & refunds">
            {payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded.</p> : (
              <ul className="divide-y divide-border text-sm">
                {payments.map((p: any) => (
                  <li key={p._id} className="flex items-center justify-between py-2.5">
                    <span><span className="font-medium capitalize">{p.kind === "refund" ? "Refund" : "Payment"} · {p.method}</span><span className="block text-xs text-muted-foreground">{fmtDateTime(p.createdAt)} · {p.createdBy?.name}{p.reason ? ` · ${p.reason}` : ""}{p.reference ? ` · ${p.reference}` : ""}</span></span>
                    <span className={`tabular-nums font-medium ${p.kind === "refund" ? "text-red-600" : ""}`}>{p.kind === "refund" ? "-" : ""}{fmtINR(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {cancelled && <Panel title="Cancellation"><p className="text-sm">Cancelled {fmtDateTime(o.cancelledAt)} by {o.cancelledBy?.name}.</p><p className="mt-1 text-sm text-muted-foreground">Reason: {o.cancelReason}</p><p className="mt-1 text-xs text-muted-foreground">Ingredient stock for this bill was returned to inventory.</p></Panel>}
        </div>
        <div className="space-y-4">
          <Panel title="Summary">
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{fmtINR(o.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Discounts</dt><dd>-{fmtINR(o.itemDiscount + o.billDiscount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Taxable</dt><dd>{fmtINR(o.taxable)}</dd></div>
              {o.gstBreakup.map((b: any) => <div key={b.rate} className="flex justify-between"><dt className="text-muted-foreground">GST {b.rate}%</dt><dd>{fmtINR(b.gst)}</dd></div>)}
              <div className="flex justify-between"><dt className="text-muted-foreground">Round off</dt><dd>{(o.roundOff / 100).toFixed(2)}</dd></div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd>{fmtINR(o.grandTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd>{fmtINR(o.paidAmount)}</dd></div>
              {o.refundedAmount > 0 && <div className="flex justify-between text-red-600"><dt>Refunded</dt><dd>-{fmtINR(o.refundedAmount)}</dd></div>}
              {!cancelled && due > 0 && <div className="flex justify-between font-semibold text-orange-700"><dt>Balance due</dt><dd>{fmtINR(due)}</dd></div>}
            </dl>
          </Panel>
          <Panel title="Receipt" action={<select className="h-8 rounded-md border border-input bg-white px-2 text-xs" value={size} onChange={(e) => setPaper(e.target.value as Paper)}><option value="58mm">58mm</option><option value="80mm">80mm</option><option value="A4">A4</option></select>}>
            <div className="flex justify-center overflow-x-auto bg-neutral-100 p-3"><Receipt snapshot={invoice.snapshot} payments={payments} paper={size} status={o.status} /></div>
            <p className="mt-2 text-center text-xs text-muted-foreground">Printed {invoice.printCount} time(s)</p>
          </Panel>
        </div>
      </div>

      <Modal open={mode === "reqCancel" || mode === "reqRefund"} onClose={() => setMode(null)} title={mode === "reqCancel" ? "Request bill cancellation" : "Request refund"}
        footer={<Button disabled={busy || reason.trim().length < 3} onClick={sendRequest}>{busy && <Loader2 className="animate-spin" />}{mgr.email && mgr.pin ? "Send & approve now" : "Send for approval"}</Button>}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">A manager must approve this. Nothing changes on the bill until they do.</p>
          {mode === "reqRefund" && <div className="grid grid-cols-2 gap-2"><Field label={`Amount ₹ (max ${rupees(refundable)})`}><input className={inputCls} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Refund via"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></Field></div>}
          <Field label="Reason (required)"><textarea className={inputCls + " h-20 py-2"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-2 text-sm font-medium">Manager here now? (optional)</p>
            <div className="grid grid-cols-2 gap-2"><input className={inputCls} type="email" placeholder="Manager email" autoComplete="off" value={mgr.email} onChange={(e) => setMgr({ ...mgr, email: e.target.value })} /><input className={inputCls} type="password" inputMode="numeric" maxLength={6} placeholder="PIN" autoComplete="off" value={mgr.pin} onChange={(e) => setMgr({ ...mgr, pin: e.target.value.replace(/\D/g, "") })} /></div>
            <p className="mt-1 text-xs text-muted-foreground">Leave blank to send to the Approvals queue instead.</p>
          </div>
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </div>
      </Modal>

      <Confirm open={mode === "cancel"} danger busy={busy} title="Cancel this bill?" confirmLabel="Cancel bill" onClose={() => setMode(null)}
        message="Ingredient stock will be returned and any payments refunded. This cannot be undone."
        onConfirm={() => (reason.trim().length < 3 ? setErr("Please enter a reason") : run(() => api(`/api/orders/${id}/cancel`, { body: { reason } }), "Bill cancelled"))}>
        <Field label="Reason (required)"><textarea className={inputCls + " mt-2 h-20 py-2"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}
      </Confirm>

      <Modal open={mode === "refund" || mode === "pay"} onClose={() => setMode(null)} title={mode === "refund" ? "Refund payment" : "Receive payment"}
        footer={<Button disabled={busy} onClick={() => run(() => api(`/api/orders/${id}/${mode === "refund" ? "refund" : "payments"}`, { body: { amount: toPaise(amount), method, ...(mode === "refund" ? { reason } : { reference: ref || undefined }) } }), mode === "refund" ? "Refund recorded" : "Payment recorded")}>{busy && <Loader2 className="animate-spin" />}Confirm</Button>}>
        <div className="space-y-4">
          <Field label={`Amount (₹) — max ${rupees(mode === "refund" ? refundable : due)}`}><input className={inputCls} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></Field>
          {mode === "refund" ? <Field label="Reason (required)"><textarea className={inputCls + " h-20 py-2"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field> : <Field label="Reference"><input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
