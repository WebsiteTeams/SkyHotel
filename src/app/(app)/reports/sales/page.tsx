"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, ErrorBox, Loading, PageHeader, Panel, Stat, Table, Td, inputCls } from "@/components/kit";
import { DateFilter } from "@/components/report-bits";
import { downloadCSV, isoDay, qs, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

export default function SalesReport() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 864e5))), [to, setTo] = useState(isoDay()), [group, setGroup] = useState("day");
  const { data: d, error, loading, reload } = useApi<any>(`/api/reports/sales${qs({ from, to, group })}`);
  return (
    <>
      <PageHeader title="Sales report" subtitle="Bills, discounts, GST and payment breakdown" />
      <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo}
        extra={<select className={inputCls + " w-36"} value={group} onChange={(e) => setGroup(e.target.value)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select>}
        onCsv={() => d && downloadCSV("sales", d.series.map((s: any) => ({ Period: s.label, Orders: s.orders, Sales: (s.sales / 100).toFixed(2), GST: (s.gst / 100).toFixed(2), Discounts: (s.discounts / 100).toFixed(2) })))} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !d && <Loading rows={5} />}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Net sales (incl. GST)" value={fmtINR(d.revenue)} hint={`Gross ${fmtINR(d.gross)} · refunds ${fmtINR(d.refunds)}`} />
            <Stat label="Total bills" value={d.bills} hint={`Avg ${fmtINR(d.avgOrder)}`} />
            <Stat label="Cancelled bills" value={d.cancelledBills} hint={fmtINR(d.cancelledAmount)} tone={d.cancelledBills ? "warn" : undefined} />
            <Stat label="Discounts given" value={fmtINR(d.discounts)} />
            <Stat label="GST collected" value={fmtINR(d.gst)} /><Stat label="Taxable value" value={fmtINR(d.taxable)} />
            {d.payments.map((p: any) => <Stat key={p.method} label={`Paid via ${p.method}`} value={fmtINR(p.amount)} />)}
          </div>
          <Panel title="Sales trend">
            {d.series.length === 0 ? <Empty title="No sales in this range" /> : (
              <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.series.map((s: any) => ({ ...s, v: s.sales / 100 }))}>
                <CartesianGrid stroke="#e5e5e5" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#737373" /><YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#737373" width={56} />
                <Tooltip formatter={(v) => [fmtINR(Number(v) * 100), "Sales"]} contentStyle={{ borderRadius: 12, border: "1px solid #e5e5e5" }} /><Bar dataKey="v" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart></ResponsiveContainer></div>
            )}
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="By period">
              <Table head={["Period", "Orders", "Sales", "GST", "Discounts"]} className="-mx-4 -my-2">
                {d.series.map((s: any) => <tr key={s.label}><Td className="font-medium">{s.label}</Td><Td>{s.orders}</Td><Td className="tabular-nums">{fmtINR(s.sales)}</Td><Td className="tabular-nums">{fmtINR(s.gst)}</Td><Td className="tabular-nums">{fmtINR(s.discounts)}</Td></tr>)}
              </Table>
            </Panel>
            <Panel title="Top items">
              <Table head={["Item", "Qty", "Revenue"]} className="-mx-4 -my-2">
                {d.best.map((b: any) => <tr key={b._id}><Td className="font-medium">{b.name}</Td><Td>{b.qty}</Td><Td className="tabular-nums">{fmtINR(b.revenue)}</Td></tr>)}
              </Table>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
