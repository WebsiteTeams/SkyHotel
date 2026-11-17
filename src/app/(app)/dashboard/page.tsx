"use client";
import { useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorBox, Loading, PageHeader, Panel, Stat, Table, Td, Tag, statusTone, Empty } from "@/components/kit";
import { useApi, fmtDateTime, fmtDate } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/session";

const RANGES = [["day", "Today"], ["week", "7 days"], ["month", "30 days"]] as const;
const PAY_COLORS: Record<string, string> = { cash: "#f97316", upi: "#171717", card: "#fdba74" };

export default function Dashboard() {
  const can0 = useCan();
  return can0("dashboard.view") ? <AdminDashboard /> : <CashierDashboard />;
}

function CashierDashboard() {
  const { data: d, error, loading, reload } = useApi<any>("/api/me/dashboard");
  const can = useCan();
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your sales today" actions={can("pos.use") && <Link href="/pos" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white">Open POS</Link>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !d && <Loading rows={5} />}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="Today's sales" value={fmtINR(d.todaySales)} /><Stat label="Total orders" value={d.orders} />
            <Stat label="Cash collection" value={fmtINR(d.cash)} /><Stat label="UPI collection" value={fmtINR(d.upi)} /><Stat label="Card collection" value={fmtINR(d.card)} />
            <Stat label="Current shift" value={d.shift ? "Open" : "Closed"} tone={d.shift ? undefined : "warn"} hint={d.shift ? `Since ${fmtDateTime(d.shift.openedAt)}` : can("shift.open") ? "Open a shift to start billing" : undefined} />
          </div>
          {!d.shift && can("shift.open") && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">No open shift. <Link href="/shift" className="font-semibold underline">Open your shift</Link> to start billing.</div>}
          <Panel title="Recent bills" action={can("billing.view") ? <Link href="/billing/history" className="text-xs font-medium text-primary">All bills</Link> : undefined}>
            {d.recent.length === 0 ? <Empty title="No bills yet" hint="Bills you create will show here." /> : (
              <Table head={["Invoice", "Time", "Type", "Total", "Status"]} className="-mx-4 -my-2">
                {d.recent.map((o: any) => (
                  <tr key={o._id}><Td className="whitespace-nowrap"><Link href={`/billing/${o._id}`} className="font-medium hover:text-primary">{o.orderNo}</Link></Td><Td className="text-muted-foreground">{fmtDateTime(o.createdAt)}</Td><Td className="capitalize">{o.type.replace("_", " ")}{o.table ? ` · T${o.table}` : ""}</Td><Td className="tabular-nums">{fmtINR(o.grandTotal)}</Td><Td><Tag tone={statusTone(o.status === "cancelled" ? "cancelled" : o.paymentStatus) as any}>{o.status === "cancelled" ? "cancelled" : o.paymentStatus}</Tag></Td></tr>
                ))}
              </Table>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

function AdminDashboard() {
  const [range, setRange] = useState<"day" | "week" | "month">("week");
  const { data: d, error, loading, reload } = useApi<any>(`/api/reports/dashboard?range=${range}`);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live numbers from your hotel" actions={
        <div className="flex w-fit max-w-full overflow-x-auto rounded-lg border border-border bg-white p-1">
          {RANGES.map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition", range === k ? "bg-primary text-white" : "text-neutral-600 hover:bg-muted")}>{l}</button>
          ))}
        </div>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !d && <Loading rows={6} />}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Stat label="Today's sales" value={fmtINR(d.todaySales)} hint={`${d.todayOrders} orders today`} />
            <Stat label="Total orders" value={d.orders} hint="in selected range" />
            <Stat label="Total revenue" value={fmtINR(d.revenue)} hint="after refunds, incl. GST" />
            <Stat label="Avg order value" value={fmtINR(d.avgOrder)} />
            <Stat label="Today's expenses" value={fmtINR(d.expensesToday)} />
            <Stat label="Food items" value={d.foodItems} />
            <Stat label="Available stock items" value={d.availableStock} hint={`of ${d.stockItems} tracked`} />
            <Stat label="Low stock" value={d.lowStock} tone={d.lowStock ? "warn" : undefined} />
            <Stat label="Out of stock" value={d.outOfStock} tone={d.outOfStock ? "danger" : undefined} />
            <Stat label="Purchases" value={fmtINR(d.purchases)} hint="in selected range" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Sales overview" className="lg:col-span-2">
              {d.series.length === 0 ? <Empty title="No sales in this period" hint="Bills created in POS will appear here." /> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.series.map((s: any) => ({ ...s, v: s.sales / 100 }))} margin={{ left: 0, right: 8, top: 8 }}>
                      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.25} /><stop offset="100%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke="#e5e5e5" vertical={false} />
                      <XAxis dataKey="label" tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} fontSize={12} stroke="#737373" />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#737373" width={56} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                      <Tooltip formatter={(v) => [fmtINR(Number(v) * 100), "Sales"]} contentStyle={{ borderRadius: 12, border: "1px solid #e5e5e5" }} />
                      <Area type="monotone" dataKey="v" stroke="#f97316" strokeWidth={2.5} fill="url(#g)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel title="Payment methods">
              {d.payments.filter((p: any) => p.amount > 0).length === 0 ? <Empty title="No payments yet" /> : (
                <>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={d.payments.filter((p: any) => p.amount > 0)} dataKey="amount" nameKey="method" innerRadius={48} outerRadius={72} paddingAngle={2}>
                          {d.payments.map((p: any) => <Cell key={p.method} fill={PAY_COLORS[p.method] ?? "#737373"} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmtINR(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-2 text-sm">
                    {d.payments.map((p: any) => (
                      <li key={p.method} className="flex items-center justify-between"><span className="flex items-center gap-2 capitalize"><span className="size-2.5 rounded-full" style={{ background: PAY_COLORS[p.method] ?? "#737373" }} />{p.method}</span><span className="tabular-nums font-medium">{fmtINR(p.amount)}</span></li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Best-selling items">
              {d.best.length === 0 ? <Empty title="Nothing sold yet" /> : (
                <ol className="space-y-3">
                  {d.best.map((b: any, i: number) => {
                    const max = d.best[0].qty;
                    return (
                      <li key={b._id}>
                        <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{i + 1}. {b.name}</span><span className="tabular-nums text-muted-foreground">{b.qty} sold · {fmtINR(b.revenue)}</span></div>
                        <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(b.qty / max) * 100}%` }} /></div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
            <Panel title="Low-stock alerts" action={<Link href="/inventory?status=low" className="text-xs font-medium text-primary">View all</Link>}>
              {d.lowStockItems.length === 0 ? <Empty title="Stock levels look healthy" /> : (
                <ul className="divide-y divide-border">
                  {d.lowStockItems.map((i: any) => (
                    <li key={i._id} className="flex items-center justify-between py-2.5 text-sm">
                      <Link href={`/inventory/${i._id}`} className="font-medium hover:text-primary">{i.name}</Link>
                      <span className="flex items-center gap-2"><span className="tabular-nums text-muted-foreground">{i.currentStock} / {i.minStock} {i.baseUnit}</span>{i.currentStock <= 0 ? <Tag tone="red">Out</Tag> : <Tag tone="orange">Low</Tag>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Recent transactions" action={<Link href="/billing/history" className="text-xs font-medium text-primary">All bills</Link>}>
              {d.recentOrders.length === 0 ? <Empty title="No bills yet" /> : (
                <Table head={["Invoice", "Time", "Total", "Status"]} className="-mx-4 -my-2">
                  {d.recentOrders.map((o: any) => (
                    <tr key={o._id}>
                      <Td className="whitespace-nowrap"><Link href={`/billing/${o._id}`} className="font-medium hover:text-primary">{o.orderNo}</Link></Td>
                      <Td className="text-muted-foreground">{fmtDateTime(o.createdAt)}</Td>
                      <Td className="tabular-nums">{fmtINR(o.grandTotal)}</Td>
                      <Td><Tag tone={statusTone(o.status === "cancelled" ? "cancelled" : o.paymentStatus) as any}>{o.status === "cancelled" ? "cancelled" : o.paymentStatus}</Tag></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
            <Panel title="Recent purchases" action={<Link href="/purchases" className="text-xs font-medium text-primary">All purchases</Link>}>
              {d.recentPurchases.length === 0 ? <Empty title="No purchases yet" /> : (
                <Table head={["Purchase", "Supplier", "Date", "Total"]} className="-mx-4 -my-2">
                  {d.recentPurchases.map((p: any) => (
                    <tr key={p._id}>
                      <Td><Link href={`/purchases/${p._id}`} className="font-medium hover:text-primary">{p.purchaseNo}</Link></Td>
                      <Td>{p.supplier?.name}</Td><Td className="text-muted-foreground">{fmtDate(p.date)}</Td><Td className="tabular-nums">{fmtINR(p.total)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
