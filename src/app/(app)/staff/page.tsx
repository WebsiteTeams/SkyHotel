"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BarChart3, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuditLogTable } from "@/components/audit-log";
import { ApprovalsList } from "@/components/approvals-list";
import { CashierPermissions } from "@/components/cashier-permissions";
import { Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Stat, Table, Tag, Td, Toggle, inputCls } from "@/components/kit";
import { useSession } from "@/components/session";
import { api, fmtDateTime, isoDay, qs, useApi } from "@/lib/client";
import { fmtINR } from "@/lib/money";
import { ROLES, ROLE_LABEL } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const schema = z.object({ name: z.string().trim().min(1, "Name is required"), email: z.string().email("Enter a valid email"), phone: z.string(), role: z.enum(ROLES), active: z.boolean(), password: z.string() });
type Form = z.infer<typeof schema>;
const blank: Form = { name: "", email: "", phone: "", role: "cashier", active: true, password: "" };
const TABS = [["team", "Team"], ["shifts", "Cashier shifts"], ["approvals", "Approvals"], ["audit", "Audit log"]] as const;

function Performance({ user, onClose }: { user: any; onClose: () => void }) {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 864e5))), [to, setTo] = useState(isoDay());
  const { data: d, error, loading } = useApi<any>(`/api/staff/${user._id}/performance${qs({ from, to })}`);
  return (
    <Modal wide open onClose={onClose} title={`Performance · ${user.name}`}>
      <div className="mb-4 flex gap-2"><input className={inputCls + " w-40"} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input className={inputCls + " w-40"} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      {error && <ErrorBox message={error} />}
      {loading && !d && <Loading rows={3} />}
      {d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Net sales" value={fmtINR(d.sales)} /><Stat label="Bills" value={d.bills} hint={`Avg ${fmtINR(d.avgBill)}`} />
            <Stat label="Discounts given" value={fmtINR(d.discounts)} /><Stat label="Cancelled bills" value={d.cancelled} tone={d.cancelled ? "warn" : undefined} />
            <Stat label="Shifts" value={d.shifts} /><Stat label="Cash difference (total)" value={fmtINR(d.cashDifference)} tone={d.cashDifference ? "warn" : undefined} />
          </div>
          {d.recentShifts.length > 0 && (
            <Table head={["Opened", "Status", "Expected", "Counted", "Difference"]}>
              {d.recentShifts.map((s: any) => <tr key={s._id}><Td className="whitespace-nowrap">{fmtDateTime(s.openedAt)}</Td><Td><Tag tone={s.status === "open" ? "green" : "gray"}>{s.status}</Tag></Td><Td className="tabular-nums">{s.status === "closed" ? fmtINR(s.expectedClosingCash) : "-"}</Td><Td className="tabular-nums">{s.actualClosingCash == null ? "-" : fmtINR(s.actualClosingCash)}</Td><Td className={cn("tabular-nums", s.cashDifference && "font-medium text-red-600")}>{s.cashDifference == null ? "-" : fmtINR(s.cashDifference)}</Td></tr>)}
            </Table>
          )}
        </div>
      )}
    </Modal>
  );
}

function Shifts({ cashiers }: { cashiers: any[] }) {
  const [cashier, setCashier] = useState("");
  const { data, error, loading, reload } = useApi<any>(`/api/shifts${qs({ cashier, limit: 30 })}`);
  return (
    <>
      <select className={inputCls + " mb-4 w-56"} value={cashier} onChange={(e) => setCashier(e.target.value)}><option value="">All cashiers</option>{cashiers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : !data?.items.length ? <Empty title="No shifts yet" hint="Shifts appear when cashiers open their drawer." /> : (
          <Table head={["Cashier", "Opened", "Closed", "Cash", "UPI", "Card", "Refunds", "Expected", "Counted", "Difference"]}>
            {data.items.map((s: any) => (
              <tr key={s._id}>
                <Td className="font-medium">{s.cashier?.name}</Td><Td className="whitespace-nowrap">{fmtDateTime(s.openedAt)}</Td><Td className="whitespace-nowrap text-muted-foreground">{s.closedAt ? fmtDateTime(s.closedAt) : <Tag tone="green">Open</Tag>}</Td>
                <Td className="tabular-nums">{fmtINR(s.totalCashSales)}</Td><Td className="tabular-nums">{fmtINR(s.totalUPISales)}</Td><Td className="tabular-nums">{fmtINR(s.totalCardSales)}</Td><Td className="tabular-nums">{fmtINR(s.totalRefunds)}</Td>
                <Td className="tabular-nums">{fmtINR(s.expectedClosingCash)}</Td><Td className="tabular-nums">{s.actualClosingCash == null ? "-" : fmtINR(s.actualClosingCash)}</Td>
                <Td className={cn("tabular-nums", s.cashDifference && "font-medium text-red-600")}>{s.cashDifference == null ? "-" : fmtINR(s.cashDifference)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}

export default function Staff() {
  const me = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("team");
  const { data, error, loading, reload } = useApi<any[]>("/api/staff");
  const [edit, setEdit] = useState<any>(null), [del, setDel] = useState<any>(null), [perm, setPerm] = useState<any>(null), [perf, setPerf] = useState<any>(null);
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: blank });
  const roles = ROLES.filter((r) => r !== "super_admin" || me.role === "super_admin");
  const isNew = edit === "new";
  const open = (u: any) => { f.reset(u === "new" ? blank : { ...blank, ...u, password: "" }); setEdit(u); };
  const save = f.handleSubmit(async (v) => {
    if (isNew && v.password.length < 8) return f.setError("password", { message: "At least 8 characters" });
    if (!isNew && v.password && v.password.length < 8) return f.setError("password", { message: "At least 8 characters" });
    try {
      await api(isNew ? "/api/staff" : `/api/staff/${edit._id}`, { method: isNew ? "POST" : "PUT", body: { ...v, password: v.password || undefined } });
      toast.success(isNew && v.role === "cashier" ? "Cashier created with default permissions. Use Permissions to customise." : "Staff member saved"); setEdit(null); reload();
    } catch (e: any) { Object.entries(e.fields ?? {}).forEach(([k, m]) => f.setError(k as any, { message: String(m) })); toast.error(e.message); }
  });
  const E = f.formState.errors;
  const role = f.watch("role");
  const cashiers = (data ?? []).filter((u) => u.role === "cashier");

  return (
    <>
      <PageHeader title="Staff & access" subtitle="Create cashiers, control exactly what each one can do, and review their activity" actions={<Button onClick={() => open("new")}><Plus />Add staff</Button>} />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium", tab === k ? "border-primary text-orange-700" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>

      {tab === "team" && (
        <>
          {error && <ErrorBox message={error} onRetry={reload} />}
          <div className="rounded-2xl border border-border bg-card">
            {loading && !data ? <div className="p-5"><Loading /></div> : (
              <Table head={["Name", "Role", "Phone", "Last sign-in", "Status", ""]}>
                {data?.map((u) => (
                  <tr key={u._id}>
                    <Td><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></Td>
                    <Td>{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}{u.role !== "cashier" && ["manager", "hotel_admin", "super_admin"].includes(u.role) && <span className={cn("ml-2 text-xs", u.pinSet ? "text-emerald-700" : "text-muted-foreground")}>{u.pinSet ? "PIN set" : "no PIN"}</span>}</Td>
                    <Td className="text-muted-foreground">{u.phone || "-"}</Td><Td className="text-muted-foreground">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</Td>
                    <Td>{u.active ? <Tag tone="green">Active</Tag> : <Tag tone="red">Disabled</Tag>}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {u.role === "cashier" && <>
                        <button aria-label="Permissions" title="Permissions & discount limits" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => setPerm(u)}><ShieldCheck className="size-4" /></button>
                        <button aria-label="Performance" title="Sales performance" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => setPerf(u)}><BarChart3 className="size-4" /></button></>}
                      <button aria-label="Edit" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => open(u)}><Pencil className="size-4" /></button>
                      {u.email !== me.email && <button aria-label="Delete" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => setDel(u)}><Trash2 className="size-4" /></button>}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Managers and admins set their own approval PIN under My Profile. Cashiers ask for it at the counter to exceed discount limits, cancel bills or refund.</p>
        </>
      )}
      {tab === "shifts" && <Shifts cashiers={cashiers} />}
      {tab === "approvals" && <ApprovalsList />}
      {tab === "audit" && <AuditLogTable />}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={isNew ? "Add staff member" : "Edit staff member"} footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={f.formState.isSubmitting}>{f.formState.isSubmitting && <Loader2 className="animate-spin" />}Save</Button></>}>
        <form onSubmit={save} noValidate className="space-y-4">
          <Field label="Full name" error={E.name?.message}><input className={inputCls} {...f.register("name")} /></Field>
          <Field label="Email (sign-in)" error={E.email?.message}><input className={inputCls} type="email" disabled={!isNew} {...f.register("email")} /></Field>
          <Field label="Phone"><input className={inputCls} {...f.register("phone")} /></Field>
          <Field label="Role"><select className={inputCls} {...f.register("role")}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          <p className="-mt-2 text-xs text-muted-foreground">{role === "cashier" ? "Cashiers start with billing, payments, receipts and shift access only. Fine-tune them with the Permissions button." : role === "manager" ? "Dashboard, orders, stock, purchases, reports and approvals." : "Full operational access."}</p>
          <Field label={isNew ? "Password" : "Reset password"} hint={isNew ? undefined : "Leave blank to keep the current password"} error={E.password?.message}><input className={inputCls} type="password" autoComplete="new-password" {...f.register("password")} /></Field>
          <Toggle label="Account active" checked={f.watch("active")} onChange={(v) => f.setValue("active", v)} />
        </form>
      </Modal>
      {perm && <CashierPermissions user={perm} onClose={() => setPerm(null)} onSaved={reload} />}
      {perf && <Performance user={perf} onClose={() => setPerf(null)} />}
      <Confirm open={!!del} danger title="Remove staff member?" message={`${del?.name} will lose access immediately. Their past bills remain.`} confirmLabel="Remove" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api(`/api/staff/${del._id}`, { method: "DELETE" }); toast.success("Staff removed"); setDel(null); reload(); } catch (e: any) { toast.error(e.message); } }} />
    </>
  );
}
