"use client";
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, PageHeader, Panel, inputCls } from "@/components/kit";
import { useCan, useSession } from "@/components/session";
import { api, useApi } from "@/lib/client";
import { CASHIER_TOGGLES, ROLE_LABEL } from "@/lib/rbac";

export default function Profile() {
  const me = useSession();
  const can = useCan();
  const info = useApi<any>("/api/auth/me");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pin, setPin] = useState({ password: "", pin: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const changePw = async () => {
    setErrs({});
    if (pw.newPassword !== pw.confirm) return setErrs({ confirm: "Passwords do not match" });
    setBusy("pw");
    try { await api("/api/me/password", { method: "PUT", body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } }); toast.success("Password changed"); setPw({ currentPassword: "", newPassword: "", confirm: "" }); }
    catch (e: any) { setErrs(e.fields ?? { currentPassword: e.message }); toast.error(e.message); } finally { setBusy(""); }
  };
  const savePin = async () => {
    setErrs({}); setBusy("pin");
    try { await api("/api/me/pin", { method: "PUT", body: pin }); toast.success("Approval PIN saved"); setPin({ password: "", pin: "" }); info.reload(); }
    catch (e: any) { setErrs(e.fields ?? { pin: e.message }); toast.error(e.message); } finally { setBusy(""); }
  };

  return (
    <>
      <PageHeader title="My profile" subtitle="Your account, access and security" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Account">
          <dl className="space-y-2.5 text-sm">
            {[["Name", me.name], ["Email", me.email], ["Role", ROLE_LABEL[me.role]], ["Hotel", me.hotelName]].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
        </Panel>

        <Panel title="Change password">
          <div className="space-y-3">
            <Field label="Current password" error={errs.currentPassword}><input className={inputCls} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password" error={errs.newPassword} hint="At least 8 characters"><input className={inputCls} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Field label="Confirm new password" error={errs.confirm}><input className={inputCls} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <Button disabled={busy === "pw" || !pw.newPassword} onClick={changePw}>{busy === "pw" && <Loader2 className="animate-spin" />}Update password</Button>
          </div>
        </Panel>

        {can("approvals.manage") && (
          <Panel title="Approval PIN">
            <p className="mb-3 text-sm text-muted-foreground">Cashiers ask for your PIN to approve discounts above their limit, cancellations and refunds. {info.data?.user.pinSet ? "A PIN is set. Saving again replaces it." : "No PIN yet: set one so you can approve at the counter."}</p>
            <div className="space-y-3">
              <Field label="New PIN (4 to 6 digits)" error={errs.pin}><input className={inputCls} type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin.pin} onChange={(e) => setPin({ ...pin, pin: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Your password (to confirm)" error={errs.password}><input className={inputCls} type="password" autoComplete="current-password" value={pin.password} onChange={(e) => setPin({ ...pin, password: e.target.value })} /></Field>
              <Button disabled={busy === "pin" || pin.pin.length < 4} onClick={savePin}>{busy === "pin" && <Loader2 className="animate-spin" />}Save PIN</Button>
            </div>
          </Panel>
        )}

        {me.role === "cashier" && (
          <Panel title="What I can do">
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {CASHIER_TOGGLES.map((t) => { const on = can(t.key); return <li key={t.key} className={`flex items-center gap-2 ${on ? "" : "text-muted-foreground"}`}>{on ? <Check className="size-4 text-emerald-600" /> : <X className="size-4 text-neutral-400" />}{t.label}</li>; })}
            </ul>
            {info.data?.discountPolicy && can("discount.apply") && <p className="mt-3 text-xs text-muted-foreground">Discount limit: {[info.data.discountPolicy.allowPercent && `${info.data.discountPolicy.maxPercent}%`, info.data.discountPolicy.allowFixed && `₹${(info.data.discountPolicy.maxAmount / 100).toFixed(0)}`].filter(Boolean).join(" or ") || "none"}. Above this needs manager approval.</p>}
          </Panel>
        )}
      </div>
    </>
  );
}
