"use client";
import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputCls, rupees, toPaise } from "@/components/kit";
import { ImageUpload } from "@/components/image-upload";
import { api, isoDay, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { compatibleUnits, type Unit } from "@/lib/units";

interface Row { item: string; quantity: string; unit: Unit; rate: string; expiryDate: string }

/** Create or edit a purchase. Totals are previewed here; the server recomputes and validates everything. */
export function PurchaseForm({ id, initial, onClose, onSaved }: { id?: string; initial?: any; onClose: () => void; onSaved: (p: any) => void }) {
  const suppliers = useApi<any[]>("/api/suppliers");
  const inv = useApi<any>("/api/inventory?all=1");
  const items: any[] = inv.data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i._id, i])), [items]);
  const [f, setF] = useState({
    supplier: initial?.purchase.supplier?._id ?? "", invoiceNo: initial?.purchase.invoiceNo ?? "", date: initial ? initial.purchase.date.slice(0, 10) : isoDay(),
    discount: initial ? rupees(initial.purchase.discount) : "", tax: initial ? rupees(initial.purchase.tax) : "", charges: initial ? rupees(initial.purchase.charges) : "",
    paid: initial ? rupees(initial.purchase.paidAmount) : "", method: "cash", attachment: initial?.purchase.attachment ?? "", notes: initial?.purchase.notes ?? "",
  });
  const [rows, setRows] = useState<Row[]>(initial ? initial.items.map((i: any) => ({ item: i.item, quantity: String(i.quantity), unit: i.unit, rate: rupees(i.rate), expiryDate: i.expiryDate?.slice(0, 10) ?? "" })) : [{ item: "", quantity: "", unit: "kg", rate: "", expiryDate: "" }]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const setRow = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const subtotal = rows.reduce((s, r) => s + Math.round(Number(r.quantity || 0) * toPaise(r.rate)), 0);
  const total = subtotal - toPaise(f.discount) + toPaise(f.tax) + toPaise(f.charges);

  const save = async () => {
    setBusy(true); setErrs({});
    try {
      const p = await api(id ? `/api/purchases/${id}` : "/api/purchases", { method: id ? "PUT" : "POST", body: {
        supplier: f.supplier, invoiceNo: f.invoiceNo || undefined, date: f.date, discount: toPaise(f.discount), tax: toPaise(f.tax), charges: toPaise(f.charges),
        paidAmount: toPaise(f.paid), method: f.method, attachment: f.attachment || undefined, notes: f.notes || undefined,
        items: rows.map((r) => ({ item: r.item, quantity: Number(r.quantity), unit: r.unit, rate: toPaise(r.rate), expiryDate: r.expiryDate || undefined })),
      } });
      toast.success(id ? "Purchase updated" : "Purchase recorded, stock updated"); onSaved(p); onClose();
    } catch (e: any) { setErrs(e.fields ?? {}); toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal wide open onClose={onClose} title={id ? "Edit purchase" : "New purchase"} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy && <Loader2 className="animate-spin" />}{id ? "Save changes" : "Confirm purchase"}</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier" error={errs.supplier}><select className={inputCls} value={f.supplier} onChange={(e) => set("supplier", e.target.value)}><option value="">Select supplier</option>{suppliers.data?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
          <Field label="Invoice number"><input className={inputCls} value={f.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} /></Field>
          <Field label="Purchase date" error={errs.date}><input className={inputCls} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Items {errs.items && <span className="text-red-600">· {errs.items}</span>}</p>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const it = byId.get(r.item);
              return (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1.6fr_90px_90px_110px_140px_auto]">
                  <select className={inputCls + " col-span-2 sm:col-span-1"} value={r.item} onChange={(e) => { const n = byId.get(e.target.value); setRow(i, { item: e.target.value, unit: n?.unit ?? "kg", rate: n ? rupees(n.purchasePrice) : "" }); }}><option value="">Select item</option>{items.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
                  <input className={inputCls} type="number" min="0" step="any" placeholder="Qty" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
                  <select className={inputCls} value={r.unit} disabled={!it} onChange={(e) => setRow(i, { unit: e.target.value as Unit })}>{(it ? compatibleUnits(it.unit) : [r.unit]).map((u) => <option key={u}>{u}</option>)}</select>
                  <input className={inputCls} type="number" min="0" step="0.01" placeholder={`₹ / ${r.unit}`} value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} />
                  <input className={inputCls} type="date" title="Expiry date (optional)" value={r.expiryDate} onChange={(e) => setRow(i, { expiryDate: e.target.value })} />
                  <button aria-label="Remove item" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  {errs[`items.${i}.item`] && <p className="col-span-full text-xs text-red-600">{errs[`items.${i}.item`]}</p>}
                </div>
              );
            })}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setRows([...rows, { item: "", quantity: "", unit: "kg", rate: "", expiryDate: "" }])}><Plus />Add item</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Discount ₹"><input className={inputCls} type="number" min="0" step="0.01" value={f.discount} onChange={(e) => set("discount", e.target.value)} /></Field>
              <Field label="Tax ₹"><input className={inputCls} type="number" min="0" step="0.01" value={f.tax} onChange={(e) => set("tax", e.target.value)} /></Field>
              <Field label="Other charges ₹"><input className={inputCls} type="number" min="0" step="0.01" value={f.charges} onChange={(e) => set("charges", e.target.value)} /></Field>
            </div>
            {!id && <div className="grid grid-cols-2 gap-2">
              <Field label="Paid now ₹" error={errs.paidAmount}><input className={inputCls} type="number" min="0" step="0.01" value={f.paid} onChange={(e) => set("paid", e.target.value)} /></Field>
              <Field label="Method"><select className={inputCls} value={f.method} onChange={(e) => set("method", e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></select></Field>
            </div>}
            <Field label="Notes"><input className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
            <div><p className="mb-1.5 text-sm font-medium">Invoice document</p><ImageUpload value={f.attachment} onChange={(u) => set("attachment", u)} label="Attach invoice" accept="image/png,image/jpeg,image/webp,application/pdf" /></div>
          </div>
          <div className="space-y-2 self-start rounded-xl bg-secondary p-4 text-sm tabular-nums">
            <div className="flex justify-between"><span>Subtotal</span><span>{fmtINR(subtotal)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>-{fmtINR(toPaise(f.discount))}</span></div>
            <div className="flex justify-between"><span>Tax + charges</span><span>{fmtINR(toPaise(f.tax) + toPaise(f.charges))}</span></div>
            <div className="flex justify-between border-t border-orange-200 pt-2 text-base font-semibold"><span>Total</span><span>{fmtINR(total)}</span></div>
            {!id && <div className="flex justify-between text-muted-foreground"><span>Balance</span><span>{fmtINR(total - toPaise(f.paid))}</span></div>}
            {id && <p className="text-xs text-muted-foreground">Editing reverses the old stock-in and applies the new one. Both appear in the movement ledger.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
