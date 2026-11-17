/**
 * End-to-end RBAC test over HTTP. Needs the app running (npm run build && npx next start -p 3100) and the dev DB.
 *   BASE=http://localhost:3100 npx tsx scripts/test-rbac.ts
 * It creates throw-away users (prefix "rbac-") and a second hotel in the database it is pointed at - use a dev DB.
 */
import mongoose from "mongoose";
import { loadEnvFile } from "node:process";
import assert from "node:assert/strict";
import { Hotel, User, Settings, Order, StockMovement, InventoryItem, AuditLog, CashierShift } from "../src/lib/models";
import { hashPassword } from "../src/lib/auth";

try { loadEnvFile(".env.local"); } catch {}
const BASE = process.env.BASE ?? "http://localhost:3100";
const stamp = Date.now().toString(36);
let passed = 0;
const ok = (name: string) => { passed++; console.log("  ok", name); };

class Client {
  cookie = "";
  constructor(public label: string) {}
  async login(email: string, password: string) {
    const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, `${this.label} login failed`);
    this.cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(BASE + path, { method, redirect: "manual", headers: { cookie: this.cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, data: json?.data, error: json?.error, headers: r.headers, text };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
  put = (p: string, b: unknown) => this.call("PUT", p, b);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const admin = new Client("admin");
  await admin.login(process.env.SEED_ADMIN_EMAIL ?? "admin@skyhotel.com", process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe@123");

  // ---------- setup via the real API ----------
  const mk = async (role: string, name: string, extra: any = {}) => {
    const email = `rbac-${name}-${stamp}@test.dev`;
    const r = await admin.post("/api/staff", { name: `RBAC ${name}`, email, phone: "", role, active: true, password: "Passw0rd!x", ...extra });
    assert.equal(r.status, 200, `create ${name}: ${r.error}`);
    return { id: r.data._id as string, email };
  };
  const A = await mk("cashier", "cashierA"), B = await mk("cashier", "cashierB"), M = await mk("manager", "manager");
  const ca = new Client("cashierA"), cb = new Client("cashierB"), mg = new Client("manager");
  await ca.login(A.email, "Passw0rd!x"); await cb.login(B.email, "Passw0rd!x"); await mg.login(M.email, "Passw0rd!x");
  assert.equal((await mg.put("/api/me/pin", { password: "Passw0rd!x", pin: "4821" })).status, 200);
  ok("accounts created, manager PIN set");

  // keep the shared demo stock topped up so repeated runs do not run out of milk / tea
  for (const [name, qty, unit] of [["Milk", 40, "L"], ["Tea Powder", 2, "kg"]] as const) {
    const it = (await admin.get("/api/inventory?all=1")).data.items.find((i: any) => i.name === name);
    if (it) assert.equal((await admin.post(`/api/inventory/${it._id}/stock`, { direction: "in", quantity: qty, unit, note: "rbac test top-up" })).status, 200);
  }

  // ---------- 1. cashier defaults ----------
  const me = (await ca.get("/api/auth/me")).data;
  assert.ok(me.permissions.includes("bills.create") && me.permissions.includes("pay.cash") && me.permissions.includes("shift.open"));
  for (const p of ["inventory.view", "inventory.manage", "reports.profit", "settings.manage", "billing.cancel", "billing.refund", "billing.view_all", "staff.manage", "pos.price_override"])
    assert.ok(!me.permissions.includes(p), `cashier must not have ${p} by default`);
  ok("cashier default permissions match the spec");

  // ---------- 2. restricted APIs ----------
  const denied: Array<[string, string, unknown?]> = [
    ["GET", "/api/staff"], ["GET", "/api/inventory"], ["POST", "/api/inventory", {}], ["GET", "/api/inventory/movements"], ["GET", "/api/purchases"], ["POST", "/api/purchases", {}],
    ["GET", "/api/suppliers"], ["GET", "/api/expenses"], ["POST", "/api/expenses", {}], ["GET", "/api/reports/profit"], ["GET", "/api/reports/sales"], ["GET", "/api/reports/dashboard"],
    ["PUT", "/api/settings", {}], ["GET", "/api/settings/backup"], ["POST", "/api/food-items", {}], ["POST", "/api/categories", {}], ["GET", "/api/recipes"], ["GET", "/api/audit"],
    ["GET", "/api/approvals"], ["PUT", `/api/staff/${A.id}/permissions`, { permissions: { "inventory.manage": true }, discountPolicy: { allowPercent: true, allowFixed: true, maxPercent: 100, maxAmount: 99999999, requireReason: false } }],
    ["PUT", `/api/staff/${A.id}`, { name: "x", phone: "", role: "super_admin", active: true }], ["POST", "/api/staff", { name: "x", email: "x@x.dev", role: "super_admin", password: "Passw0rd!x" }],
  ];
  for (const [m, p, b] of denied) { const r = await ca.call(m, p, b); assert.equal(r.status, 403, `${m} ${p} should be 403 for cashier, got ${r.status}`); }
  ok(`${denied.length} restricted endpoints return 403 to a cashier (incl. self-escalation)`);
  const st = (await ca.get("/api/settings")).data;
  assert.ok(!st.settings.tax && !st.settings.stock && !st.settings.loyalty && st.settings.tables, "cashier sees only POS settings");
  const food = (await ca.get("/api/food-items?all=1")).data.items;
  assert.ok(food.length && food.every((f: any) => f.cost === undefined), "purchase cost hidden from cashier");
  ok("settings are trimmed and purchase cost is hidden for cashiers");

  // ---------- 3. direct URL access ----------
  for (const path of ["/inventory", "/purchases", "/suppliers", "/expenses", "/reports/profit", "/reports/sales", "/staff", "/settings", "/recipes", "/categories", "/approvals"]) {
    const r = await ca.call("GET", path);
    assert.ok(r.status === 307 || r.status === 308 || /NEXT_REDIRECT/.test(r.text), `page ${path} must redirect a cashier (status ${r.status})`);
    assert.ok(!/<h1[^>]*>(Inventory|Purchases|Settings|Staff)/.test(r.text), `page ${path} must not render`);
  }
  assert.equal((await ca.call("GET", "/pos")).status, 200);
  assert.equal((await ca.call("GET", "/shift")).status, 200);
  ok("direct URLs to restricted pages redirect; POS and Shift pages load");

  // ---------- 4. shift + billing ----------
  const foods = (await admin.get("/api/food-items?all=1")).data.items;
  const tea = foods.find((f: any) => f.name === "Tea");
  assert.ok(tea, "demo data required: run npm run seed:demo");
  const bill = (key: string, extra: any = {}) => ({ idempotencyKey: `${key}-${stamp}`, type: "takeaway", items: [{ foodId: tea._id, qty: 10, addons: [] }], payments: [{ method: "cash", amount: 15800 }], ...extra });
  let r = await ca.post("/api/orders", bill("noshift"));
  assert.equal(r.status, 409, "billing without an open shift must be refused"); assert.match(r.error, /Open your shift/);
  r = await ca.post("/api/shifts", { openingCash: 50000 }); assert.equal(r.status, 200, r.error);
  const shiftId = r.data._id;
  assert.equal((await ca.post("/api/shifts", { openingCash: 1 })).status, 409, "second open shift refused");
  ok("billing requires an open shift; only one open shift per cashier");

  r = await ca.post("/api/orders", bill("b1")); assert.equal(r.status, 200, r.error);
  const order1 = r.data.order;
  assert.equal(order1.grandTotal, 15800); // 150.00 + 5% GST = 157.50, rounded to the rupee assert.equal(String(order1.shift), shiftId);
  assert.equal((await ca.post("/api/orders", bill("b1"))).data.duplicate, true);
  ok("bill created on shift, duplicate submission returns the same bill");

  // client-sent price is ignored/forbidden
  r = await ca.post("/api/orders", bill("price", { items: [{ foodId: tea._id, qty: 1, addons: [], unitPrice: 1 }] }));
  assert.equal(r.status, 403, "price override without permission"); ok("price override blocked without permission");

  // ---------- 5. payment methods ----------
  const base = (await admin.get("/api/staff")).data.find((u: any) => u._id === A.id);
  const pol = { allowPercent: true, allowFixed: true, maxPercent: 10, maxAmount: 10000, requireReason: true };
  assert.equal((await admin.put(`/api/staff/${A.id}/permissions`, { permissions: { "pay.card": false, "pay.split": false }, discountPolicy: pol })).status, 200);
  r = await ca.post("/api/orders", bill("card", { payments: [{ method: "card", amount: 15800 }] })); assert.equal(r.status, 403, "card disabled");
  assert.equal((await ca.get("/api/auth/me")).data.permissions.includes("pay.card"), false, "change applies to the existing session immediately");
  assert.equal((await admin.put(`/api/staff/${A.id}/permissions`, { permissions: {}, discountPolicy: pol })).status, 200);
  r = await ca.post("/api/orders", bill("split", { payments: [{ method: "cash", amount: 5000 }, { method: "upi", amount: 10800 }] })); assert.equal(r.status, 200, r.error);
  ok("per-cashier payment-method toggles enforced server-side and applied instantly");

  // ---------- 6. discount policy ----------
  const disc = (key: string, d: any, extra: any = {}) => bill(key, { billDiscount: d, discountReason: "regular customer", payments: [{ method: "cash", amount: 6000 }], ...extra });
  r = await ca.post("/api/orders", disc("d5", { type: "percent", value: 5 })); assert.equal(r.status, 200, r.error);
  assert.equal(r.data.order.billDiscount, 750); ok("discount within limit accepted");
  r = await ca.post("/api/orders", bill("noreason", { billDiscount: { type: "percent", value: 5 } })); assert.equal(r.status, 400); assert.match(r.error, /reason/i);
  r = await ca.post("/api/orders", disc("d30", { type: "percent", value: 30 })); assert.equal(r.status, 403); assert.equal(r.json.details.code, "APPROVAL_REQUIRED");
  r = await ca.post("/api/orders", disc("d30x", { type: "percent", value: 30 }, { approval: { managerEmail: M.email, pin: "0000" } })); assert.equal(r.status, 403, "wrong PIN");
  r = await ca.post("/api/orders", disc("d30y", { type: "percent", value: 30 }, { approval: { managerEmail: A.email, pin: "4821" } })); assert.equal(r.status, 403, "cashier is not an approver");
  r = await ca.post("/api/orders", disc("d30ok", { type: "percent", value: 30 }, { approval: { managerEmail: M.email, pin: "4821" } })); assert.equal(r.status, 200, r.error);
  assert.equal(String(r.data.order.discountApprovedBy), M.id); assert.equal(r.data.order.billDiscount, 4500);
  const approvedOrder = r.data.order;
  ok("discount over limit needs manager PIN; approver and reason recorded");
  assert.equal((await admin.put(`/api/staff/${A.id}/permissions`, { permissions: { "discount.apply": false }, discountPolicy: pol })).status, 200);
  r = await ca.post("/api/orders", disc("dnone", { type: "percent", value: 1 })); assert.equal(r.status, 403, "discounts disabled");
  const prev = await ca.post("/api/orders/preview", { items: [{ foodId: tea._id, qty: 1, addons: [] }], billDiscount: { type: "percent", value: 1 } });
  assert.ok(prev.data.discount.issues.length, "preview reports the violation");
  assert.equal((await admin.put(`/api/staff/${A.id}/permissions`, { permissions: {}, discountPolicy: pol })).status, 200);
  ok("'no discount' mode blocks all discounts");

  // ---------- 7. cancellation / refund approval ----------
  assert.equal((await ca.post(`/api/orders/${order1._id}/cancel`, { reason: "nope" })).status, 403, "no direct cancel");
  assert.equal((await ca.post(`/api/orders/${order1._id}/refund`, { amount: 100, method: "cash", reason: "nope" })).status, 403, "no direct refund");
  r = await ca.post(`/api/orders/${order1._id}/request`, { type: "cancel_bill", reason: "customer left" }); assert.equal(r.status, 200, r.error);
  assert.equal(r.data.executed, false); const reqId = r.data.request._id;
  assert.equal((await ca.post(`/api/orders/${order1._id}/request`, { type: "cancel_bill", reason: "again" })).status, 409, "duplicate pending request");
  assert.equal((await ca.post(`/api/approvals/${reqId}`, { decision: "approve" })).status, 403, "cashier cannot approve");
  assert.equal((await Order.findById(order1._id))!.status, "confirmed");
  r = await mg.post(`/api/approvals/${reqId}`, { decision: "approve", note: "ok" }); assert.equal(r.status, 200, r.error);
  const cancelled = (await Order.findById(order1._id))!;
  assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.refundedAmount, 15800);
  assert.equal((await mg.post(`/api/approvals/${reqId}`, { decision: "approve" })).status, 409, "cannot decide twice");
  const mv = await StockMovement.countDocuments({ refNo: `CANCEL-${cancelled.orderNo}` }); assert.ok(mv >= 2, "stock reversed");
  const log = await AuditLog.findOne({ action: "bill.cancel", entityId: order1._id }); assert.equal(String(log!.approvedBy), M.id); assert.equal(log!.reason, "customer left");
  ok("cancellation: request -> manager approves -> stock reversed, refund recorded, audit has approver + reason");

  r = await ca.post(`/api/orders/${approvedOrder._id}/request`, { type: "refund", reason: "item wrong", amount: 5000, method: "cash", approval: { managerEmail: M.email, pin: "4821" } });
  assert.equal(r.status, 200, r.error); assert.equal(r.data.executed, true);
  assert.equal((await Order.findById(approvedOrder._id))!.refundedAmount, 5000);
  r = await ca.post(`/api/orders/${approvedOrder._id}/request`, { type: "refund", reason: "wrong pin attempt", amount: 500, method: "cash", approval: { managerEmail: M.email, pin: "9999" } }); assert.equal(r.status, 403, `wrong PIN: ${r.error}`);
  ok("refund approved on the spot with manager PIN; wrong PIN refused");

  // ---------- 8. cross-cashier isolation ----------
  assert.equal((await cb.get(`/api/orders/${approvedOrder._id}`)).status, 404, "B cannot open A's bill");
  assert.equal((await cb.get("/api/orders?limit=100")).data.items.length, 0, "B's list is empty");
  assert.equal((await cb.post(`/api/orders/${approvedOrder._id}/reprint`)).status, 404);
  assert.equal((await cb.post(`/api/orders/${approvedOrder._id}/request`, { type: "cancel_bill", reason: "sneaky" })).status, 404);
  assert.equal((await cb.post(`/api/orders/${approvedOrder._id}/payments`, { method: "cash", amount: 100 })).status, 404);
  assert.equal((await cb.get(`/api/shifts/${shiftId}`)).status, 404, "B cannot read A's shift");
  assert.equal((await cb.get("/api/shifts")).data.items.length, 0);
  assert.equal((await admin.put(`/api/staff/${B.id}/permissions`, { permissions: { "billing.view_all": true }, discountPolicy: pol })).status, 200);
  assert.ok((await cb.get("/api/orders?limit=100")).data.items.length > 0, "view-all grants access");
  assert.equal((await cb.get(`/api/orders/${approvedOrder._id}`)).status, 200);
  assert.equal((await admin.put(`/api/staff/${B.id}/permissions`, { permissions: {}, discountPolicy: pol })).status, 200);
  assert.equal((await cb.get(`/api/orders/${approvedOrder._id}`)).status, 404);
  ok("cashiers cannot read each other's bills / shifts; view-all toggle works");

  // ---------- 9. shift close ----------
  const live = (await ca.get("/api/shifts/current")).data;
  const cashSales = live.totalCashSales, cashRef = live.cashRefunds;
  assert.equal(live.totalUPISales, 10800, "UPI tracked separately");
  assert.equal(live.expectedClosingCash, 50000 + cashSales - cashRef);
  assert.equal((await cb.post(`/api/shifts/${shiftId}/close`, { actualClosingCash: 0 })).status, 403, "B cannot close A's shift");
  r = await ca.post(`/api/shifts/${shiftId}/close`, { actualClosingCash: live.expectedClosingCash - 200, notes: "short" }); assert.equal(r.status, 200, r.error);
  assert.equal(r.data.cashDifference, -200); assert.equal(r.data.status, "closed");
  assert.equal((await ca.post(`/api/shifts/${shiftId}/close`, { actualClosingCash: 1 })).status, 409, "no double close");
  assert.equal((await ca.post("/api/orders", bill("after-close"))).status, 409, "no billing after the shift closes");
  ok(`shift close: expected ${live.expectedClosingCash / 100}, difference -2.00, double close + billing after close refused`);

  // ---------- 10. privilege escalation / identity ----------
  assert.equal((await admin.put(`/api/staff/${A.id}/permissions`, { permissions: { "staff.manage": true }, discountPolicy: pol })).status, 400, "staff.manage can never be granted");
  assert.equal((await admin.put(`/api/staff/${M.id}/permissions`, { permissions: {}, discountPolicy: pol })).status, 400, "overrides are cashier-only");
  assert.equal((await mg.get("/api/staff")).status, 403, "manager cannot manage staff");
  assert.equal((await mg.get("/api/settings/backup")).status, 403);
  ok("privilege escalation attempts refused");

  // ---------- 11. cross-hotel isolation ----------
  const h2 = await Hotel.create({ name: `Other Hotel ${stamp}` });
  await Settings.create({ hotel: h2._id });
  await User.create({ hotel: h2._id, name: "Other Admin", email: `rbac-h2admin-${stamp}@test.dev`, role: "hotel_admin", passwordHash: await hashPassword("Passw0rd!x") });
  await User.create({ hotel: h2._id, name: "Other Cashier", email: `rbac-h2cash-${stamp}@test.dev`, role: "cashier", passwordHash: await hashPassword("Passw0rd!x") });
  const a2 = new Client("admin2"), c2 = new Client("cashier2");
  await a2.login(`rbac-h2admin-${stamp}@test.dev`, "Passw0rd!x"); await c2.login(`rbac-h2cash-${stamp}@test.dev`, "Passw0rd!x");
  assert.equal((await a2.get(`/api/orders/${approvedOrder._id}`)).status, 404);
  assert.equal((await a2.get("/api/orders")).data.items.length, 0);
  assert.equal((await a2.get("/api/inventory")).data.items.length, 0);
  assert.ok(!(await a2.get("/api/staff")).data.some((u: any) => String(u.email).includes("cashierA")), "staff list is per hotel");
  assert.equal((await a2.get(`/api/shifts/${shiftId}`)).status, 404);
  assert.equal((await a2.put(`/api/staff/${A.id}/permissions`, { permissions: {}, discountPolicy: pol })).status, 404, "cannot edit another hotel's cashier");
  assert.equal((await a2.post(`/api/approvals/${reqId}`, { decision: "approve" })).status, 404, "cannot decide another hotel's request");
  assert.equal((await a2.post(`/api/orders/${approvedOrder._id}/cancel`, { reason: "cross hotel" })).status, 404);
  assert.equal((await Order.findById(approvedOrder._id))!.status, "confirmed");
  await c2.post("/api/shifts", { openingCash: 0 });
  const tea2 = await c2.get("/api/food-items?all=1"); assert.equal(tea2.data.items.length, 0, "no menu leakage");
  r = await c2.post("/api/orders", { idempotencyKey: `x-${stamp}`, type: "takeaway", items: [{ foodId: tea._id, qty: 1, addons: [] }], billDiscount: { type: "percent", value: 90 }, discountReason: "x", approval: { managerEmail: M.email, pin: "4821" }, payments: [] });
  assert.ok([400, 403].includes(r.status), `cross-hotel food/approver must fail (${r.status})`);
  ok("cross-hotel isolation: orders, stock, staff, shifts, approvals, menu and manager PINs");

  // ---------- 12. deactivation is immediate ----------
  assert.equal((await admin.put(`/api/staff/${B.id}`, { name: "RBAC cashierB", phone: "", role: "cashier", active: false })).status, 200);
  assert.equal((await cb.get("/api/auth/me")).status, 401, "deactivated user's existing session stops working at once");
  ok("deactivating a cashier ends their session immediately");

  // cleanup of the throw-away second hotel data (users stay deactivated)
  await User.deleteMany({ hotel: h2._id }); await Settings.deleteMany({ hotel: h2._id }); await Hotel.deleteOne({ _id: h2._id });
  await User.updateMany({ email: { $regex: `^rbac-.*-${stamp}@test.dev$` } }, { active: false, deletedAt: new Date() });
  void InventoryItem; void CashierShift;
  console.log(`\nRBAC PASSED (${passed} groups)`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error("\nFAILED:", e.message ?? e); process.exit(1); });
