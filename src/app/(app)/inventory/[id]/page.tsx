"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MinusCircle, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, ErrorBox, Field, Loading, Modal, PageHeader, Panel, Stat, Table, Td, inputCls, rupees } from "@/components/kit";
import { ItemForm, MOVE_LABEL, showQty, stockTag } from "@/components/inventory-bits";
import { useCan } from "@/components/session";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { compatibleUnits, fromBase, unitFactor, type Unit } from "@/lib/units";


export default function InventoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const can = useCan();
  const { data, error, loading, reload } = useApi<any>(`/api/inventory/${id}`);
  const suppliers = useApi<any[]>(can("suppliers.manage") ? "/api/suppliers" : null);
  const [edit, setEdit] = useState(false), [del, setDel] = useState(false);
  const [adj, setAdj] = useState<null | "in" | "out">(null);
  const [f, setF] = useState({ quantity: "", unit: "", reason: "manual", note: "" });
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");

  if (loading && !data) return <Loading rows={6} />;
  if (error || !data) return <ErrorBox message={error ?? "Not found"} onRetry={reload} />;
  const { item: i, movements } = data;
  const unit = i.unit as Unit;

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await api(`/api/inventory/${id}/stock`, { body: { direction: adj, reason: adj === "in" ? "manual" : f.reason, quantity: Number(f.quantity), unit: f.unit || unit, note: f.note } });
      toast.success("Stock updated"); setAdj(null); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Inventory</Link>
      <PageHeader title={i.name} subtitle={`${i.sku} · ${i.category}`} actions={can("inventory.manage") && <>
        <Button variant="outline" onClick={() => { setF({ quantity: "", unit, reason: "manual", note: "" }); setErr(""); setAdj("in"); }}><PlusCircle />Stock in</Button>
        <Button variant="outline" onClick={() => { setF({ quantity: "", unit, reason: "manual", note: "" }); setErr(""); setAdj("out"); }}><MinusCircle />Stock out</Button>
        <Button variant="outline" onClick={() => setEdit(true)}><Pencil />Edit</Button>
        <Button variant="outline" className="text-red-600" onClick={() => setDel(true)}><Trash2 />Delete</Button></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current stock" value={showQty(i.currentStock, unit)} hint={`Min ${showQty(i.minStock, unit)}`} tone={i.currentStock <= 0 ? "danger" : i.currentStock <= i.minStock ? "warn" : undefined} />
        <Stat label="Average cost" value={`${fmtINR(Math.round(i.avgCost * unitFactor(unit)))}/${unit}`} hint={`Last price ${fmtINR(i.purchasePrice)}`} />
        <Stat label="Stock value" value={fmtINR(Math.round(i.currentStock * i.avgCost))} />
        <Stat label="Status" value={stockTag(i)} hint={i.expiryDate ? `Expires ${new Date(i.expiryDate).toLocaleDateString("en-IN")}` : "No expiry set"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Panel title="Stock movement history" action={<Link className="text-xs font-medium text-primary" href={`/inventory/movements?item=${id}`}>Open ledger</Link>}>
          {movements.length === 0 ? <p className="text-sm text-muted-foreground">No movements yet.</p> : (
            <Table head={["When", "Type", "Change", "Balance", "Reference", "By"]} className="-mx-4 -my-2">
              {movements.map((m: any) => (
                <tr key={m._id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(m.createdAt)}</Td>
                  <Td>{MOVE_LABEL[m.type] ?? m.type}{m.reason && <span className="block text-xs text-muted-foreground">{m.reason}</span>}</Td>
                  <Td className={`tabular-nums font-medium ${m.qty < 0 ? "text-red-600" : "text-emerald-700"}`}>{m.qty > 0 ? "+" : ""}{fromBase(m.qty, unit)} {unit}</Td>
                  <Td className="tabular-nums">{fromBase(m.balanceAfter, unit)} {unit}</Td>
                  <Td className="text-muted-foreground">{m.refNo ?? "-"}</Td><Td className="text-muted-foreground">{m.createdBy?.name ?? "System"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="Details">
          <dl className="space-y-2 text-sm">
            {[["Supplier", i.supplier?.name ?? "-"], ["Location", i.location || "-"], ["Opening stock", showQty(i.openingStock, unit)], ["Unit", unit], ["Description", i.description || "-"]].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>)}
          </dl>
        </Panel>
      </div>

      {edit && <ItemForm id={id} suppliers={suppliers.data ?? []} onClose={() => setEdit(false)} onSaved={reload}
        initial={{ name: i.name, sku: i.sku, category: i.category, unit: i.unit, openingStock: "", minStock: String(fromBase(i.minStock, unit)), purchasePrice: rupees(i.purchasePrice), supplier: i.supplier?._id ?? "", expiryDate: i.expiryDate?.slice(0, 10) ?? "", location: i.location, description: i.description }} />}

      <Modal open={!!adj} onClose={() => setAdj(null)} title={adj === "in" ? "Add stock" : "Reduce stock"} footer={<Button disabled={busy} onClick={submit}>{busy && <Loader2 className="animate-spin" />}Save movement</Button>}>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <Field label="Quantity"><input className={inputCls} type="number" min="0" step="any" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
            <Field label="Unit"><select className={inputCls} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{compatibleUnits(unit).map((u) => <option key={u}>{u}</option>)}</select></Field>
          </div>
          {adj === "out" && <Field label="Reason"><select className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}><option value="manual">Manual deduction</option><option value="damage">Damaged</option><option value="expired">Expired</option><option value="wastage">Wastage</option></select></Field>}
          <Field label="Note (required)"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={adj === "in" ? "e.g. Found during stock count" : "e.g. Spilled in kitchen"} /></Field>
          <p className="text-xs text-muted-foreground">Stock can never go below zero. This creates an auditable movement record.</p>
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </div>
      </Modal>
      <Confirm open={del} danger title="Delete item?" message="The item is hidden from lists but its movement history is kept. Items used in recipes cannot be deleted." confirmLabel="Delete" onClose={() => setDel(false)}
        onConfirm={async () => { try { await api(`/api/inventory/${id}`, { method: "DELETE" }); toast.success("Item deleted"); router.replace("/inventory"); } catch (e: any) { toast.error(e.message); setDel(false); } }} />
    </>
  );
}
