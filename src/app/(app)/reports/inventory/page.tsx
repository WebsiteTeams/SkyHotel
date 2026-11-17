"use client";
import { useState } from "react";
import { ErrorBox, Loading, PageHeader, Panel, Stat, Table, Tag, Td, Empty } from "@/components/kit";
import { DateFilter } from "@/components/report-bits";
import { MOVE_LABEL, stockTag } from "@/components/inventory-bits";
import { downloadCSV, fmtDate, fmtDateTime, isoDay, qs, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { fromBase, unitFactor, type Unit } from "@/lib/units";
import { cn } from "@/lib/utils";

const TABS = [["stock", "Current stock"], ["consumption", "Consumption"], ["purchases", "Purchases"], ["wastage", "Wastage"], ["low", "Low stock"], ["expired", "Expired"]] as const;
const q = (base: number, u: Unit) => `${fromBase(base, u)} ${u}`;

export default function InventoryReport() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 864e5))), [to, setTo] = useState(isoDay());
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("stock");
  const { data: d, error, loading, reload } = useApi<any>(`/api/reports/inventory${qs({ from, to })}`);

  const csv = () => {
    if (!d) return;
    const map: Record<string, any[]> = {
      stock: d.items.map((i: any) => ({ Item: i.name, SKU: i.sku, Stock: q(i.currentStock, i.unit), Min: q(i.minStock, i.unit), Value: (i.value / 100).toFixed(2) })),
      consumption: d.consumption.map((c: any) => ({ Item: c.name, Quantity: c.qty, Unit: c.unit, Cost: (c.cost / 100).toFixed(2) })),
      purchases: d.purchases.map((p: any) => ({ Purchase: p.purchaseNo, Supplier: p.supplier?.name, Date: p.date.slice(0, 10), Total: (p.total / 100).toFixed(2), Status: p.status })),
      wastage: d.wastage.map((w: any) => ({ Date: w.createdAt, Item: w.name, Type: w.type, Quantity: w.qty, Unit: w.unit, Cost: (w.cost / 100).toFixed(2), Reason: w.reason })),
      low: d.low.map((i: any) => ({ Item: i.name, Stock: q(i.currentStock, i.unit), Min: q(i.minStock, i.unit) })),
      expired: d.expired.map((i: any) => ({ Item: i.name, Expiry: i.expiryDate?.slice(0, 10), Stock: q(i.currentStock, i.unit) })),
    };
    downloadCSV(`inventory-${tab}`, map[tab]);
  };

  return (
    <>
      <PageHeader title="Inventory report" subtitle="Stock, consumption, wastage and valuation" />
      <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onCsv={csv} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !d && <Loading rows={5} />}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Stock valuation" value={fmtINR(d.valuation)} hint="at weighted-average cost" /><Stat label="Items tracked" value={d.items.length} />
            <Stat label="Low stock" value={d.low.length} tone={d.low.length ? "warn" : undefined} /><Stat label="Expired with stock" value={d.expired.length} tone={d.expired.length ? "danger" : undefined} />
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", tab === k ? "border-primary bg-secondary text-orange-700" : "border-border bg-white")}>{l}</button>)}</div>
          <Panel title={TABS.find((t) => t[0] === tab)![1]}>
            {tab === "stock" && <Table head={["Item", "SKU", "Stock", "Minimum", "Avg cost", "Value", "Status"]} className="-mx-4 -my-2">{d.items.map((i: any) => <tr key={i._id}><Td className="font-medium">{i.name}</Td><Td className="text-muted-foreground">{i.sku}</Td><Td className="tabular-nums">{q(i.currentStock, i.unit)}</Td><Td className="tabular-nums text-muted-foreground">{q(i.minStock, i.unit)}</Td><Td className="tabular-nums">{fmtINR(Math.round(i.avgCost * unitFactor(i.unit)))}/{i.unit}</Td><Td className="tabular-nums">{fmtINR(i.value)}</Td><Td>{stockTag(i)}</Td></tr>)}</Table>}
            {tab === "consumption" && (d.consumption.length ? <Table head={["Ingredient", "Consumed", "Cost"]} className="-mx-4 -my-2">{d.consumption.map((c: any) => <tr key={c._id}><Td className="font-medium">{c.name}</Td><Td className="tabular-nums">{c.qty} {c.unit}</Td><Td className="tabular-nums">{fmtINR(c.cost)}</Td></tr>)}</Table> : <Empty title="No consumption in this range" />)}
            {tab === "purchases" && (d.purchases.length ? <Table head={["Purchase", "Supplier", "Date", "Total", "Status"]} className="-mx-4 -my-2">{d.purchases.map((p: any) => <tr key={p._id}><Td className="font-medium">{p.purchaseNo}</Td><Td>{p.supplier?.name}</Td><Td>{fmtDate(p.date)}</Td><Td className="tabular-nums">{fmtINR(p.total)}</Td><Td><Tag tone={p.status === "cancelled" ? "red" : "green"}>{p.status}</Tag></Td></tr>)}</Table> : <Empty title="No purchases in this range" />)}
            {tab === "wastage" && (d.wastage.length ? <Table head={["When", "Item", "Type", "Quantity", "Cost", "Reason"]} className="-mx-4 -my-2">{d.wastage.map((w: any, i: number) => <tr key={i}><Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(w.createdAt)}</Td><Td className="font-medium">{w.name}</Td><Td>{MOVE_LABEL[w.type]}</Td><Td className="tabular-nums">{w.qty} {w.unit}</Td><Td className="tabular-nums">{fmtINR(w.cost)}</Td><Td className="text-muted-foreground">{w.reason}</Td></tr>)}</Table> : <Empty title="No wastage recorded" />)}
            {tab === "low" && (d.low.length ? <Table head={["Item", "Stock", "Minimum", "Status"]} className="-mx-4 -my-2">{d.low.map((i: any) => <tr key={i._id}><Td className="font-medium">{i.name}</Td><Td className="tabular-nums">{q(i.currentStock, i.unit)}</Td><Td className="tabular-nums">{q(i.minStock, i.unit)}</Td><Td>{stockTag(i)}</Td></tr>)}</Table> : <Empty title="Nothing is low on stock" />)}
            {tab === "expired" && (d.expired.length ? <Table head={["Item", "Expired on", "Stock still on hand"]} className="-mx-4 -my-2">{d.expired.map((i: any) => <tr key={i._id}><Td className="font-medium">{i.name}</Td><Td>{fmtDate(i.expiryDate)}</Td><Td className="tabular-nums">{q(i.currentStock, i.unit)}</Td></tr>)}</Table> : <Empty title="No expired stock" />)}
          </Panel>
        </div>
      )}
    </>
  );
}
