"use client";
import { useState } from "react";
import { Loader2, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Field, Loading, PageHeader, Panel, Stat, Table, Tag, Td, inputCls, toPaise } from "@/components/kit";
import { useCan } from "@/components/session";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

export default function ShiftPage() {
  const can = useCan();
  const cur = useApi<any>("/api/shifts/current");
  const hist = useApi<any>(can("shift.view") ? "/api/shifts?limit=15" : null);
  const [opening, setOpening] = useState(""), [counted, setCounted] = useState(""), [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const s = cur.data;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr("");
    try { await fn(); toast.success(ok); setOpening(""); setCounted(""); setNotes(""); cur.reload(); hist.reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const diff = s && counted !== "" ? toPaise(counted) - s.expectedClosingCash : null;

  return (
    <>
      <PageHeader title="Shift management" subtitle="Open your drawer, track collections and close with a cash count" />
      {cur.error && <ErrorBox message={cur.error} onRetry={cur.reload} />}
      {cur.loading && !s && <Loading rows={3} />}

      {!cur.loading && !s && can("shift.open") && (
        <Panel title="Open a shift" className="mb-5 max-w-lg">
          <Field label="Opening cash in drawer (₹)"><input className={inputCls + " h-12 text-lg"} type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
          {err && <p role="alert" className="mt-3 text-sm text-red-600">{err}</p>}
          <Button className="mt-4 h-11" disabled={busy} onClick={() => run(() => api("/api/shifts", { body: { openingCash: toPaise(opening || 0) } }), "Shift opened")}>{busy ? <Loader2 className="animate-spin" /> : <Unlock />}Open shift</Button>
        </Panel>
      )}
      {!cur.loading && !s && !can("shift.open") && <Empty title="No open shift" hint="Shift opening is not enabled for your account." />}

      {s && (
        <div className="mb-6 space-y-5">
          <div className="flex items-center gap-2 text-sm"><Tag tone="green">Open</Tag><span className="text-muted-foreground">since {fmtDateTime(s.openedAt)}</span></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Opening cash" value={fmtINR(s.openingCash)} />
            <Stat label="Cash sales" value={fmtINR(s.totalCashSales)} hint={s.cashRefunds ? `Cash refunds −${fmtINR(s.cashRefunds)}` : undefined} />
            <Stat label="UPI sales" value={fmtINR(s.totalUPISales)} /><Stat label="Card sales" value={fmtINR(s.totalCardSales)} />
            <Stat label="Bills" value={s.billCount} hint={`${s.cancelledCount} cancelled`} /><Stat label="Total refunds" value={fmtINR(s.totalRefunds)} />
            <div className="col-span-2 rounded-2xl border border-orange-200 bg-secondary p-4"><p className="text-xs font-medium uppercase tracking-wide text-orange-700">Expected cash in drawer</p><p className="mt-1 text-2xl font-semibold tabular-nums">{fmtINR(s.expectedClosingCash)}</p><p className="text-xs text-muted-foreground">Opening cash + cash sales − cash refunds. UPI and card are not in the drawer.</p></div>
          </div>
          {can("shift.close") && (
            <Panel title="Close shift" className="max-w-xl">
              <div className="space-y-4">
                <Field label="Counted cash in drawer (₹)"><input className={inputCls + " h-12 text-lg"} type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
                {diff !== null && <p className={`rounded-lg px-3 py-2 text-sm font-medium ${diff === 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{diff === 0 ? "Cash matches." : `${diff > 0 ? "Over" : "Short"} by ${fmtINR(Math.abs(diff))}`}</p>}
                <Field label="Notes (optional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
                {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
                <Button className="h-11" disabled={busy || counted === ""} onClick={() => run(() => api(`/api/shifts/${s._id}/close`, { body: { actualClosingCash: toPaise(counted), notes: notes || undefined } }), "Shift closed and report submitted")}>{busy ? <Loader2 className="animate-spin" /> : <Lock />}Close shift &amp; submit report</Button>
              </div>
            </Panel>
          )}
        </div>
      )}

      {can("shift.view") && (
        <Panel title="Shift history">
          {hist.loading && !hist.data ? <Loading rows={3} /> : !hist.data?.items.length ? <p className="text-sm text-muted-foreground">No shifts yet.</p> : (
            <Table head={["Opened", "Closed", "Opening", "Cash", "UPI", "Card", "Expected", "Counted", "Difference"]} className="-mx-4 -my-2">
              {hist.data.items.map((h: any) => (
                <tr key={h._id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(h.openedAt)}</Td><Td className="whitespace-nowrap text-muted-foreground">{h.closedAt ? fmtDateTime(h.closedAt) : <Tag tone="green">Open</Tag>}</Td>
                  <Td className="tabular-nums">{fmtINR(h.openingCash)}</Td><Td className="tabular-nums">{fmtINR(h.totalCashSales)}</Td><Td className="tabular-nums">{fmtINR(h.totalUPISales)}</Td><Td className="tabular-nums">{fmtINR(h.totalCardSales)}</Td>
                  <Td className="tabular-nums">{fmtINR(h.expectedClosingCash)}</Td><Td className="tabular-nums">{h.actualClosingCash == null ? "-" : fmtINR(h.actualClosingCash)}</Td>
                  <Td className={`tabular-nums font-medium ${h.cashDifference ? "text-red-600" : ""}`}>{h.cashDifference == null ? "-" : fmtINR(h.cashDifference)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      )}
    </>
  );
}
