"use client";
import { useState } from "react";
import { Download, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Stat, Table, Td, inputCls, rupees, toPaise } from "@/components/kit";
import { ImageUpload } from "@/components/image-upload";
import { api, downloadCSV, fmtDate, isoDay, qs, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

const CATS = ["Rent", "Electricity", "Water", "Staff salary", "Transportation", "Maintenance", "Other"];
const blank = { category: "Rent", amount: "", method: "cash", date: isoDay(), description: "", receipt: "" };

export default function Expenses() {
  const [category, setCategory] = useState(""), [page, setPage] = useState(1);
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 864e5))), [to, setTo] = useState(isoDay());
  const { data, error, loading, reload } = useApi<any>(`/api/expenses${qs({ category, from, to, page })}`);
  const [form, setForm] = useState<any>(null), [id, setId] = useState<string | null>(null), [del, setDel] = useState<any>(null);
  const [errs, setErrs] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setErrs({});
    try {
      await api(id ? `/api/expenses/${id}` : "/api/expenses", { method: id ? "PUT" : "POST", body: { ...form, amount: toPaise(form.amount), receipt: form.receipt || undefined } });
      toast.success("Expense saved"); setForm(null); reload();
    } catch (e: any) { setErrs(e.fields ?? {}); toast.error(e.message); } finally { setBusy(false); }
  };
  const exportCsv = async () => {
    const all = await api<any>(`/api/expenses${qs({ category, from, to, limit: 100 })}`);
    downloadCSV("expenses", all.items.map((e: any) => ({ Date: e.date.slice(0, 10), Category: e.category, Amount: (e.amount / 100).toFixed(2), Method: e.method, Description: e.description })));
  };

  return (
    <>
      <PageHeader title="Expenses" subtitle="Operating expenses feed the profit report" actions={<><Button variant="outline" onClick={exportCsv}><Download />CSV</Button><Button variant="outline" onClick={() => window.print()}><FileText />PDF</Button><Button onClick={() => { setId(null); setErrs({}); setForm({ ...blank }); }}><Plus />Add expense</Button></>} />
      <div className="mb-4 flex flex-wrap gap-3 print:hidden">
        <select className={inputCls + " w-48"} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <input className={inputCls + " w-40"} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" />
        <input className={inputCls + " w-40"} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" />
      </div>
      {data && <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Total in range" value={fmtINR(data.total)} />{data.byCategory.slice(0, 3).map((c: any) => <Stat key={c.category} label={c.category} value={fmtINR(c.total)} />)}</div>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : data?.items.length === 0 ? <Empty title="No expenses in this range" hint="Record rent, electricity, salaries and other costs." /> : (
          <>
            <Table head={["Date", "Category", "Description", "Method", "Amount", "Receipt", ""]}>
              {data?.items.map((e: any) => (
                <tr key={e._id}>
                  <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td><Td className="font-medium">{e.category}</Td><Td className="max-w-64 truncate text-muted-foreground">{e.description || "-"}</Td><Td className="capitalize">{e.method}</Td>
                  <Td className="tabular-nums font-medium">{fmtINR(e.amount)}</Td><Td>{e.receipt ? <a className="text-primary underline" target="_blank" href={e.receipt}>View</a> : "-"}</Td>
                  <Td className="text-right print:hidden"><button aria-label="Edit" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => { setId(e._id); setErrs({}); setForm({ category: e.category, amount: rupees(e.amount), method: e.method, date: e.date.slice(0, 10), description: e.description, receipt: e.receipt ?? "" }); }}><Pencil className="size-4" /></button><button aria-label="Delete" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => setDel(e)}><Trash2 className="size-4" /></button></Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={id ? "Edit expense" : "Add expense"} footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button disabled={busy} onClick={save}>{busy && <Loader2 className="animate-spin" />}Save</Button></>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={errs.category}><select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Amount ₹" error={errs.amount}><input className={inputCls} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="Payment method"><select className={inputCls} value={form.method} onChange={(e) => set("method", e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></select></Field>
          <Field label="Date" error={errs.date}><input className={inputCls} type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Description" className="sm:col-span-2"><input className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <div className="sm:col-span-2"><p className="mb-1.5 text-sm font-medium">Receipt</p><ImageUpload value={form.receipt} onChange={(u) => set("receipt", u)} label="Attach receipt" accept="image/png,image/jpeg,image/webp,application/pdf" /></div>
        </div>}
      </Modal>
      <Confirm open={!!del} danger title="Delete expense?" message={`${del?.category} · ${del ? fmtINR(del.amount) : ""}. This is recorded in the audit log.`} confirmLabel="Delete" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api(`/api/expenses/${del._id}`, { method: "DELETE" }); toast.success("Expense deleted"); setDel(null); reload(); } catch (e: any) { toast.error(e.message); } }} />
    </>
  );
}
