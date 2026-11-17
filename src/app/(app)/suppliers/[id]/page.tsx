"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ErrorBox, Loading, PageHeader, Panel, Stat, Table, Tag, Td, statusTone } from "@/components/kit";
import { fmtDate, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

export default function SupplierDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<any>(`/api/suppliers/${id}`);
  if (loading && !data) return <Loading rows={5} />;
  if (error || !data) return <ErrorBox message={error ?? "Not found"} onRetry={reload} />;
  const { supplier: s, purchases, payments } = data;
  return (
    <>
      <Link href="/suppliers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Suppliers</Link>
      <PageHeader title={s.name} subtitle={[s.company, s.phone, s.email, s.gstin && `GSTIN ${s.gstin}`].filter(Boolean).join(" · ")} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total purchases" value={fmtINR(data.totalPurchases)} /><Stat label="Outstanding" value={fmtINR(data.outstanding)} tone={data.outstanding > 0 ? "warn" : undefined} /><Stat label="Purchase orders" value={purchases.filter((p: any) => p.status === "confirmed").length} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Purchase history">
          {purchases.length === 0 ? <p className="text-sm text-muted-foreground">No purchases yet.</p> : (
            <Table head={["No.", "Date", "Total", "Status"]} className="-mx-4 -my-2">
              {purchases.map((p: any) => <tr key={p._id}><Td><Link className="font-medium hover:text-primary" href={`/purchases/${p._id}`}>{p.purchaseNo}</Link></Td><Td className="text-muted-foreground">{fmtDate(p.date)}</Td><Td className="tabular-nums">{fmtINR(p.total)}</Td><Td><Tag tone={statusTone(p.status === "cancelled" ? "cancelled" : p.paymentStatus) as any}>{p.status === "cancelled" ? "cancelled" : p.paymentStatus}</Tag></Td></tr>)}
            </Table>
          )}
        </Panel>
        <Panel title="Payment history">
          {payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded.</p> : (
            <Table head={["Date", "Purchase", "Method", "Amount"]} className="-mx-4 -my-2">
              {payments.map((p: any, i: number) => <tr key={i}><Td className="text-muted-foreground">{fmtDate(p.date)}</Td><Td>{p.purchaseNo}</Td><Td className="capitalize">{p.method}</Td><Td className="tabular-nums">{fmtINR(p.amount)}</Td></tr>)}
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
