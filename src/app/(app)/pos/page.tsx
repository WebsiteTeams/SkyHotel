"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgePercent, Check, Lock, Loader2, Minus, Plus, Printer, Search, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, Field, Modal, VegMark, inputCls, rupees, toPaise, Loading, ErrorBox } from "@/components/kit";
import { useCan, useSession } from "@/components/session";
import { Receipt, printReceipt, type Paper } from "@/components/receipt";
import { api, useApi, useDebounced } from "@/lib/client";
import { normalizePhone } from "@/lib/phone";
import { fmtINR } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Line { key: string; food: any; variation?: string; addons: string[]; qty: number; notes: string; discType: "percent" | "amount"; discValue: string; price: string; open?: boolean }
const METHODS = ["cash", "upi", "card"] as const;
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)) + Date.now();

export default function POS() {
  const foods = useApi<any>("/api/food-items?all=1&available=true");
  const cats = useApi<any[]>("/api/categories");
  const settings = useApi<any>("/api/settings");
  const can = useCan();
  const session = useSession();
  const meInfo = useApi<any>("/api/auth/me");
  const policy = meInfo.data?.discountPolicy;
  const shiftQ = useApi<any>("/api/shifts/current");
  const needShift = session.role === "cashier" && can("shift.open");
  const methods = METHODS.filter((m) => can(`pay.${m}` as any));
  const [discReason, setDiscReason] = useState("");
  const [view, setView] = useState<"menu" | "order">("menu"); // below lg only one panel is shown at a time
  const [cat, setCat] = useState(""), [q, setQ] = useState("");
  const dq = useDebounced(q, 150);
  const [lines, setLines] = useState<Line[]>([]);
  const [type, setType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [table, setTable] = useState(""), [custName, setCustName] = useState(""), [custPhone, setCustPhone] = useState("");
  const [billDisc, setBillDisc] = useState<{ type: "percent" | "amount"; value: string }>({ type: "percent", value: "" });
  const [pick, setPick] = useState<any>(null); // item awaiting variation/add-on choice
  const [pay, setPay] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [totals, setTotals] = useState<any>(null);
  const [priceErr, setPriceErr] = useState("");
  const phone10 = normalizePhone(custPhone);
  const [known, setKnown] = useState<any>(null);
  useEffect(() => {
    if (!phone10) { setKnown(null); return; }
    let live = true;
    api(`/api/customers/lookup?phone=${phone10}`).then((r) => { if (!live) return; setKnown(r); if (r.customer?.name) setCustName((n) => n || r.customer.name); }).catch(() => {});
    return () => { live = false; };
  }, [phone10]);

  const items = useMemo(() => (foods.data?.items ?? []).filter((f: any) => (!cat || (f.category?._id ?? f.category) === cat) && (!dq || f.name.toLowerCase().includes(dq.toLowerCase()))), [foods.data, cat, dq]);

  const payloadItems = useCallback(() => lines.map((l) => ({
    foodId: l.food._id, variation: l.variation, addons: l.addons, qty: l.qty, notes: l.notes || undefined,
    discount: Number(l.discValue) > 0 ? { type: l.discType, value: l.discType === "amount" ? toPaise(l.discValue) : Number(l.discValue) } : undefined,
    unitPrice: can("pos.price_override") && l.price !== "" ? toPaise(l.price) : undefined,
  })), [lines, can]);
  const billDiscount = Number(billDisc.value) > 0 ? { type: billDisc.type, value: billDisc.type === "amount" ? toPaise(billDisc.value) : Number(billDisc.value) } : undefined;

  // Totals always come from the server so the cashier sees exactly what will be billed.
  const sig = JSON.stringify([payloadItems(), billDiscount, phone10]);
  const seq = useRef(0);
  useEffect(() => {
    if (!lines.length) { setTotals(null); setPriceErr(""); return; }
    const my = ++seq.current;
    const t = setTimeout(() => {
      api("/api/orders/preview", { body: { items: payloadItems(), billDiscount, customerPhone: phone10 || undefined } })
        .then((r) => { if (my === seq.current) { setTotals(r); setPriceErr(""); } })
        .catch((e) => { if (my === seq.current) setPriceErr(e.message); });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const add = (food: any, variation?: string, addons: string[] = []) => {
    setLines((ls) => {
      const same = ls.find((l) => l.food._id === food._id && l.variation === variation && l.addons.join() === addons.join() && !l.notes && !l.discValue && !l.price);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: newKey(), food, variation, addons, qty: 1, notes: "", discType: "percent", discValue: "", price: "" }];
    });
  };
  const tap = (f: any) => (f.variations.length || f.addons.length ? setPick({ food: f, variation: f.variations[0]?.name, addons: [] as string[] }) : add(f));
  const upd = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const clear = () => { setLines([]); setBillDisc({ type: "percent", value: "" }); setDiscReason(""); setTable(""); setCustName(""); setCustPhone(""); setKnown(null); setTotals(null); };

  const tables = Array.from({ length: settings.data?.settings?.tables ?? 20 }, (_, i) => String(i + 1));
  const disc = totals?.discount;
  const issues: string[] = disc?.issues ?? [];
  const needReason = !!disc?.hasManual && (disc.reasonRequired || issues.length > 0);
  const canPay = lines.length > 0 && !!totals && !priceErr && (type !== "dine_in" || !!table) && (!needReason || discReason.trim().length >= 3);

  // Cashiers who must run a drawer shift cannot bill until one is open (the server enforces this too).
  if (needShift && !shiftQ.loading && !shiftQ.data) {
    return <ShiftGate onOpened={shiftQ.reload} />;
  }

  return (
    <div className="grid h-[calc(100dvh-9.5rem)] min-h-[380px] grid-rows-[minmax(0,1fr)] gap-3 lg:h-[calc(100dvh-5.5rem)] lg:min-h-[560px] lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px]">
      {/* ---- Menu ---- */}
      <section className={cn("min-h-0 flex-col rounded-2xl border border-border bg-card lg:flex", view === "menu" ? "flex" : "hidden")}>
        <div className="space-y-3 border-b border-border p-3">
          <div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><input className={inputCls + " h-11 pl-9 text-base"} placeholder="Search food items…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{ _id: "", name: "All" }, ...(cats.data?.filter((c) => c.active) ?? [])].map((c) => (
              <button key={c._id} onClick={() => setCat(c._id)} className={cn("h-10 shrink-0 rounded-full px-4 text-sm font-medium transition", cat === c._id ? "bg-primary text-white" : "bg-muted text-neutral-700 hover:bg-orange-100")}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {foods.loading && !foods.data && <Loading rows={5} />}
          {foods.error && <ErrorBox message={foods.error} onRetry={foods.reload} />}
          {foods.data && items.length === 0 && <Empty title="No items found" hint={foods.data.items.length ? "Try a different search or category." : "Add food items from the Food Items page."} />}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((f: any) => (
              <button key={f._id} onClick={() => tap(f)} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-white text-left transition hover:border-primary hover:shadow-md active:scale-[0.98]">
                <div className="relative aspect-[4/3] w-full bg-secondary">
                  {f.image ? <img src={f.image} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-3xl font-semibold text-orange-300">{f.name[0]}</div>}
                  <span className="absolute left-2 top-2 rounded bg-white/90 p-0.5"><VegMark type={f.type} /></span>
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 min-h-10 text-sm font-medium leading-tight">{f.name}</p>
                  <p className="mt-1 flex items-center justify-between text-sm"><span className="font-semibold text-orange-700">{fmtINR(f.variations.length ? Math.min(...f.variations.map((v: any) => v.price)) : f.price)}{f.variations.length > 0 && "+"}</span><Plus className="size-5 rounded-full bg-primary p-1 text-white" /></p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Current order ---- */}
      <section className={cn("min-h-0 flex-col rounded-2xl border border-border bg-card lg:flex", view === "order" ? "flex" : "hidden")}>
        <div className="space-y-3 border-b border-border p-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {([["dine_in", "Dine-in"], ["takeaway", "Takeaway"], ["delivery", "Delivery"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setType(k)} className={cn("h-10 rounded-lg text-sm font-medium", type === k ? "bg-white text-orange-700 shadow-sm" : "text-neutral-600")}>{l}</button>
            ))}
          </div>
          {type === "dine_in" && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Select table">
              {tables.map((t) => <button key={t} onClick={() => setTable(t)} className={cn("size-10 shrink-0 rounded-lg border text-sm font-medium", table === t ? "border-primary bg-primary text-white" : "border-border bg-white hover:border-primary")}>{t}</button>)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Customer mobile" inputMode="tel" maxLength={14} aria-label="Customer mobile number" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
            <input className={inputCls} placeholder="Customer name" aria-label="Customer name" value={custName} onChange={(e) => setCustName(e.target.value)} />
          </div>
          {custPhone.trim() && !phone10 && <p className="-mt-1 text-xs text-red-600">Enter a valid 10-digit mobile number</p>}
          {phone10 && known && (
            known.eligible ? (
              <p className="-mt-1 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"><BadgePercent className="size-4 shrink-0" />Repeat customer · {known.customer?.visits} visits · {known.percent}% discount applied</p>
            ) : known.rule?.enabled ? (
              <p className="-mt-1 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{known.customer ? `${known.customer.visits} visit(s) so far` : "New customer"} · {known.visitsToGo} more visit(s) to unlock {known.rule.percent}% off</p>
            ) : null
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {lines.length === 0 ? <Empty title="Order is empty" hint="Tap items on the left to add them." /> : (
            <ul className="divide-y divide-border">
              {lines.map((l, idx) => (
                <li key={l.key} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium"><VegMark type={l.food.type} /><span className="truncate">{l.food.name}{l.variation && ` · ${l.variation}`}</span></p>
                      {l.addons.length > 0 && <p className="text-xs text-muted-foreground">+ {l.addons.join(", ")}</p>}
                      {l.notes && <p className="text-xs italic text-muted-foreground">“{l.notes}”</p>}
                    </div>
                    <p className="tabular-nums text-sm font-semibold">{totals?.lines[idx] ? fmtINR(totals.lines[idx].gross - totals.lines[idx].discount) : "…"}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-border">
                      <button aria-label="Decrease" className="grid size-10 place-items-center hover:bg-muted" onClick={() => (l.qty > 1 ? upd(l.key, { qty: l.qty - 1 }) : setLines((ls) => ls.filter((x) => x.key !== l.key)))}><Minus className="size-4" /></button>
                      <span className="w-9 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                      <button aria-label="Increase" className="grid size-10 place-items-center hover:bg-muted" onClick={() => upd(l.key, { qty: l.qty + 1 })}><Plus className="size-4" /></button>
                    </div>
                    <button className={cn("grid size-10 place-items-center rounded-lg border", l.open ? "border-primary text-primary" : "border-border text-muted-foreground")} aria-label="Note and discount" onClick={() => upd(l.key, { open: !l.open })}><StickyNote className="size-4" /></button>
                    <button aria-label="Remove" className="ml-auto grid size-10 place-items-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></button>
                  </div>
                  {l.open && (
                    <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                      <input className={inputCls} placeholder="Note (e.g. less spicy)" value={l.notes} onChange={(e) => upd(l.key, { notes: e.target.value })} />
                      {can("pos.price_override") && <input className={inputCls + " col-span-2"} type="number" min="0" step="0.01" placeholder={`Override unit price ₹ (list ${(l.food.price / 100).toFixed(2)})`} value={l.price} onChange={(e) => upd(l.key, { price: e.target.value })} />}
                      <div className="flex gap-1"><input className={inputCls + " w-20"} type="number" min="0" placeholder="Disc." value={l.discValue} onChange={(e) => upd(l.key, { discValue: e.target.value })} />
                        <select className={inputCls + " w-16 px-1"} value={l.discType} onChange={(e) => upd(l.key, { discType: e.target.value as any })}><option value="percent">%</option><option value="amount">₹</option></select></div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-border p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Bill discount</span>
            <input className={inputCls + " ml-auto w-24"} type="number" min="0" value={billDisc.value} onChange={(e) => setBillDisc({ ...billDisc, value: e.target.value })} placeholder="0" />
            <select className={inputCls + " w-16 px-1"} value={billDisc.type} onChange={(e) => setBillDisc({ ...billDisc, type: e.target.value as any })}><option value="percent">%</option><option value="amount">₹</option></select>
          </div>
          {session.role === "cashier" && policy && (
            <p className="text-xs text-muted-foreground">{can("discount.apply") && (policy.allowPercent || policy.allowFixed) ? `Your limit: ${[policy.allowPercent && `${policy.maxPercent}%`, policy.allowFixed && `₹${(policy.maxAmount / 100).toFixed(0)}`].filter(Boolean).join(" or ")}. Above that needs a manager.` : "Discounts need manager approval."}</p>
          )}
          {issues.length > 0 && <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><Lock className="mt-0.5 size-3.5 shrink-0" />Manager approval needed: {issues.join(". ")}</p>}
          {disc?.hasManual && <input className={inputCls} placeholder="Reason for discount (required)" value={discReason} onChange={(e) => setDiscReason(e.target.value)} aria-label="Discount reason" />}
          {priceErr && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{priceErr}</p>}
          {totals && (
            <dl className="space-y-1 tabular-nums">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{fmtINR(totals.subtotal)}</dd></div>
              {totals.itemDiscount + totals.billDiscount > 0 && <div className="flex justify-between text-emerald-700"><dt>{totals.loyalty?.applied ? `Discounts (incl. ${totals.loyalty.percent}% repeat customer)` : "Discounts"}</dt><dd>-{fmtINR(totals.itemDiscount + totals.billDiscount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd>{fmtINR(totals.gst)}</dd></div>
              {totals.roundOff !== 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Round off</dt><dd>{(totals.roundOff / 100).toFixed(2)}</dd></div>}
              <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold"><dt>Total</dt><dd>{fmtINR(totals.grandTotal)}</dd></div>
            </dl>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="outline" size="lg" className="h-12" disabled={!lines.length} onClick={clear}><X />Clear</Button>
            <Button size="lg" className="h-12 text-base" disabled={!canPay} onClick={() => setPay(true)}>{type === "dine_in" && !table && lines.length ? "Select a table" : needReason && discReason.trim().length < 3 ? "Enter discount reason" : "Charge"}</Button>
          </div>
        </div>
      </section>

      {/* ---- Variation / add-on chooser ---- */}
      <Modal open={!!pick} onClose={() => setPick(null)} title={pick?.food.name ?? ""}
        footer={<Button className="h-11 w-full" onClick={() => { add(pick.food, pick.variation, pick.addons); setPick(null); }}>Add to order</Button>}>
        {pick && (
          <div className="space-y-5">
            {pick.food.variations.length > 0 && (
              <div><p className="mb-2 text-sm font-medium">Choose size</p><div className="grid grid-cols-2 gap-2">
                {pick.food.variations.map((v: any) => <button key={v.name} onClick={() => setPick({ ...pick, variation: v.name })} className={cn("h-14 rounded-xl border text-sm font-medium", pick.variation === v.name ? "border-primary bg-secondary text-orange-700" : "border-border")}>{v.name}<br /><span className="text-xs font-normal text-muted-foreground">{fmtINR(v.price)}</span></button>)}
              </div></div>
            )}
            {pick.food.addons.length > 0 && (
              <div><p className="mb-2 text-sm font-medium">Add-ons</p><div className="grid grid-cols-2 gap-2">
                {pick.food.addons.map((a: any) => { const on = pick.addons.includes(a.name); return (
                  <button key={a.name} onClick={() => setPick({ ...pick, addons: on ? pick.addons.filter((x: string) => x !== a.name) : [...pick.addons, a.name] })} className={cn("flex h-14 items-center justify-between rounded-xl border px-3 text-sm font-medium", on ? "border-primary bg-secondary text-orange-700" : "border-border")}>
                    <span>{a.name}<br /><span className="text-xs font-normal text-muted-foreground">+{fmtINR(a.price)}</span></span>{on && <Check className="size-4" />}</button>); })}
              </div></div>
            )}
          </div>
        )}
      </Modal>

      {/* Phone / tablet-portrait switcher */}
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-border bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden print:hidden">
        <button onClick={() => setView("menu")} className={cn("h-12 rounded-xl text-sm font-semibold", view === "menu" ? "bg-primary text-white" : "bg-muted text-neutral-700")}>Menu</button>
        <button onClick={() => setView("order")} className={cn("flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold", view === "order" ? "bg-primary text-white" : "bg-muted text-neutral-700")}>
          Order{lines.length > 0 && <span className={cn("rounded-full px-2 py-0.5 text-xs", view === "order" ? "bg-white/25" : "bg-primary text-white")}>{lines.reduce((s, l) => s + l.qty, 0)}</span>}
          {totals && <span className="tabular-nums">{fmtINR(totals.grandTotal)}</span>}
        </button>
      </div>

      <PaymentModal open={pay} onClose={() => setPay(false)} total={totals?.grandTotal ?? 0} methods={methods} canSplit={can("pay.split")} needsApproval={issues.length > 0} issues={issues}
        onConfirm={async (payments, approval) => {
          const res = await api("/api/orders", { body: { idempotencyKey: confirmKey.current, type, table: type === "dine_in" ? table : undefined, customerName: custName || undefined, customerPhone: phone10 || undefined, items: payloadItems(), billDiscount, discountReason: disc?.hasManual ? discReason.trim() : undefined, approval, payments } });
          if (res.duplicate) toast.info("This bill was already created");
          const full = await api(`/api/orders/${res.order._id}`);
          confirmKey.current = newKey();
          setPay(false); setDone(full); clear(); setView("menu"); foods.reload();
        }} keyRef={confirmKey} />

      <Modal open={!!done} onClose={() => setDone(null)} title={`Bill ${done?.order.orderNo ?? ""} created`}
        footer={<><Button variant="outline" onClick={() => setDone(null)}>New order</Button><Button onClick={() => printReceipt((done?.invoice?.snapshot.paperSize ?? "80mm") as Paper)}><Printer />Print</Button></>}>
        {done && <div className="flex justify-center overflow-x-auto bg-neutral-100 p-3"><Receipt snapshot={done.invoice.snapshot} payments={done.payments} paper={done.invoice.snapshot.paperSize} /></div>}
      </Modal>
    </div>
  );
}

// One idempotency key per bill attempt: retries / double taps can never create two bills.
const confirmKey = { current: newKey() };

function PaymentModal({ open, onClose, total, methods, canSplit, needsApproval, issues, onConfirm }: {
  open: boolean; onClose: () => void; total: number; methods: Array<(typeof METHODS)[number]>; canSplit: boolean; needsApproval: boolean; issues: string[];
  onConfirm: (p: any[], approval?: { managerEmail: string; pin: string }) => Promise<void>; keyRef?: { current: string };
}) {
  const first = methods[0] ?? "cash";
  const [rows, setRows] = useState<Array<{ method: (typeof METHODS)[number]; amount: string; reference: string }>>([{ method: first, amount: "", reference: "" }]);
  const [tendered, setTendered] = useState("");
  const [mgr, setMgr] = useState({ email: "", pin: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setRows([{ method: first, amount: rupees(total), reference: "" }]); setTendered(""); setErr(""); setMgr({ email: "", pin: "" }); } }, [open, total, first]);
  const paid = rows.reduce((s, r) => s + toPaise(r.amount), 0);
  const due = total - paid;
  const cash = rows.find((r) => r.method === "cash");
  const change = tendered && cash ? Math.max(0, toPaise(tendered) - toPaise(cash.amount)) : 0;
  const shortCash = !!tendered && !!cash && toPaise(tendered) < toPaise(cash.amount);

  const submit = async () => {
    if (busy) return;
    if (needsApproval && (!mgr.email || mgr.pin.length < 4)) return setErr("Enter the manager's email and PIN to approve this discount");
    if (shortCash) return setErr("Cash received is less than the cash amount");
    setBusy(true); setErr("");
    try {
      await onConfirm(
        rows.filter((r) => toPaise(r.amount) > 0).map((r) => ({ method: r.method, amount: toPaise(r.amount), reference: r.reference || undefined, tendered: r.method === "cash" && tendered ? toPaise(tendered) : undefined })),
        needsApproval ? { managerEmail: mgr.email.trim(), pin: mgr.pin } : undefined,
      );
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Take payment"
      footer={<Button className="h-12 w-full text-base" disabled={busy || paid > total || methods.length === 0} onClick={submit}>{busy && <Loader2 className="animate-spin" />}{paid === 0 ? "Create bill (unpaid)" : due > 0 ? `Create bill · ${fmtINR(due)} due` : "Confirm payment"}</Button>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-secondary p-4 text-center"><p className="text-xs uppercase tracking-wide text-orange-700">Amount to pay</p><p className="text-3xl font-semibold tabular-nums">{fmtINR(total)}</p></div>
        {methods.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">You have no payment methods enabled. Ask the Hotel Admin.</p>}
        {rows.map((r, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, methods.length)}, minmax(0, 1fr))` }}>
              {methods.map((m) => <button key={m} onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, method: m } : x)))} className={cn("h-11 rounded-lg border text-sm font-medium capitalize", r.method === m ? "border-primary bg-secondary text-orange-700" : "border-border")}>{m}</button>)}
            </div>
            <div className="flex gap-2">
              <input className={inputCls + " h-11 text-base"} type="number" min="0" step="0.01" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="Amount" />
              {r.method !== "cash" && <input className={inputCls + " h-11"} placeholder="Ref / last 4" value={r.reference} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} />}
              {rows.length > 1 && <button aria-label="Remove payment" className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>}
            </div>
          </div>
        ))}
        {canSplit && methods.length > 1 && rows.length < 3 && <button className="text-sm font-medium text-primary" onClick={() => setRows([...rows, { method: methods.find((m) => m !== rows[0].method) ?? methods[0], amount: due > 0 ? rupees(due) : "", reference: "" }])}>+ Split payment</button>}
        {cash && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>Cash received<input className={inputCls + " mt-1"} type="number" min="0" value={tendered} onChange={(e) => setTendered(e.target.value)} /></label>
            <div className="rounded-lg bg-muted p-2 text-center"><p className="text-xs text-muted-foreground">Change to return</p><p className="text-lg font-semibold tabular-nums">{fmtINR(change)}</p></div>
          </div>
        )}
        {needsApproval && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-900"><Lock className="size-4" />Manager approval</p>
            <p className="text-xs text-amber-900">{issues.join(". ")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="email" placeholder="Manager email" autoComplete="off" value={mgr.email} onChange={(e) => setMgr({ ...mgr, email: e.target.value })} aria-label="Manager email" />
              <input className={inputCls} type="password" inputMode="numeric" maxLength={6} placeholder="PIN" autoComplete="off" value={mgr.pin} onChange={(e) => setMgr({ ...mgr, pin: e.target.value.replace(/\D/g, "") })} aria-label="Manager PIN" />
            </div>
          </div>
        )}
        {paid > total && <p className="text-sm text-red-600">Payments exceed the bill total.</p>}
        {due > 0 && paid > 0 && <p className="text-sm text-orange-700">Partial payment: {fmtINR(due)} will stay due on this bill.</p>}
        {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>
    </Modal>
  );
}

function ShiftGate({ onOpened }: { onOpened: () => void }) {
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = async () => {
    setBusy(true); setErr("");
    try { await api("/api/shifts", { body: { openingCash: toPaise(cash || 0) } }); toast.success("Shift opened"); onOpened(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Open your shift</h1>
      <p className="mt-1 text-sm text-muted-foreground">Count the cash in your drawer and enter it to start billing.</p>
      <div className="mt-5"><Field label="Opening cash (₹)"><input className={inputCls + " h-12 text-lg"} type="number" min="0" step="0.01" autoFocus value={cash} onChange={(e) => setCash(e.target.value)} /></Field></div>
      {err && <p role="alert" className="mt-3 text-sm text-red-600">{err}</p>}
      <Button className="mt-5 h-12 w-full text-base" disabled={busy} onClick={open}>{busy && <Loader2 className="animate-spin" />}Open shift &amp; start billing</Button>
    </div>
  );
}
