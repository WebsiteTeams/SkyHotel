"use client";
import { useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Tag, Td, inputCls, statusTone } from "@/components/kit";
import { api, downloadCSV, fmtDateTime, isoDay, qs, useApi, useDebounced } from "@/lib/client";
import { fmtINR } from "@/lib/money";

export default function BillHistory() {
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [payment, setPayment] = useState(""), [page, setPage] = useState(1);
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 864e5))), [to, setTo] = useState(isoDay());
  const dq = useDebounced(q);
  const url = `/api/orders${qs({ q: dq, status, payment, from, to, page })}`;
  const { data, error, loading, reload } = useApi<any>(url);

  const exportCsv = async () => {
    const all = await api<any>(`/api/orders${qs({ q: dq, status, payment, from, to, limit: 100 })}`);
    downloadCSV("bills", all.items.map((o: any) => ({ Invoice: o.orderNo, Date: new Date(o.createdAt).toISOString(), Type: o.type, Table: o.table ?? "", Status: o.status, Payment: o.paymentStatus, Total: (o.grandTotal / 100).toFixed(2), Paid: (o.paidAmount / 100).toFixed(2), Refunded: (o.refundedAmount / 100).toFixed(2) })));
  };

  return (
    <>
      <PageHeader title="Bills" subtitle="Billing history, reprints and cancellations" actions={<Button variant="outline" onClick={exportCsv}><Download />Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-full flex-1 sm:min-w-60"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={inputCls + " pl-9"} placeholder="Search invoice, name or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className={inputCls + " w-[calc(50%-0.375rem)] sm:w-44"} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select>
        <select className={inputCls + " w-[calc(50%-0.375rem)] sm:w-44"} value={payment} onChange={(e) => { setPayment(e.target.value); setPage(1); }}><option value="">All payments</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option></select>
        <input className={inputCls + " w-[calc(50%-0.375rem)] sm:w-40"} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" />
        <input className={inputCls + " w-[calc(50%-0.375rem)] sm:w-40"} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" />
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : data?.items.length === 0 ? <Empty title="No bills found" hint="Try widening the date range or clearing filters." /> : (
          <>
            <Table head={["Invoice", "Date", "Type", "Total", "Paid", "Payment", "Status", ""]}>
              {data?.items.map((o: any) => (
                <tr key={o._id} className="hover:bg-muted/40">
                  <Td className="whitespace-nowrap font-medium">{o.orderNo}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(o.createdAt)}</Td>
                  <Td className="capitalize">{o.type.replace("_", " ")}{o.table ? ` · T${o.table}` : ""}</Td>
                  <Td className="tabular-nums">{fmtINR(o.grandTotal)}</Td>
                  <Td className="tabular-nums">{fmtINR(o.paidAmount - o.refundedAmount)}</Td>
                  <Td><Tag tone={statusTone(o.paymentStatus) as any}>{o.paymentStatus}</Tag></Td>
                  <Td><Tag tone={statusTone(o.status) as any}>{o.status}</Tag></Td>
                  <Td className="text-right"><Link className="text-sm font-medium text-primary" href={`/billing/${o._id}`}>View</Link></Td>
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
