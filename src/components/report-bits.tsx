"use client";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/kit";
import { isoDay } from "@/lib/client";

export const presets = (): Array<[string, string, string]> => {
  const t = new Date(), d = (n: number) => isoDay(new Date(t.getTime() - n * 864e5));
  const monthStart = isoDay(new Date(t.getFullYear(), t.getMonth(), 1));
  return [["Today", isoDay(t), isoDay(t)], ["7 days", d(6), isoDay(t)], ["30 days", d(29), isoDay(t)], ["This month", monthStart, isoDay(t)]];
};

export function DateFilter({ from, to, setFrom, setTo, onCsv, extra }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; onCsv?: () => void; extra?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
      {presets().map(([l, a, b]) => <button key={l} onClick={() => { setFrom(a); setTo(b); }} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${from === a && to === b ? "border-primary bg-secondary text-orange-700" : "border-border bg-white hover:bg-muted"}`}>{l}</button>)}
      <input className={inputCls + " w-40"} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
      <input className={inputCls + " w-40"} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      {extra}
      <div className="ml-auto flex gap-2">
        {onCsv && <Button variant="outline" onClick={onCsv}><Download />CSV</Button>}
        <Button variant="outline" onClick={() => window.print()}><FileText />PDF</Button>
      </div>
    </div>
  );
}
