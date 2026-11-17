"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, Modal, Tag, inputCls } from "@/components/kit";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { cn } from "@/lib/utils";

const TONE: Record<string, any> = { pending: "orange", approved: "green", rejected: "red", failed: "red" };
const LABEL: Record<string, string> = { cancel_bill: "Cancel bill", refund: "Refund", discount: "Discount" };

/** Review queue for cancellation / refund requests. Used on /approvals. */
export function ApprovalsList() {
  const [status, setStatus] = useState("pending");
  const { data, error, loading, reload } = useApi<any[]>(`/api/approvals?status=${status}`);
  const [target, setTarget] = useState<{ r: any; decision: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");

  const decide = async () => {
    if (!target) return;
    setBusy(true); setErr("");
    try {
      await api(`/api/approvals/${target.r._id}`, { body: { decision: target.decision, note: note || undefined } });
      toast.success(target.decision === "approve" ? "Approved and processed" : "Request rejected");
      setTarget(null); setNote(""); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-4 flex w-fit max-w-full overflow-x-auto rounded-lg border border-border bg-white p-1">
        {["pending", "approved", "rejected", "failed"].map((s) => <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize", status === s ? "bg-primary text-white" : "text-neutral-600 hover:bg-muted")}>{s}</button>)}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data?.length === 0 ? <Empty title={`No ${status} requests`} hint={status === "pending" ? "When a cashier asks to cancel or refund a bill, it shows up here." : undefined} /> : (
        <ul className="space-y-3">
          {data?.map((r) => (
            <li key={r._id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-medium">{LABEL[r.requestType]}{r.requestType === "refund" && r.payload && ` · ${fmtINR(r.payload.amount)} (${r.payload.method})`}<Tag tone={TONE[r.status]}>{r.status}</Tag></p>
                  <p className="mt-1 text-sm text-muted-foreground">Bill {r.relatedBill ? <Link className="font-medium text-primary" href={`/billing/${r.relatedBill._id}`}>{r.relatedBill.orderNo}</Link> : "-"}{r.relatedBill && ` · ${fmtINR(r.relatedBill.grandTotal)}`} · requested by {r.requestedBy?.name} · {fmtDateTime(r.createdAt)}</p>
                  <p className="mt-2 text-sm">“{r.reason}”</p>
                  {r.status !== "pending" && <p className="mt-1 text-xs text-muted-foreground">{r.status === "failed" ? "Could not be processed" : `Decided by ${r.approvedBy?.name ?? "-"}`} {r.approvedAt && `· ${fmtDateTime(r.approvedAt)}`}{r.decisionNote && ` · ${r.decisionNote}`}</p>}
                </div>
                {r.status === "pending" && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="text-red-600" onClick={() => { setErr(""); setNote(""); setTarget({ r, decision: "reject" }); }}><X />Reject</Button>
                    <Button onClick={() => { setErr(""); setNote(""); setTarget({ r, decision: "approve" }); }}><Check />Approve</Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.decision === "approve" ? "Approve request" : "Reject request"}
        footer={<Button disabled={busy} className={target?.decision === "reject" ? "bg-red-600 text-white hover:bg-red-700" : ""} onClick={decide}>{busy && <Loader2 className="animate-spin" />}{target?.decision === "approve" ? "Approve & process" : "Reject"}</Button>}>
        <p className="text-sm text-muted-foreground">{target?.decision === "approve" ? "Approving cancels / refunds the bill immediately, returns stock where applicable and records you as the approver." : "The bill stays as it is."}</p>
        <input className={inputCls + " mt-3"} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p role="alert" className="mt-3 text-sm text-red-600">{err}</p>}
      </Modal>
    </>
  );
}
