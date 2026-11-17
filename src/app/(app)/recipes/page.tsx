"use client";
import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, Modal, PageHeader, Table, Tag, Td, VegMark, inputCls } from "@/components/kit";
import { api, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { compatibleUnits, fromBase, toBase, unitFactor, type Unit } from "@/lib/units";

interface Row { item: string; quantity: string; unit: Unit }

export default function Recipes() {
  const { data, error, loading, reload } = useApi<any[]>("/api/recipes");
  const inv = useApi<any>("/api/inventory?all=1");
  const [q, setQ] = useState("");
  const [food, setFood] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ version?: number; has: boolean }>({ has: false });
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const items: any[] = inv.data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i._id, i])), [items]);

  const open = async (f: any) => {
    setFood(f); setErr(""); setRows([]);
    const r = await api<any>(`/api/recipes/${f._id}`);
    setMeta({ has: !!r.recipe, version: r.recipe?.version });
    setRows(r.ingredients.map((g: any) => ({ item: g.item._id, quantity: String(fromBase(g.quantityBase, g.unit)), unit: g.unit })));
  };
  const cost = rows.reduce((s, r) => { const it = byId.get(r.item); return it && Number(r.quantity) > 0 ? s + toBase(Number(r.quantity), r.unit) * it.avgCost : s; }, 0);
  const profit = food ? food.price - Math.round(cost) : 0;
  const short = rows.filter((r) => { const it = byId.get(r.item); return it && toBase(Number(r.quantity) || 0, r.unit) > it.currentStock; });

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await api(`/api/recipes/${food._id}`, { method: "PUT", body: { ingredients: rows.map((r) => ({ item: r.item, quantity: Number(r.quantity), unit: r.unit })) } });
      toast.success("Recipe saved"); setFood(null); reload();
    } catch (e: any) { setErr(e.fields ? Object.values(e.fields).join(", ") : e.message); } finally { setBusy(false); }
  };
  const list = (data ?? []).filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Recipes" subtitle="Ingredients per dish. Selling a dish deducts these automatically." />
      <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={inputCls + " pl-9"} placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : list.length === 0 ? <Empty title="No dishes" hint="Add food items first, then configure their recipes." /> : (
          <Table head={["Dish", "Selling price", "Recipe", "Ingredient cost", "Est. profit", ""]}>
            {list.map((f) => (
              <tr key={f._id} className="hover:bg-muted/40">
                <Td><span className="flex items-center gap-2 font-medium"><VegMark type={f.type} />{f.name}</span></Td>
                <Td className="tabular-nums">{fmtINR(f.price)}</Td>
                <Td>{f.hasRecipe ? <Tag tone="green">{f.ingredientCount} ingredients · v{f.version}</Tag> : <Tag tone="orange">No recipe</Tag>}</Td>
                <Td className="tabular-nums">{f.hasRecipe ? fmtINR(f.recipeCost) : "-"}</Td>
                <Td className={`tabular-nums font-medium ${f.hasRecipe && f.profit < 0 ? "text-red-600" : ""}`}>{f.hasRecipe ? `${fmtINR(f.profit)} (${f.price ? Math.round((f.profit / f.price) * 100) : 0}%)` : "-"}</Td>
                <Td className="text-right"><Button size="sm" variant="outline" onClick={() => open(f)}>{f.hasRecipe ? "Edit" : "Create"}</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <Modal wide open={!!food} onClose={() => setFood(null)} title={`Recipe · ${food?.name ?? ""}`}
        footer={<><Button variant="outline" onClick={() => setFood(null)}>Cancel</Button><Button disabled={busy || !rows.length} onClick={save}>{busy && <Loader2 className="animate-spin" />}Save recipe</Button></>}>
        {food && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Quantities are for <b>one</b> serving. Two orders deduct twice this amount. {meta.has && <>Editing creates version {(meta.version ?? 1) + 1}; past bills keep their original consumption.</>}</p>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const it = byId.get(r.item);
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
                    <select className={inputCls + " col-span-3 sm:col-span-1"} value={r.item} onChange={(e) => { const n = byId.get(e.target.value); setRows(rows.map((x, j) => (j === i ? { ...x, item: e.target.value, unit: (n?.baseUnit === "g" || n?.baseUnit === "ml" ? n.baseUnit : n?.unit) as Unit } : x))); }}>
                      <option value="">Select ingredient</option>{items.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                    </select>
                    <input className={inputCls} type="number" min="0" step="any" placeholder="Qty" value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                    <select className={inputCls} value={r.unit} disabled={!it} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, unit: e.target.value as Unit } : x)))}>{(it ? compatibleUnits(it.unit) : []).map((u) => <option key={u}>{u}</option>)}</select>
                    <button aria-label="Remove ingredient" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                    {it && Number(r.quantity) > 0 && <p className="col-span-3 -mt-1 pl-1 text-xs text-muted-foreground sm:col-span-4">Cost {fmtINR(Math.round(toBase(Number(r.quantity), r.unit) * it.avgCost))} · stock {fromBase(it.currentStock, it.unit)} {it.unit} @ {fmtINR(Math.round(it.avgCost * unitFactor(it.unit)))}/{it.unit}</p>}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={() => setRows([...rows, { item: "", quantity: "", unit: "g" }])}><Plus />Add ingredient</Button>
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-secondary p-4 text-center">
              <div><p className="text-xs text-muted-foreground">Selling price</p><p className="font-semibold tabular-nums">{fmtINR(food.price)}</p></div>
              <div><p className="text-xs text-muted-foreground">Preparation cost</p><p className="font-semibold tabular-nums">{fmtINR(Math.round(cost))}</p></div>
              <div><p className="text-xs text-muted-foreground">Estimated profit</p><p className={`font-semibold tabular-nums ${profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmtINR(profit)}</p></div>
            </div>
            {short.length > 0 && <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">Not enough stock for one serving of: {short.map((r) => byId.get(r.item)?.name).join(", ")}. Orders will be blocked until restocked.</p>}
            {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
