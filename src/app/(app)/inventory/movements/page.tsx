"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Td, inputCls } from "@/components/kit";
import { MOVE_LABEL } from "@/components/inventory-bits";
import { api, downloadCSV, fmtDateTime, isoDay, qs, useApi } from "@/lib/client";

function Inner() {
  const sp = useSearchParams();
  const [type, setType] = useState(""), [page, setPage] = useState(1);
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 864e5))), [to, setTo] = useState(isoDay());
  const item = sp.get("item") ?? "";
  const { data, error, loading, reload } = useApi<any>(`/api/inventory/movements${qs({ type, item, from, to, page })}`);

  const exportCsv = async () => {
    const all = await api<any>(`/api/inventory/movements${qs({ type, item, from, to, limit: 100 })}`);
    downloadCSV("stock-movements", all.items.map((m: any) => ({ Date: new Date(m.createdAt).toISOString(), Item: m.item?.name, SKU: m.item?.sku, Type: m.type, Change_base: m.qty, Unit: m.item?.baseUnit, Balance_base: m.balanceAfter, Reference: m.refNo ?? "", Reason: m.reason ?? "", By: m.createdBy?.name ?? "System" })));
  };
  return (
    <>
      <PageHeader title="Stock movements" subtitle="Append-only ledger. Every stock change is recorded here." actions={<Button variant="outline" onClick={exportCsv}><Download />Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <select className={inputCls + " w-52"} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All movement types</option>{Object.entries(MOVE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className={inputCls + " w-40"} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" />
        <input className={inputCls + " w-40"} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" />
        {item && <Link href="/inventory/movements" className="self-center text-sm text-primary">Clear item filter</Link>}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : data?.items.length === 0 ? <Empty title="No movements in this range" /> : (
          <>
            <Table head={["When", "Item", "Type", "Change", "Balance", "Reference", "Reason", "By"]}>
              {data?.items.map((m: any) => (
                <tr key={m._id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(m.createdAt)}</Td>
                  <Td className="font-medium">{m.item?.name}</Td><Td>{MOVE_LABEL[m.type] ?? m.type}</Td>
                  <Td className={`tabular-nums font-medium ${m.qty < 0 ? "text-red-600" : "text-emerald-700"}`}>{m.qty > 0 ? "+" : ""}{m.qty} {m.item?.baseUnit}</Td>
                  <Td className="tabular-nums">{m.balanceAfter} {m.item?.baseUnit}</Td>
                  <Td className="text-muted-foreground">{m.refNo ?? "-"}</Td><Td className="max-w-48 truncate text-muted-foreground">{m.reason ?? "-"}</Td><Td className="text-muted-foreground">{m.createdBy?.name ?? "System"}</Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
    </>
  );
}
export default function Movements() { return <Suspense fallback={<Loading />}><Inner /></Suspense>; }
