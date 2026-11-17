"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Td, inputCls } from "@/components/kit";
import { ItemForm, blankItem, showQty, stockTag } from "@/components/inventory-bits";
import { useCan } from "@/components/session";
import { qs, useApi, useDebounced } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { unitFactor } from "@/lib/units";
import { cn } from "@/lib/utils";

function Inner() {
  const sp = useSearchParams();
  const can = useCan();
  const [q, setQ] = useState(""), [status, setStatus] = useState(sp.get("status") ?? ""), [category, setCategory] = useState(""), [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi<any>(`/api/inventory${qs({ q: dq, status, category, page })}`);
  const suppliers = useApi<any[]>(can("suppliers.manage") ? "/api/suppliers" : null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock on hand, minimum levels and valuation" actions={can("inventory.manage") && <Button onClick={() => setAdding(true)}><Plus />Add item</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={inputCls + " pl-9"} placeholder="Search name or SKU" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <div className="flex w-fit max-w-full overflow-x-auto rounded-lg border border-border bg-white p-1">
          {[["", "All"], ["ok", "In stock"], ["low", "Low"], ["out", "Out"]].map(([k, l]) => <button key={k} onClick={() => { setStatus(k); setPage(1); }} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", status === k ? "bg-primary text-white" : "text-neutral-600 hover:bg-muted")}>{l}</button>)}
        </div>
        <select className={inputCls + " w-44"} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{data?.categories?.map((c: string) => <option key={c}>{c}</option>)}</select>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : data?.items.length === 0 ? <Empty title="No inventory items" hint="Add ingredients and supplies to start tracking stock." action={can("inventory.manage") ? <Button onClick={() => setAdding(true)}>Add item</Button> : undefined} /> : (
          <>
            <Table head={["Item", "SKU", "Category", "In stock", "Minimum", "Avg cost", "Value", "Expiry", "Status"]}>
              {data?.items.map((i: any) => (
                <tr key={i._id} className="hover:bg-muted/40">
                  <Td><Link href={`/inventory/${i._id}`} className="font-medium hover:text-primary">{i.name}</Link></Td>
                  <Td className="text-muted-foreground">{i.sku}</Td><Td>{i.category}</Td>
                  <Td className="tabular-nums font-medium">{showQty(i.currentStock, i.unit)}</Td>
                  <Td className="tabular-nums text-muted-foreground">{showQty(i.minStock, i.unit)}</Td>
                  <Td className="tabular-nums">{fmtINR(Math.round(i.avgCost * unitFactor(i.unit)))}/{i.unit}</Td>
                  <Td className="tabular-nums">{fmtINR(Math.round(i.currentStock * i.avgCost))}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{i.expiryDate ? new Date(i.expiryDate).toLocaleDateString("en-IN") : "-"}</Td>
                  <Td>{stockTag(i)}</Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
      {adding && <ItemForm initial={blankItem} suppliers={suppliers.data ?? []} onClose={() => setAdding(false)} onSaved={reload} />}
      <datalist id="inv-cats">{data?.categories?.map((c: string) => <option key={c} value={c} />)}</datalist>
    </>
  );
}

export default function Inventory() {
  return <Suspense fallback={<Loading />}><Inner /></Suspense>;
}
