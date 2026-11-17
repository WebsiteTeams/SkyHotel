"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Modal, Tag, inputCls, toPaise } from "@/components/kit";
import { api } from "@/lib/client";
import { UNITS, fromBase, type Unit } from "@/lib/units";

export const stockTag = (i: any) => (i.currentStock <= 0 ? <Tag tone="red">Out of stock</Tag> : i.currentStock <= i.minStock ? <Tag tone="orange">Low</Tag> : <Tag tone="green">In stock</Tag>);
export const showQty = (base: number, unit: Unit) => `${fromBase(base, unit)} ${unit}`;

export const blankItem = { name: "", sku: "", category: "General", unit: "kg", openingStock: "", minStock: "", purchasePrice: "", supplier: "", expiryDate: "", location: "", description: "" };

export function ItemForm({ initial, id, onClose, onSaved, suppliers }: { initial: any; id?: string; onClose: () => void; onSaved: () => void; suppliers: any[] }) {
  const [f, setF] = useState<any>(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErrs({});
    try {
      await api(id ? `/api/inventory/${id}` : "/api/inventory", { method: id ? "PUT" : "POST", body: { name: f.name, sku: f.sku, category: f.category || "General", unit: f.unit, openingStock: Number(f.openingStock || 0), minStock: Number(f.minStock || 0), purchasePrice: toPaise(f.purchasePrice), supplier: f.supplier || undefined, expiryDate: f.expiryDate || undefined, location: f.location, description: f.description } });
      toast.success("Inventory item saved"); onSaved(); onClose();
    } catch (e: any) { setErrs(e.fields ?? {}); toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal wide open onClose={onClose} title={id ? "Edit inventory item" : "Add inventory item"} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy && <Loader2 className="animate-spin" />}Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" error={errs.name}><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="SKU / code" error={errs.sku}><input className={inputCls} value={f.sku} onChange={(e) => set("sku", e.target.value)} /></Field>
        <Field label="Category"><input className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)} list="inv-cats" /></Field>
        <Field label="Unit" hint={id ? "Can only change within the same family (kg↔g, L↔ml)" : "Stock is tracked internally in g / ml / count"}><select className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        {!id && <Field label={`Opening stock (${f.unit})`} error={errs.openingStock}><input className={inputCls} type="number" min="0" step="any" value={f.openingStock} onChange={(e) => set("openingStock", e.target.value)} /></Field>}
        <Field label={`Minimum stock (${f.unit})`} error={errs.minStock}><input className={inputCls} type="number" min="0" step="any" value={f.minStock} onChange={(e) => set("minStock", e.target.value)} /></Field>
        <Field label={`Purchase price (₹ per ${f.unit})`} error={errs.purchasePrice}><input className={inputCls} type="number" min="0" step="0.01" value={f.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} /></Field>
        <Field label="Supplier"><select className={inputCls} value={f.supplier} onChange={(e) => set("supplier", e.target.value)}><option value="">None</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
        <Field label="Expiry date"><input className={inputCls} type="date" value={f.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></Field>
        <Field label="Storage location"><input className={inputCls} value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea className={inputCls + " h-16 py-2"} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}


export const MOVE_LABEL: Record<string, string> = { opening: "Opening stock", purchase: "Purchase", purchase_cancel: "Purchase cancelled", consumption: "Consumed (sale)", consumption_reversal: "Sale reversed", manual_in: "Manual stock in", manual_out: "Manual stock out", damage: "Damaged", expired: "Expired", wastage: "Wastage" };
