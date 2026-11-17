"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Table, Tag, Td, Toggle, VegMark, inputCls, rupees, toPaise } from "@/components/kit";
import { ImageUpload } from "@/components/image-upload";
import { useCan } from "@/components/session";
import { api, qs, useApi, useDebounced } from "@/lib/client";
import { fmtINR } from "@/lib/money";

const blank = { name: "", image: "", category: "", description: "", price: "", cost: "", type: "veg", available: true, gstRate: "5", unit: "plate", prepNotes: "", variations: [] as any[], addons: [] as any[] };

export default function FoodItems() {
  const canManage = useCan()("catalog.manage");
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi<any>(`/api/food-items${qs({ q: dq, category: cat, page })}`);
  const cats = useApi<any[]>("/api/categories");
  const [form, setForm] = useState<any>(null);
  const [id, setId] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<any>(null);

  const openNew = () => { setId(null); setErrs({}); setForm({ ...blank, category: cats.data?.[0]?._id ?? "" }); };
  const openEdit = (f: any) => {
    setId(f._id); setErrs({});
    setForm({ ...f, category: f.category?._id ?? f.category, price: rupees(f.price), cost: rupees(f.cost), gstRate: String(f.gstRate),
      variations: f.variations.map((v: any) => ({ name: v.name, price: rupees(v.price) })), addons: f.addons.map((v: any) => ({ name: v.name, price: rupees(v.price) })) });
  };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setErrs({});
    const body = { name: form.name, image: form.image, category: form.category, description: form.description, price: toPaise(form.price), cost: toPaise(form.cost),
      type: form.type, available: form.available, gstRate: Number(form.gstRate), unit: form.unit, prepNotes: form.prepNotes,
      variations: form.variations.map((v: any) => ({ name: v.name, price: toPaise(v.price) })), addons: form.addons.map((v: any) => ({ name: v.name, price: toPaise(v.price) })) };
    try {
      await api(id ? `/api/food-items/${id}` : "/api/food-items", { method: id ? "PUT" : "POST", body });
      toast.success("Food item saved"); setForm(null); reload();
    } catch (e: any) { setErrs(e.fields ?? {}); toast.error(e.message); } finally { setBusy(false); }
  };

  const optionEditor = (k: "variations" | "addons", title: string, hint: string) => (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-medium">{title}</span><button type="button" className="text-xs font-medium text-primary" onClick={() => set(k, [...form[k], { name: "", price: "" }])}>+ Add</button></div>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <div className="space-y-2">
        {form[k].map((o: any, i: number) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} placeholder="Name" value={o.name} onChange={(e) => set(k, form[k].map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className={inputCls + " w-28"} type="number" min="0" step="0.01" placeholder="₹" value={o.price} onChange={(e) => set(k, form[k].map((x: any, j: number) => (j === i ? { ...x, price: e.target.value } : x)))} />
            <button type="button" aria-label="Remove" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => set(k, form[k].filter((_: any, j: number) => j !== i))}><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Food items" subtitle={canManage ? "Your sellable menu with prices, GST and add-ons" : "Menu prices (view only)"} actions={canManage && <Button onClick={openNew} disabled={!cats.data?.length}><Plus />Add food item</Button>} />
      {cats.data && !cats.data.length && <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">Create a category first, then add food items.</div>}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={inputCls + " pl-9"} placeholder="Search food items" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className={inputCls + " w-48"} value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}><option value="">All categories</option>{cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : data?.items.length === 0 ? <Empty title="No food items found" hint="Add your first menu item to start billing." /> : (
          <>
            <Table head={["Item", "Category", "Price", "GST", "Options", "Status", ""]}>
              {data?.items.map((f: any) => (
                <tr key={f._id} className="hover:bg-muted/40">
                  <Td><div className="flex items-center gap-3"><div className="size-10 shrink-0 overflow-hidden rounded-lg bg-secondary">{f.image && <img src={f.image} alt="" className="size-full object-cover" />}</div><div><div className="flex items-center gap-1.5 font-medium"><VegMark type={f.type} />{f.name}</div></div></div></Td>
                  <Td>{f.category?.name}</Td>
                  <Td className="tabular-nums">{fmtINR(f.price)}</Td>
                  <Td>{f.gstRate}%</Td>
                  <Td className="text-xs text-muted-foreground">{f.variations.length} variations · {f.addons.length} add-ons</Td>
                  <Td>{f.available ? <Tag tone="green">Available</Tag> : <Tag tone="red">Unavailable</Tag>}</Td>
                  <Td className="text-right">{canManage && <><button aria-label="Edit" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => openEdit(f)}><Pencil className="size-4" /></button><button aria-label="Delete" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => setDel(f)}><Trash2 className="size-4" /></button></>}</Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      <Modal wide open={!!form} onClose={() => setForm(null)} title={id ? "Edit food item" : "Add food item"}
        footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><ImageUpload value={form.image} onChange={(u) => set("image", u)} /></div>
            <Field label="Name" error={errs.name}><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Category" error={errs.category}><select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>{cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
            <Field label="Selling price (₹)" error={errs.price}><input className={inputCls} type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
            <Field label="Purchase cost (₹)" hint="Used for profit only when no recipe is set" error={errs.cost}><input className={inputCls} type="number" min="0" step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} /></Field>
            <Field label="Type"><select className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}><option value="veg">Veg</option><option value="non_veg">Non-Veg</option><option value="egg">Egg</option></select></Field>
            <Field label="GST rate (%)" error={errs.gstRate}><select className={inputCls} value={form.gstRate} onChange={(e) => set("gstRate", e.target.value)}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
            <Field label="Unit"><input className={inputCls} value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="plate, cup, glass" /></Field>
            <div className="flex items-end"><div className="w-full"><Toggle label="Available for sale" checked={form.available} onChange={(v) => set("available", v)} /></div></div>
            <Field label="Description" className="sm:col-span-2"><textarea className={inputCls + " h-16 py-2"} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="Preparation notes" className="sm:col-span-2"><textarea className={inputCls + " h-16 py-2"} value={form.prepNotes} onChange={(e) => set("prepNotes", e.target.value)} /></Field>
            <div className="sm:col-span-1">{optionEditor("variations", "Variations", "e.g. Half / Full. The price replaces the base price.")}</div>
            <div className="sm:col-span-1">{optionEditor("addons", "Add-ons", "e.g. Extra egg. The price is added on top.")}</div>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} danger busy={busy} title="Delete food item?" message={`"${del?.name}" will be removed from the menu. Past bills are unaffected.`} confirmLabel="Delete" onClose={() => setDel(null)}
        onConfirm={async () => { setBusy(true); try { await api(`/api/food-items/${del._id}`, { method: "DELETE" }); toast.success("Deleted"); setDel(null); reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }} />
    </>
  );
}
