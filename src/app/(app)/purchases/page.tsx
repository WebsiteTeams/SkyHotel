"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Tag, Td, inputCls, statusTone } from "@/components/kit";
import { PurchaseForm } from "@/components/purchase-form";
import { fmtDate, isoDay, qs, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

export default function Purchases() {
  const [supplier, setSupplier] = useState(""), [paymentStatus, setPS] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 89 * 864e5))), [to, setTo] = useState(isoDay());
  const { data, error, loading, reload } = useApi<any>(`/api/purchases${qs({ supplier, paymentStatus, status, from, to, page })}`);
  const suppliers = useApi<any[]>("/api/suppliers");
  const [adding, setAdding] = useState(false);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title="Purchases" subtitle="Stock-in records. Confirming a purchase updates inventory automatically." actions={<Button onClick={() => setAdding(true)}><Plus />New purchase</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select className={inputCls} value={supplier} onChange={(e) => reset(setSupplier)(e.target.value)}><option value="">All suppliers</option>{suppliers.data?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
        <select className={inputCls} value={paymentStatus} onChange={(e) => reset(setPS)(e.target.value)}><option value="">All payments</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option></select>
        <select className={inputCls} value={status} onChange={(e) => reset(setStatus)(e.target.value)}><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select>
        <input className={inputCls} type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From" />
        <input className={inputCls} type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To" />
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : data?.items.length === 0 ? <Empty title="No purchases found" hint="Record a purchase to add stock." action={<Button onClick={() => setAdding(true)}>New purchase</Button>} /> : (
          <>
            <Table head={["Purchase", "Supplier", "Invoice", "Date", "Total", "Paid", "Payment", "Status"]}>
              {data?.items.map((p: any) => (
                <tr key={p._id} className="hover:bg-muted/40">
                  <Td className="whitespace-nowrap"><Link className="font-medium hover:text-primary" href={`/purchases/${p._id}`}>{p.purchaseNo}</Link></Td>
                  <Td>{p.supplier?.name}</Td><Td className="text-muted-foreground">{p.invoiceNo || "-"}</Td><Td className="whitespace-nowrap text-muted-foreground">{fmtDate(p.date)}</Td>
                  <Td className="tabular-nums">{fmtINR(p.total)}</Td><Td className="tabular-nums">{fmtINR(p.paidAmount)}</Td>
                  <Td><Tag tone={statusTone(p.paymentStatus) as any}>{p.paymentStatus}</Tag></Td><Td><Tag tone={statusTone(p.status) as any}>{p.status}</Tag></Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
      {adding && <PurchaseForm onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}
