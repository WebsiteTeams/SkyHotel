import { z } from "zod";
import type { Types } from "mongoose";
import { atomic } from "@/lib/atomic";
import { ApiError, bad, conflict, forbidden, notFound } from "@/lib/api";
import type { Session } from "@/lib/auth";
import type { Actor } from "@/lib/access";
import { audit } from "./audit";
import { getOpenShift } from "./shifts";
import { verifyApprover } from "./approver";
import {
  Counter, Customer, FoodItem, Hotel, Invoice, InventoryItem, Order, OrderItem, Payment,
  Recipe, RecipeIngredient, Settings,
} from "@/lib/models";
import { moveStock, raiseStockAlerts } from "./inventory";
import { normalizePhone } from "@/lib/phone";

const discount = z.object({ type: z.enum(["percent", "amount"]), value: z.number().min(0) }).optional();

export const orderBase = z.object({
  idempotencyKey: z.string().min(8).max(100),
  type: z.enum(["dine_in", "takeaway", "delivery"]),
  table: z.string().max(20).optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(20).optional(),
  items: z.array(z.object({
    foodId: z.string(),
    variation: z.string().optional(),
    addons: z.array(z.string()).default([]),
    qty: z.number().int().min(1).max(999),
    discount: discount, // value in paise when type=amount
    notes: z.string().max(200).optional(),
    unitPrice: z.number().int().min(0).optional(), // price override: honoured only with the pos.price_override permission
  })).min(1, "Add at least one item"),
  billDiscount: discount,
  discountReason: z.string().trim().max(200).optional(),
  approval: z.object({ managerEmail: z.string().email(), pin: z.string().min(4).max(6) }).optional(),
  payments: z.array(z.object({
    method: z.enum(["cash", "upi", "card"]),
    amount: z.number().int().min(1),
    reference: z.string().max(60).optional(),
    tendered: z.number().int().min(0).optional(),
  })).default([]),
});

export const orderInput = orderBase.refine((o) => o.type !== "dine_in" || !!o.table, { message: "Select a table for dine-in", path: ["table"] });
export type OrderInput = z.infer<typeof orderInput>;

const pct = (amount: number, p: number) => Math.round((amount * p) / 100);

async function nextNumber(key: string) {
  const c = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return c.seq as number;
}

export async function getSettings(hotel: string | Types.ObjectId) {
  return (await Settings.findOne({ hotel })) ?? (await Settings.create({ hotel }));
}

/** Server-side pricing: prices, discounts, GST, round-off. Used for both live preview and confirmation. */
export async function priceOrder(input: Pick<OrderInput, "items" | "billDiscount" | "customerPhone">, settings: any, hotelId: string, actor?: Actor) {
  // Client prices are never trusted: everything is derived from the database.
  const foods = await FoodItem.find({ _id: { $in: input.items.map((i) => i.foodId) }, hotel: hotelId, deletedAt: null });
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const lines = input.items.map((i) => {
    const f = byId.get(i.foodId);
    if (!f) throw bad("An item in this order no longer exists");
    if (!f.available) throw bad(`${f.name} is currently unavailable`);
    let base = f.price;
    let overridden = false;
    if (i.unitPrice !== undefined && i.unitPrice !== null) {
      if (!actor?.can("pos.price_override")) throw forbidden("You are not allowed to change prices");
      overridden = true;
    }
    if (i.variation) {
      const v = f.variations.find((x: any) => x.name === i.variation);
      if (!v) throw bad(`Unknown variation "${i.variation}" for ${f.name}`);
      base = v.price;
    }
    const addons = i.addons.map((n) => {
      const a = f.addons.find((x: any) => x.name === n);
      if (!a) throw bad(`Unknown add-on "${n}" for ${f.name}`);
      return { name: a.name as string, price: a.price as number };
    });
    const unitPrice = overridden ? (i.unitPrice as number) : base + addons.reduce((s, a) => s + a.price, 0);
    const gross = unitPrice * i.qty;
    let disc = 0;
    if (i.discount) disc = i.discount.type === "percent" ? pct(gross, Math.min(100, i.discount.value)) : Math.round(i.discount.value);
    disc = Math.min(disc, gross);
    return { f, i, addons, unitPrice, gross, disc, net: gross - disc, billShare: 0, overridden };
  });

  const subtotal = lines.reduce((s, l) => s + l.gross, 0);
  const itemDiscount = lines.reduce((s, l) => s + l.disc, 0);
  const afterItem = subtotal - itemDiscount;
  let billDiscount = 0;
  if (input.billDiscount) {
    billDiscount = input.billDiscount.type === "percent" ? pct(afterItem, Math.min(100, input.billDiscount.value)) : Math.round(input.billDiscount.value);
    billDiscount = Math.min(billDiscount, afterItem);
  }
  const manualBill = billDiscount;
  // Repeat-customer (loyalty) discount: applied automatically; the larger of manual vs loyalty wins, they never stack.
  const loyalty = { applied: false, percent: 0, visits: 0 };
  const phone = normalizePhone(input.customerPhone);
  if (settings.loyalty?.enabled && phone && settings.loyalty.percent > 0) {
    const c = await Customer.findOne({ hotel: hotelId, phone }, "visits");
    loyalty.visits = c?.visits ?? 0;
    if (loyalty.visits >= settings.loyalty.minVisits) {
      loyalty.percent = settings.loyalty.percent;
      const amt = Math.min(pct(afterItem, loyalty.percent), afterItem);
      if (amt > billDiscount) { billDiscount = amt; loyalty.applied = true; }
    }
  }
  // Allocate the bill discount across lines (last line absorbs the rounding remainder).
  let allocated = 0;
  lines.forEach((l, idx) => {
    l.billShare = idx === lines.length - 1 ? billDiscount - allocated : afterItem ? Math.round((billDiscount * l.net) / afterItem) : 0;
    allocated += l.billShare;
  });

  const taxOn = settings.tax.enabled;
  const priced = lines.map((l) => {
    const net = l.net - l.billShare;
    const rate = taxOn ? l.f.gstRate : 0;
    let taxable: number, gst: number;
    if (settings.tax.inclusive) {
      taxable = Math.round((net * 100) / (100 + rate));
      gst = net - taxable;
    } else {
      taxable = net;
      gst = pct(net, rate);
    }
    return { ...l, rate, taxable, gst, total: taxable + gst };
  });
  const taxable = priced.reduce((s, l) => s + l.taxable, 0);
  const gst = priced.reduce((s, l) => s + l.gst, 0);
  const rawTotal = taxable + gst;
  const grandTotal = settings.tax.roundOff ? Math.round(rawTotal / 100) * 100 : rawTotal;
  const roundOff = grandTotal - rawTotal;
  const breakup = new Map<number, { rate: number; taxable: number; gst: number }>();
  for (const l of priced) {
    const b = breakup.get(l.rate) ?? { rate: l.rate, taxable: 0, gst: 0 };
    b.taxable += l.taxable; b.gst += l.gst; breakup.set(l.rate, b);
  }

  // ---- Discount policy (cashiers only; managers/admins are unrestricted) ----
  const discount = { issues: [] as string[], reasonRequired: false, manual: itemDiscount + manualBill, hasManual: itemDiscount + manualBill > 0 };
  if (actor && actor.role === "cashier" && discount.hasManual) {
    const pol = actor.discountPolicy, allowed = actor.can("discount.apply");
    const entries = [...input.items.map((i) => i.discount), input.billDiscount].filter((d) => d && d.value > 0);
    if (!allowed) discount.issues.push("You are not allowed to give discounts");
    else {
      if (entries.some((d) => d!.type === "percent") && !pol.allowPercent) discount.issues.push("Percentage discounts are not allowed for you");
      if (entries.some((d) => d!.type === "amount") && !pol.allowFixed) discount.issues.push("Fixed-amount discounts are not allowed for you");
      // Each discount type is checked against its OWN limit (a generous fixed limit must not excuse a large percentage).
      let pctAmt = 0, fixedAmt = 0, count = 0;
      lines.forEach((l) => { if (l.i.discount && l.i.discount.value > 0) { count++; if (l.i.discount.type === "percent") pctAmt += l.disc; else fixedAmt += l.disc; } });
      if (input.billDiscount && input.billDiscount.value > 0) { count++; if (input.billDiscount.type === "percent") pctAmt += manualBill; else fixedAmt += manualBill; }
      const pctLimit = pct(subtotal, pol.maxPercent);
      if (pol.allowPercent && pctAmt > pctLimit + count) discount.issues.push(`Percentage discount exceeds your limit of ${pol.maxPercent}%`);
      if (pol.allowFixed && fixedAmt > pol.maxAmount + count) discount.issues.push(`Fixed discount exceeds your limit of \u20b9${(pol.maxAmount / 100).toFixed(2)}`);
    }
    discount.reasonRequired = pol.requireReason;
  }
  return { foods, priced, subtotal, itemDiscount, billDiscount, taxable, gst, grandTotal, roundOff, breakup, loyalty, discount };
}

/** Confirms an order: prices, tax, stock deduction, invoice and payments in one atomic unit. */
export async function createOrder(input: OrderInput, session: Actor) {
  const hotelId = session.hotelId;

  // Duplicate-submission guard: same key returns the original order.
  const dup = await Order.findOne({ hotel: hotelId, idempotencyKey: input.idempotencyKey });
  if (dup) return { order: dup, duplicate: true };

  const settings = await getSettings(hotelId);
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw notFound("Hotel not found");

  // ---- Authorisation that depends on the request body (never rely on the UI hiding things) ----
  for (const p of input.payments) if (!session.can(`pay.${p.method}` as any)) throw forbidden(`You are not allowed to accept ${p.method.toUpperCase()} payments`);
  if (input.payments.length > 1 && !session.can("pay.split")) throw forbidden("Split payments are not enabled for you");
  const shift = await getOpenShift(session.userId);
  if (session.role === "cashier" && session.can("shift.open") && !shift) throw conflict("Open your shift before creating bills");

  const { foods, priced, subtotal, itemDiscount, billDiscount, taxable, gst, grandTotal, roundOff, breakup, loyalty, discount: disc } = await priceOrder(input, settings, hotelId, session);
  let approver: { id: string; name: string } | null = null;
  if (disc.issues.length) {
    if (!input.approval) throw new ApiError(403, `Manager approval required: ${disc.issues.join("; ")}`, { code: "APPROVAL_REQUIRED", issues: disc.issues });
    approver = await verifyApprover(hotelId, input.approval.managerEmail, input.approval.pin, session.userId);
  }
  if (disc.reasonRequired && !input.discountReason?.trim()) throw bad("Enter a reason for the discount", { discountReason: "A reason is required" });
  const phone = normalizePhone(input.customerPhone);
  if (input.customerPhone?.trim() && !phone) throw bad("Enter a valid 10-digit mobile number");

  // ---- Payments ----
  const paid = input.payments.reduce((s, p) => s + p.amount, 0);
  if (paid > grandTotal) throw bad("Payments exceed the bill total");
  const paymentStatus = paid === 0 ? "unpaid" : paid === grandTotal ? "paid" : "partial";

  // ---- Ingredient requirements from recipes ----
  const need = new Map<string, number>();
  const perLine: Array<Map<string, number>> = priced.map(() => new Map());
  if (settings.stock.autoDeduct) {
    const recipes = await Recipe.find({ hotel: hotelId, food: { $in: foods.map((f) => f._id) }, deletedAt: null });
    const ings = await RecipeIngredient.find({ recipe: { $in: recipes.map((r) => r._id) } });
    const recipeOf = new Map(recipes.map((r) => [String(r.food), String(r._id)]));
    priced.forEach((l, idx) => {
      const rid = recipeOf.get(String(l.f._id));
      if (!rid) return;
      for (const g of ings.filter((x) => String(x.recipe) === rid)) {
        const q = g.quantityBase * l.i.qty;
        const k = String(g.item);
        perLine[idx].set(k, (perLine[idx].get(k) ?? 0) + q);
        need.set(k, (need.get(k) ?? 0) + q);
      }
    });
  }
  const invItems = await InventoryItem.find({ _id: { $in: [...need.keys()] }, hotel: hotelId });
  const invById = new Map(invItems.map((x) => [String(x._id), x]));
  if (settings.stock.blockOnInsufficient) {
    const short = [...need].filter(([k, q]) => (invById.get(k)?.currentStock ?? 0) < q)
      .map(([k, q]) => `${invById.get(k)?.name ?? "item"} (need ${q}, have ${invById.get(k)?.currentStock ?? 0} ${invById.get(k)?.baseUnit ?? ""})`);
    if (short.length) throw new ApiError(409, `Insufficient ingredients: ${short.join(", ")}`, { shortages: short });
  }

  const year = new Date().getFullYear();
  const out = await atomic(async (tx) => {
    const seq = await nextNumber(`inv:${hotelId}:${settings.invoice.resetYearly ? year : "all"}`);
    const invoiceNo = `${settings.invoice.prefix}-${settings.invoice.resetYearly ? year + "-" : ""}${String(seq).padStart(settings.invoice.padding, "0")}`;

    const consumption = [...need].map(([k, q]) => {
      const it = invById.get(k)!;
      return { item: it._id, name: it.name, qtyBase: q, cost: Math.round(q * it.avgCost) };
    });
    const lineCogs = priced.map((l, idx) => {
      const fromRecipe = [...perLine[idx]].reduce((s, [k, q]) => s + q * (invById.get(k)?.avgCost ?? 0), 0);
      return Math.round(perLine[idx].size ? fromRecipe : l.f.cost * l.i.qty);
    });
    const cogs = lineCogs.reduce((s, x) => s + x, 0);

    const [order] = await Order.create([{
      hotel: hotelId, orderNo: invoiceNo, idempotencyKey: input.idempotencyKey, type: input.type, table: input.table,
      customerName: input.customerName, customerPhone: phone, loyaltyPercent: loyalty.applied ? loyalty.percent : 0, status: "confirmed", paymentStatus,
      subtotal, itemDiscount, billDiscountType: loyalty.applied ? "percent" : input.billDiscount?.type ?? "none", billDiscountValue: loyalty.applied ? loyalty.percent : input.billDiscount?.value ?? 0,
      billDiscount, taxable, gst, gstBreakup: [...breakup.values()], roundOff, grandTotal, paidAmount: paid, cogs,
      stockDeducted: need.size > 0, createdBy: session.userId, shift: shift?._id, discountReason: disc.hasManual ? input.discountReason : undefined, discountApprovedBy: approver?.id,
    }], { session: tx.session });
    tx.onRollback(async () => {
      await Promise.all([
        OrderItem.collection.deleteMany({ order: order._id }),
        Payment.collection.deleteMany({ order: order._id }),
        Invoice.collection.deleteMany({ order: order._id }),
        Order.collection.deleteOne({ _id: order._id }),
      ]);
    });

    await OrderItem.create(priced.map((l, idx) => ({
      hotel: hotelId, order: order._id, food: l.f._id, name: l.f.name, variation: l.i.variation, addons: l.addons, type: l.f.type,
      qty: l.i.qty, unitPrice: l.unitPrice, discount: l.disc, gstRate: l.rate, taxable: l.taxable, gst: l.gst, total: l.total,
      notes: l.i.notes, cogs: lineCogs[idx], priceOverridden: l.overridden,
      consumption: [...perLine[idx]].map(([k, q]) => ({ item: k, name: invById.get(k)?.name, qtyBase: q, cost: Math.round(q * (invById.get(k)?.avgCost ?? 0)) })),
    })), { session: tx.session, ordered: true });

    for (const c of consumption) {
      await moveStock(tx, {
        hotel: hotelId, item: c.item, type: "consumption", qty: -c.qtyBase, refModel: "Order", refId: order._id,
        refNo: invoiceNo, reason: "Order confirmed", userId: session.userId, clamp: !settings.stock.blockOnInsufficient,
      });
    }

    const [inv] = await Invoice.create([{
      hotel: hotelId, invoiceNo, order: order._id,
      snapshot: {
        hotel: { name: hotel.name, address: hotel.address, phone: hotel.phone, gstin: settings.invoice.showGstin ? hotel.gstin : "", logo: hotel.logo },
        invoiceNo, date: new Date(), type: input.type, table: input.table, customerName: input.customerName, customerPhone: phone,
        cashier: session.name,
        items: priced.map((l) => ({ name: l.f.name, variation: l.i.variation, addons: l.addons, qty: l.i.qty, unitPrice: l.unitPrice, discount: l.disc, gstRate: l.rate, total: l.total, notes: l.i.notes })),
        subtotal, itemDiscount, billDiscount, taxable, gst, gstBreakup: [...breakup.values()], roundOff, grandTotal,
        footer: settings.invoice.footer, paperSize: settings.invoice.paperSize,
      },
    }], { session: tx.session });
    await Order.updateOne({ _id: order._id }, { invoice: inv._id }, { session: tx.session });

    if (input.payments.length)
      await Payment.create(input.payments.map((p) => ({
        hotel: hotelId, order: order._id, invoice: inv._id, kind: "payment", method: p.method, amount: p.amount,
        reference: p.reference, tendered: p.method === "cash" ? p.tendered : undefined, shift: shift?._id, createdBy: session.userId,
      })), { session: tx.session, ordered: true });

    return { orderId: order._id, invoiceId: inv._id };
  }).catch(async (e) => {
    if (e?.code === 11000) {
      const again = await Order.findOne({ hotel: hotelId, idempotencyKey: input.idempotencyKey });
      if (again) return { orderId: again._id, duplicate: true as const };
    }
    throw e;
  });

  if (need.size) await raiseStockAlerts(hotelId, [...need.keys()]);
  const order = await Order.findById(out.orderId);
  const duplicate = "duplicate" in out;
  if (!("duplicate" in out)) {
    if (approver) await audit(session, { action: "discount.approved", module: "billing", entity: "Order", entityId: out.orderId, reason: input.discountReason, approvedBy: approver.id, newValue: { manualDiscount: disc.manual, issues: disc.issues } });
    else if (disc.hasManual && session.role === "cashier") await audit(session, { action: "discount.applied", module: "billing", entity: "Order", entityId: out.orderId, reason: input.discountReason, newValue: { manualDiscount: disc.manual } });
    if (priced.some((l) => l.overridden)) await audit(session, { action: "price.override", module: "billing", entity: "Order", entityId: out.orderId, newValue: priced.filter((l) => l.overridden).map((l) => ({ item: l.f.name, listPrice: l.f.price, price: l.unitPrice })) });
  }
  // Remember the customer so their next visit can earn the repeat-customer discount.
  if (!duplicate && phone) {
    await Customer.updateOne(
      { hotel: hotelId, phone },
      { $inc: { visits: 1, totalSpent: grandTotal }, $set: { lastVisitAt: new Date(), ...(input.customerName?.trim() ? { name: input.customerName.trim() } : {}) }, $setOnInsert: { hotel: hotelId } },
      { upsert: true },
    );
  }
  return { order: order!, duplicate };
}

export async function addPayment(orderId: string, p: { method: "cash" | "upi" | "card"; amount: number; reference?: string }, s: Actor) {
  if (!s.can(`pay.${p.method}` as any)) throw forbidden(`You are not allowed to accept ${p.method.toUpperCase()} payments`);
  const order = await Order.findOne({ _id: orderId, hotel: s.hotelId });
  if (!order) throw notFound("Bill not found");
  if (!s.can("billing.view_all") && String(order.createdBy) !== s.userId) throw notFound("Bill not found");
  if (order.status === "cancelled") throw conflict("This bill is cancelled");
  const due = order.grandTotal - order.paidAmount;
  if (p.amount > due) throw bad(`Amount exceeds balance due (${due / 100})`);
  const newPaid = order.paidAmount + p.amount;
  // Conditional update guards against concurrent over-payment.
  const upd = await Order.findOneAndUpdate(
    { _id: orderId, paidAmount: order.paidAmount, status: "confirmed" },
    { paidAmount: newPaid, paymentStatus: newPaid === order.grandTotal ? "paid" : "partial" }, { returnDocument: "after" });
  if (!upd) throw conflict("Bill was modified, please retry");
  await Payment.create({ hotel: s.hotelId, order: orderId, invoice: order.invoice, kind: "payment", ...p, shift: (await getOpenShift(s.userId))?._id, createdBy: s.userId });
  return upd;
}

/** Cancels a confirmed bill once: reverses stock, refunds payments, keeps full audit trail. */
export async function cancelOrder(orderId: string, reason: string, s: Session, opts: { approvedBy?: string } = {}) {
  const order = await Order.findOne({ _id: orderId, hotel: s.hotelId });
  if (!order) throw notFound("Bill not found");
  if (order.status === "cancelled") throw conflict("Bill is already cancelled");
  const shiftId = (await getOpenShift(s.userId))?._id;

  await atomic(async (tx) => {
    // Status flip is the single-execution guard against duplicate reversal.
    const flipped = await Order.findOneAndUpdate(
      { _id: orderId, status: "confirmed" },
      { status: "cancelled", cancelledAt: new Date(), cancelledBy: s.userId, cancelReason: reason }, { session: tx.session });
    if (!flipped) throw conflict("Bill is already cancelled");
    tx.onRollback(() => Order.updateOne({ _id: orderId }, { status: "confirmed", $unset: { cancelledAt: 1, cancelledBy: 1, cancelReason: 1 } }));

    if (order.stockDeducted) {
      const lines = await OrderItem.find({ order: orderId });
      const back = new Map<string, number>();
      for (const l of lines) for (const c of l.consumption) back.set(String(c.item), (back.get(String(c.item)) ?? 0) + c.qtyBase);
      // Reverse what the ledger actually deducted (clamped deductions are honoured).
      const { StockMovement } = await import("@/lib/models");
      const mvs = await StockMovement.find({ refModel: "Order", refId: orderId, type: "consumption" });
      const actual = new Map<string, number>();
      for (const m of mvs) actual.set(String(m.item), (actual.get(String(m.item)) ?? 0) + -m.qty);
      for (const [item, q] of actual.size ? actual : back)
        await moveStock(tx, { hotel: s.hotelId, item, type: "consumption_reversal", qty: q, refModel: "Order", refId: orderId, refNo: `CANCEL-${order.orderNo}`, reason: `Bill cancelled: ${reason}`, userId: s.userId });
    }

    const pays = await Payment.find({ order: orderId });
    const net = new Map<string, number>();
    for (const p of pays) net.set(p.method, (net.get(p.method) ?? 0) + (p.kind === "payment" ? p.amount : -p.amount));
    for (const [method, amount] of net)
      if (amount > 0) await Payment.create([{ hotel: s.hotelId, order: orderId, invoice: order.invoice, kind: "refund", method, amount, shift: shiftId, reason: `Cancelled: ${reason}`, createdBy: s.userId }], { session: tx.session });
    await Order.updateOne({ _id: orderId }, { refundedAmount: order.paidAmount }, { session: tx.session });
    await Invoice.updateOne({ _id: order.invoice }, { status: "cancelled" }, { session: tx.session });
    if (order.customerPhone) {
      const c = await Customer.findOne({ hotel: s.hotelId, phone: order.customerPhone }, "visits totalSpent", { session: tx.session });
      if (c) await Customer.updateOne({ _id: c._id }, { visits: Math.max(0, c.visits - 1), totalSpent: Math.max(0, c.totalSpent - order.grandTotal) }, { session: tx.session });
    }
    await audit(s, { action: "bill.cancel", module: "billing", entity: "Order", entityId: orderId, reason, approvedBy: opts.approvedBy, previousValue: { status: "confirmed", paid: order.paidAmount }, newValue: { status: "cancelled" }, meta: { orderNo: order.orderNo, grandTotal: order.grandTotal } }, { session: tx.session });
  });
  return Order.findById(orderId);
}

export async function refundOrder(orderId: string, r: { amount: number; method: "cash" | "upi" | "card"; reason: string }, s: Session, opts: { approvedBy?: string } = {}) {
  const order = await Order.findOne({ _id: orderId, hotel: s.hotelId });
  if (!order) throw notFound("Bill not found");
  if (order.status === "cancelled") throw conflict("Cancelled bills are already refunded");
  const refundable = order.paidAmount - order.refundedAmount;
  if (r.amount > refundable) throw bad(`Only ${refundable / 100} can be refunded`);
  const upd = await Order.findOneAndUpdate({ _id: orderId, refundedAmount: order.refundedAmount, status: "confirmed" }, { $inc: { refundedAmount: r.amount } }, { returnDocument: "after" });
  if (!upd) throw conflict("Bill was modified, please retry");
  await Payment.create({ hotel: s.hotelId, order: orderId, invoice: order.invoice, kind: "refund", method: r.method, amount: r.amount, reason: r.reason, shift: (await getOpenShift(s.userId))?._id, createdBy: s.userId });
  await audit(s, { action: "bill.refund", module: "billing", entity: "Order", entityId: orderId, reason: r.reason, approvedBy: opts.approvedBy, previousValue: { refunded: order.refundedAmount }, newValue: { refunded: order.refundedAmount + r.amount }, meta: { amount: r.amount, method: r.method } });
  return upd;
}
