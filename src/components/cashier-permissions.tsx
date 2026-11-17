"use client";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Modal, Toggle, inputCls } from "@/components/kit";
import { api } from "@/lib/client";
import { CASHIER_TOGGLES, DEFAULT_DISCOUNT_POLICY, effectivePermissions, type DiscountPolicy } from "@/lib/rbac";

/** Hotel Admin: switch individual permissions and discount limits for ONE cashier. Enforced by the API, not just hidden in the UI. */
export function CashierPermissions({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const initial = useMemo(() => new Set<string>(effectivePermissions("cashier", user.permissions)), [user]);
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(CASHIER_TOGGLES.map((t) => [t.key, initial.has(t.key)])));
  const [pol, setPol] = useState<DiscountPolicy>({ ...DEFAULT_DISCOUNT_POLICY, ...(user.discountPolicy ?? {}) });
  const [maxAmt, setMaxAmt] = useState(String((pol.maxAmount ?? 0) / 100));
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const groups = [...new Set(CASHIER_TOGGLES.map((t) => t.group))];

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await api(`/api/staff/${user._id}/permissions`, { method: "PUT", body: { permissions: on, discountPolicy: { ...pol, maxPercent: Number(pol.maxPercent), maxAmount: Math.round(Number(maxAmt || 0) * 100) } } });
      toast.success("Permissions saved. They apply to the cashier immediately."); onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const reset = () => { setOn(Object.fromEntries(CASHIER_TOGGLES.map((t) => [t.key, effectivePermissions("cashier", {}).includes(t.key)]))); setPol(DEFAULT_DISCOUNT_POLICY); setMaxAmt(String(DEFAULT_DISCOUNT_POLICY.maxAmount / 100)); };

  return (
    <Modal wide open onClose={onClose} title={`Permissions · ${user.name}`}
      footer={<><Button variant="outline" className="mr-auto" onClick={reset}>Reset to defaults</Button><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy && <Loader2 className="animate-spin" />}Save permissions</Button></>}>
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g}>
            <p className={`mb-1 text-xs font-semibold uppercase tracking-wider ${g === "Sensitive" ? "text-red-600" : "text-muted-foreground"}`}>{g}{g === "Sensitive" && " · off by default"}</p>
            <div className="divide-y divide-border rounded-xl border border-border px-4">
              {CASHIER_TOGGLES.filter((t) => t.group === g).map((t) => (
                <div key={t.key}><Toggle label={t.label} checked={!!on[t.key]} onChange={(v) => setOn({ ...on, [t.key]: v })} />{t.hint && <p className="-mt-1 pb-2 text-xs text-muted-foreground">{t.hint}</p>}</div>
              ))}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discount limits</p>
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Toggle label="Allow percentage discounts" checked={pol.allowPercent} onChange={(v) => setPol({ ...pol, allowPercent: v })} />
              <Toggle label="Allow fixed-amount discounts" checked={pol.allowFixed} onChange={(v) => setPol({ ...pol, allowFixed: v })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Maximum percentage (%)"><input className={inputCls} type="number" min="0" max="100" disabled={!pol.allowPercent} value={pol.maxPercent} onChange={(e) => setPol({ ...pol, maxPercent: Number(e.target.value) })} /></Field>
              <Field label="Maximum fixed amount (₹)"><input className={inputCls} type="number" min="0" disabled={!pol.allowFixed} value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} /></Field>
            </div>
            <Toggle label="Cashier must enter a reason for every discount" checked={pol.requireReason} onChange={(v) => setPol({ ...pol, requireReason: v })} />
            <p className="text-xs text-muted-foreground">Anything above these limits (or when &quot;Apply discount&quot; is off) needs a manager&apos;s email and PIN at the counter. The approver and reason are recorded in the audit log.</p>
          </div>
        </div>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
