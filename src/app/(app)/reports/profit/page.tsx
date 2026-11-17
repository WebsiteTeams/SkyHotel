"use client";
import { useState } from "react";
import { ErrorBox, Loading, PageHeader, Panel, Table, Td } from "@/components/kit";
import { DateFilter } from "@/components/report-bits";
import { downloadCSV, isoDay, qs, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

export default function ProfitReport() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 864e5))), [to, setTo] = useState(isoDay());
  const { data: d, error, loading, reload } = useApi<any>(`/api/reports/profit${qs({ from, to })}`);
  const line = ({ label, value, note, strong, neg }: { label: string; value: number; note?: string; strong?: boolean; neg?: boolean }) => (
    <div key={label}>
    <div className={`flex items-start justify-between gap-4 py-2.5 ${strong ? "border-t border-border text-base font-semibold" : "text-sm"}`}>
      <div><p>{label}</p>{note && <p className="text-xs font-normal text-muted-foreground">{note}</p>}</div>
      <p className={`tabular-nums ${strong && value < 0 ? "text-red-600" : ""}`}>{neg && value > 0 ? "−" : ""}{fmtINR(Math.abs(value))}</p>
    </div></div>
  );
  return (
    <>
      <PageHeader title="Profit report" subtitle="Revenue, gross profit and net profit are kept separate" />
      <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onCsv={() => d && downloadCSV("profit", [{ Revenue: d.revenue / 100, COGS: d.cogs / 100, Gross_profit: d.grossProfit / 100, Wastage: d.wastage / 100, Operating_expenses: d.operatingExpenses / 100, Net_operating_profit: d.netProfit / 100 }])} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !d && <Loading rows={5} />}
      {d && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Panel title="Profit & loss">
            {line({ label: "Sales revenue", value: d.revenue, note: `${d.bills} bills · net of refunds · excludes GST (${fmtINR(d.gstCollected)} collected for the government)` })}
            {line({label: "Ingredient cost consumed (COGS)", value: d.cogs, neg: true, note: "Recipe quantities × average cost at time of sale",})}
            {line({ strong: true, label: `Estimated gross profit · ${d.grossMargin}% margin`, value: d.grossProfit })}
            {line({label: "Wastage, damage & expiry", value: d.wastage, neg: true, note: "Valued at average cost",})}
            {line({label: "Operating expenses", value: d.operatingExpenses, neg: true, note: "Rent, electricity, salaries, etc.",})}
            {line({strong: true, label: "Net operating profit", value: d.netProfit,})}
          </Panel>
          <div className="space-y-5">
            <Panel title="Expenses by category">
              {d.expensesByCategory.length === 0 ? <p className="text-sm text-muted-foreground">No expenses recorded.</p> : <Table head={["Category", "Amount"]} className="-mx-4 -my-2">{d.expensesByCategory.map((e: any) => <tr key={e.category}><Td>{e.category}</Td><Td className="tabular-nums">{fmtINR(e.total)}</Td></tr>)}</Table>}
            </Panel>
            <Panel title="How this is calculated">
              <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
                <li>Purchases ({fmtINR(d.purchases)} in this period) are <b>not</b> subtracted from revenue. Stock bought but unsold is an asset, and it becomes cost only when consumed.</li>
                <li>Dishes without a recipe use the manual purchase cost on the food item.</li>
                <li>Cost uses the weighted-average price of each ingredient when the bill was confirmed.</li>
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
