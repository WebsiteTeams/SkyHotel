import mongoose from "mongoose";
import { loadEnvFile } from "node:process";
import assert from "node:assert/strict";
import { FoodItem, InventoryItem, StockMovement, User, Order, Supplier } from "../src/lib/models";
import { loadActor } from "../src/lib/access";
import { createOrder, cancelOrder } from "../src/services/billing";
import { createPurchase, cancelPurchase } from "../src/services/purchases";

try { loadEnvFile(".env.local"); } catch {}
const stock = async (sku: string) => (await InventoryItem.findOne({ sku }))!.currentStock;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const u = (await User.findOne({ role: "super_admin" }))!;
  const s = (await loadActor({ userId: String(u._id), hotelId: String(u.hotel), role: u.role, name: u.name, email: u.email }))!;
  const bir = (await FoodItem.findOne({ name: "Chicken Biryani" }))!;
  const rice0 = await stock("RICE-01"), chk0 = await stock("CHK-01");

  // 1. order of 2 full biryanis deducts 2x recipe, server-priced, with payment
  const key = "test-" + Date.now();
  const input: any = { idempotencyKey: key, type: "dine_in", table: "T1", items: [{ foodId: String(bir._id), variation: "Full", addons: ["Extra Egg"], qty: 2 }], billDiscount: { type: "percent", value: 10 }, payments: [{ method: "cash", amount: 20000 }] };
  const { order } = await createOrder(input, s);
  assert.equal(await stock("RICE-01"), rice0 - 300, "rice deducted 2x150g");
  assert.equal(await stock("CHK-01"), chk0 - 250);
  // gross 2*(22000+2000)=48000; bill disc 10% = 4800; taxable 43200; gst 5% = 2160; total 45360 -> rounds 45400
  assert.equal(order.taxable, 43200); assert.equal(order.gst, 2160); assert.equal(order.grandTotal, 45400);
  assert.equal(order.paymentStatus, "partial"); assert.ok(order.cogs > 0);
  console.log("ok order totals", order.orderNo, order.grandTotal);

  // 2. duplicate submission returns same order, no double deduction
  const again = await createOrder(input, s);
  assert.equal(String(again.order._id), String(order._id)); assert.equal(again.duplicate, true);
  assert.equal(await stock("RICE-01"), rice0 - 300);
  console.log("ok idempotent");

  // 2b. regression: several lines + split payment inside one transaction (needs ordered inserts)
  const tea = (await FoodItem.findOne({ name: "Tea" }))!;
  const multi = (await createOrder({ idempotencyKey: "multi-" + Date.now(), type: "takeaway", items: [{ foodId: String(bir._id), qty: 1, addons: [] }, { foodId: String(tea._id), qty: 2, addons: [] }], payments: [{ method: "cash", amount: 10000 }, { method: "upi", amount: 5000 }] } as any, s)).order;
  assert.equal(multi.paidAmount, 15000);
  await cancelOrder(String(multi._id), "test cleanup", s);
  console.log("ok multi-line + split payment");

  // 3. insufficient stock is blocked, nothing changes
  await assert.rejects(createOrder({ ...input, idempotencyKey: "big-" + Date.now(), items: [{ foodId: String(bir._id), qty: 500, addons: [] }], payments: [] }, s), /Insufficient/);
  assert.equal(await stock("RICE-01"), rice0 - 300);
  console.log("ok insufficient blocked");

  // 4. cancel reverses stock once, refunds payment, writes audit
  await cancelOrder(String(order._id), "customer left", s);
  assert.equal(await stock("RICE-01"), rice0);
  await assert.rejects(cancelOrder(String(order._id), "again", s), /already cancelled/);
  assert.equal(await stock("RICE-01"), rice0);
  const o2 = (await Order.findById(order._id))!; assert.equal(o2.refundedAmount, 20000);
  console.log("ok cancel + reversal");

  // 5. purchase in kg updates stock in grams + avg cost; cancel reverses
  const sup = (await Supplier.findOne())!;
  const rice = (await InventoryItem.findOne({ sku: "RICE-01" }))!;
  const p = await createPurchase({ supplier: String(sup._id), date: "2026-11-17", items: [{ item: String(rice._id), quantity: 10, unit: "kg", rate: 11000 }], discount: 0, tax: 0, charges: 0, paidAmount: 0, method: "cash" } as any, s);
  assert.equal(await stock("RICE-01"), rice0 + 10000);
  const r2 = (await InventoryItem.findOne({ sku: "RICE-01" }))!;
  assert.ok(r2.avgCost > 9 && r2.avgCost < 11, "weighted avg cost per gram (paise)");
  await cancelPurchase(String(p._id), "wrong entry", s);
  assert.equal(await stock("RICE-01"), rice0);
  // 6. every change has a ledger row
  const mv = await StockMovement.countDocuments({ refNo: { $in: [order.orderNo, "CANCEL-" + order.orderNo] } });
  assert.ok(mv >= 10, "ledger rows " + mv);
  // 7. ledger is immutable
  await assert.rejects(StockMovement.deleteMany({}), /immutable/);
  console.log("ALL PASSED");
  await mongoose.disconnect();
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });
