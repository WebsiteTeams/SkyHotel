import mongoose from "mongoose";
import { loadEnvFile } from "node:process";
import assert from "node:assert/strict";
import { FoodItem, User, Customer, Order } from "../src/lib/models";
import { loadActor } from "../src/lib/access";
import { createOrder, cancelOrder } from "../src/services/billing";
try { loadEnvFile(".env.local"); } catch {}
async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const u = (await User.findOne({ role: "super_admin" }))!;
  const s = (await loadActor({ userId: String(u._id), hotelId: String(u.hotel), role: u.role, name: u.name, email: u.email }))!;
  const tea = (await FoodItem.findOne({ name: "Tea" }))!;
  const phone = "9" + String(Date.now()).slice(-9);
  const mk = (n: number) => ({ idempotencyKey: `loy-${phone}-${n}`, type: "takeaway", customerName: "Ravi", customerPhone: "+91 " + phone, items: [{ foodId: String(tea._id), qty: 10, addons: [] }], payments: [] } as any);
  const b1 = (await createOrder(mk(1), s)).order, b2 = (await createOrder(mk(2), s)).order;
  assert.equal(b1.billDiscount, 0); assert.equal(b2.billDiscount, 0);          // visits 0 and 1: no discount yet
  const b3 = (await createOrder(mk(3), s)).order;                               // 3rd visit: 5% off 15000
  assert.equal(b3.billDiscount, 750); assert.equal(b3.loyaltyPercent, 5);
  assert.equal(b3.customerPhone, phone);
  assert.equal((await Customer.findOne({ phone }))!.visits, 3);
  await cancelOrder(String(b3._id), "test", s);
  assert.equal((await Customer.findOne({ phone }))!.visits, 2);                 // cancel undoes the visit
  await assert.rejects(createOrder({ ...mk(9), customerPhone: "12345" }, s), /valid 10-digit/);
  // manual bigger discount wins, no stacking
  const b4 = (await createOrder({ ...mk(4), billDiscount: { type: "percent", value: 20 } }, s)).order;
  assert.equal(b4.billDiscount, 3000); assert.equal(b4.loyaltyPercent, 0);
  console.log("LOYALTY PASSED");
  await mongoose.disconnect();
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });
