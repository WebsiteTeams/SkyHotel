"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, Tag, Td, inputCls } from "@/components/kit";
import { api, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80), company: z.string().max(80), phone: z.string().max(20),
  email: z.union([z.string().email("Invalid email"), z.literal("")]), address: z.string().max(300), gstin: z.string().max(20), products: z.string(),
});
type Form = z.infer<typeof schema>;
const blank: Form = { name: "", company: "", phone: "", email: "", address: "", gstin: "", products: "" };

export default function Suppliers() {
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useApi<any[]>("/api/suppliers");
  const [edit, setEdit] = useState<any>(null), [del, setDel] = useState<any>(null), [busy, setBusy] = useState(false);
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: blank });
  const open = (s: any | "new") => { f.reset(s === "new" ? blank : { ...blank, ...s, products: (s.products ?? []).join(", ") }); setEdit(s); };
  const save = f.handleSubmit(async (v) => {
    try {
      const body = { ...v, products: v.products.split(",").map((x) => x.trim()).filter(Boolean) };
      await api(edit === "new" ? "/api/suppliers" : `/api/suppliers/${edit._id}`, { method: edit === "new" ? "POST" : "PUT", body });
      toast.success("Supplier saved"); setEdit(null); reload();
    } catch (e: any) { Object.entries(e.fields ?? {}).forEach(([k, m]) => f.setError(k as any, { message: String(m) })); toast.error(e.message); }
  });
  const list = (data ?? []).filter((s) => (s.name + s.company).toLowerCase().includes(q.toLowerCase()));
  const E = f.formState.errors;

  return (
    <>
      <PageHeader title="Suppliers" subtitle="Vendors, purchase totals and outstanding balances" actions={<Button onClick={() => open("new")}><Plus />Add supplier</Button>} />
      <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={inputCls + " pl-9"} placeholder="Search suppliers" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : list.length === 0 ? <Empty title="No suppliers yet" hint="Add the vendors you buy ingredients from." action={<Button onClick={() => open("new")}>Add supplier</Button>} /> : (
          <Table head={["Supplier", "Contact", "GSTIN", "Purchases", "Total purchased", "Outstanding", ""]}>
            {list.map((s) => (
              <tr key={s._id} className="hover:bg-muted/40">
                <Td><Link href={`/suppliers/${s._id}`} className="font-medium hover:text-primary">{s.name}</Link><p className="text-xs text-muted-foreground">{s.company}</p></Td>
                <Td className="text-muted-foreground">{s.phone}<br />{s.email}</Td><Td className="text-muted-foreground">{s.gstin || "-"}</Td>
                <Td>{s.purchaseCount}</Td><Td className="tabular-nums">{fmtINR(s.totalPurchases)}</Td>
                <Td className="tabular-nums">{s.outstanding > 0 ? <Tag tone="red">{fmtINR(s.outstanding)}</Tag> : <Tag tone="green">Settled</Tag>}</Td>
                <Td className="text-right"><button aria-label="Edit" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => open(s)}><Pencil className="size-4" /></button><button aria-label="Delete" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => setDel(s)}><Trash2 className="size-4" /></button></Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <Modal wide open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "Add supplier" : "Edit supplier"} footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={f.formState.isSubmitting}>{f.formState.isSubmitting && <Loader2 className="animate-spin" />}Save</Button></>}>
        <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name" error={E.name?.message}><input className={inputCls} {...f.register("name")} /></Field>
          <Field label="Company" error={E.company?.message}><input className={inputCls} {...f.register("company")} /></Field>
          <Field label="Phone" error={E.phone?.message}><input className={inputCls} inputMode="tel" {...f.register("phone")} /></Field>
          <Field label="Email" error={E.email?.message}><input className={inputCls} type="email" {...f.register("email")} /></Field>
          <Field label="GSTIN" error={E.gstin?.message}><input className={inputCls} {...f.register("gstin")} /></Field>
          <Field label="Supplied products" hint="Comma separated"><input className={inputCls} {...f.register("products")} /></Field>
          <Field label="Address" className="sm:col-span-2" error={E.address?.message}><textarea className={inputCls + " h-16 py-2"} {...f.register("address")} /></Field>
        </form>
      </Modal>
      <Confirm open={!!del} danger busy={busy} title="Delete supplier?" message={`"${del?.name}" is hidden from lists. Purchase history is kept.`} confirmLabel="Delete" onClose={() => setDel(null)}
        onConfirm={async () => { setBusy(true); try { await api(`/api/suppliers/${del._id}`, { method: "DELETE" }); toast.success("Supplier deleted"); setDel(null); reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }} />
    </>
  );
}
