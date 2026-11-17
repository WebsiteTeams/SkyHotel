import { z } from "zod";
import { atomic, type Tx } from "@/lib/atomic";
import { bad, conflict, notFound } from "@/lib/api";
import type { Session } from "@/lib/auth";
import { AuditLog, Counter, InventoryItem, Purchase, PurchaseItem, Supplier } from "@/lib/models";
import { UNITS, isCompatible, toBase, unitFactor, type Unit } from "@/lib/units";
import { moveStock } from "./inventory";

export const purchaseInput = z.object({
  supplier: z.string().min(1, "Select a supplier"),
  invoiceNo: z.string().max(60).optional(),
  date: z.string().min(1, "Date is required"),
  items: z.array(z.object({
    item: z.string(),
    quantity: z.number().positive(),
    unit: z.enum(UNITS),
    rate: z.number().int().min(0), // paise per `unit`
    expiryDate: z.string().optional(),
  })).min(1, "Add at least one item"),
  discount: z.number().int().min(0).default(0),
  tax: z.number().int().min(0).default(0),
  charges: z.number().int().min(0).default(0),
  paidAmount: z.number().int().min(0).default(0),
  method: z.enum(["cash", "upi", "card", "bank"]).default("cash"),
  attachment: z.string().optional(),
  notes: z.string().max(500).optional(),
});
export type PurchaseInput = z.infer<typeof purchaseInput>;

async function resolveLines(hotel: string, input: PurchaseInput) {
  const items = await InventoryItem.find({ _id: { $in: input.items.map((i) => i.item) }, hotel, deletedAt: null });
  const by = new Map(items.map((i) => [String(i._id), i]));
  const lines = input.items.map((l) => {
    const it = by.get(l.item);
    if (!it) throw bad("An inventory item no longer exists");
    if (!isCompatible(l.unit as Unit, it.unit as Unit)) throw bad(`${it.name}: ${l.unit} cannot be converted to ${it.unit}`);
    return { it, ...l, quantityBase: toBase(l.quantity, l.unit as Unit), amount: Math.round(l.quantity * l.rate) };
  });
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const total = subtotal - input.discount + input.tax + input.charges;
  if (input.discount > subtotal) throw bad("Discount cannot exceed the subtotal");
  if (input.paidAmount > total) throw bad("Paid amount cannot exceed the total");
  return { lines, subtotal, total };
}

/** Adds stock for each line, updating the weighted-average cost. Used by create and edit. */
async function receive(tx: Tx, p: any, lines: Awaited<ReturnType<typeof resolveLines>>["lines"], s: Session) {
  for (const l of lines) {
    const costPerBase = l.rate / unitFactor(l.unit as Unit);
    const fresh = await InventoryItem.findById(l.it._id, null, { session: tx.session });
    const oldStock = fresh!.currentStock, oldAvg = fresh!.avgCost;
    await moveStock(tx, { hotel: s.hotelId, item: l.it._id, type: "purchase", qty: l.quantityBase, unitCost: costPerBase, refModel: "Purchase", refId: p._id, refNo: p.purchaseNo, reason: "Purchase confirmed", userId: s.userId });
    const newAvg = (oldStock * oldAvg + l.quantityBase * costPerBase) / (oldStock + l.quantityBase);
    const set: any = { avgCost: newAvg, purchasePrice: Math.round(costPerBase * unitFactor(fresh!.unit as Unit)), supplier: p.supplier };
    if (l.expiryDate) set.expiryDate = new Date(l.expiryDate);
    await InventoryItem.updateOne({ _id: l.it._id }, set, { session: tx.session });
    tx.onRollback(() => InventoryItem.updateOne({ _id: l.it._id }, { avgCost: oldAvg, purchasePrice: fresh!.purchasePrice, supplier: fresh!.supplier, expiryDate: fresh!.expiryDate }));
  }
}

const status = (paid: number, total: number) => (paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial");

export async function createPurchase(input: PurchaseInput, s: Session) {
  if (!(await Supplier.exists({ _id: input.supplier, hotel: s.hotelId, deletedAt: null }))) throw bad("Supplier not found");
  const { lines, subtotal, total } = await resolveLines(s.hotelId, input);
  return atomic(async (tx) => {
    const c = await Counter.findOneAndUpdate({ key: `po:${s.hotelId}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
    const [p] = await Purchase.create([{
      hotel: s.hotelId, purchaseNo: `PUR-${String(c.seq).padStart(5, "0")}`, supplier: input.supplier, invoiceNo: input.invoiceNo,
      date: new Date(input.date), subtotal, discount: input.discount, tax: input.tax, charges: input.charges, total,
      paidAmount: input.paidAmount, paymentStatus: status(input.paidAmount, total), attachment: input.attachment, notes: input.notes,
      payments: input.paidAmount ? [{ amount: input.paidAmount, method: input.method, date: new Date(input.date), by: s.userId }] : [],
      createdBy: s.userId,
    }], { session: tx.session });
    tx.onRollback(async () => {
      await PurchaseItem.collection.deleteMany({ purchase: p._id });
      await Purchase.collection.deleteOne({ _id: p._id });
    });
    await PurchaseItem.create(lines.map((l) => ({ hotel: s.hotelId, purchase: p._id, item: l.it._id, name: l.it.name, quantity: l.quantity, unit: l.unit, quantityBase: l.quantityBase, rate: l.rate, amount: l.amount, expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined })), { session: tx.session, ordered: true });
    await receive(tx, p, lines, s);
    return p;
  });
}

async function reverse(tx: Tx, purchase: any, reason: string, s: Session) {
  const items = await PurchaseItem.find({ purchase: purchase._id });
  for (const l of items)
    await moveStock(tx, { hotel: s.hotelId, item: l.item, type: "purchase_cancel", qty: -l.quantityBase, refModel: "Purchase", refId: purchase._id, refNo: `CANCEL-${purchase.purchaseNo}`, reason, userId: s.userId });
  return items;
}

export async function cancelPurchase(id: string, reason: string, s: Session) {
  const p = await Purchase.findOne({ _id: id, hotel: s.hotelId });
  if (!p) throw notFound("Purchase not found");
  if (p.status === "cancelled") throw conflict("Purchase is already cancelled");
  await atomic(async (tx) => {
    const flipped = await Purchase.findOneAndUpdate({ _id: id, status: "confirmed" }, { status: "cancelled", cancelReason: reason, cancelledAt: new Date() }, { session: tx.session });
    if (!flipped) throw conflict("Purchase is already cancelled");
    tx.onRollback(() => Purchase.updateOne({ _id: id }, { status: "confirmed" }));
    await reverse(tx, p, `Purchase cancelled: ${reason}`, s); // fails if stock was already consumed
    await AuditLog.create([{ hotel: s.hotelId, user: s.userId, userName: s.name, action: "purchase.cancel", entity: "Purchase", entityId: p._id, reason, meta: { purchaseNo: p.purchaseNo, total: p.total } }], { session: tx.session });
  });
  return Purchase.findById(id);
}

/** Edit = reverse the old stock-in and apply the new one, all auditable in the ledger. */
export async function updatePurchase(id: string, input: PurchaseInput, s: Session) {
  const p = await Purchase.findOne({ _id: id, hotel: s.hotelId });
  if (!p) throw notFound("Purchase not found");
  if (p.status === "cancelled") throw conflict("Cancelled purchases cannot be edited");
  const { lines, subtotal, total } = await resolveLines(s.hotelId, input);
  const paid = Math.max(p.paidAmount, 0);
  if (total < paid) throw bad("Total cannot be lower than the amount already paid");
  await atomic(async (tx) => {
    const oldItems = await reverse(tx, p, "Purchase edited", s);
    await PurchaseItem.deleteMany({ purchase: id }, { session: tx.session });
    tx.onRollback(async () => { await PurchaseItem.create(oldItems.map((o: any) => o.toObject())); });
    await PurchaseItem.create(lines.map((l) => ({ hotel: s.hotelId, purchase: id, item: l.it._id, name: l.it.name, quantity: l.quantity, unit: l.unit, quantityBase: l.quantityBase, rate: l.rate, amount: l.amount, expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined })), { session: tx.session, ordered: true });
    const prev = p.toObject();
    await Purchase.updateOne({ _id: id }, { supplier: input.supplier, invoiceNo: input.invoiceNo, date: new Date(input.date), subtotal, discount: input.discount, tax: input.tax, charges: input.charges, total, paymentStatus: status(paid, total), attachment: input.attachment, notes: input.notes }, { session: tx.session });
    tx.onRollback(() => Purchase.updateOne({ _id: id }, prev));
    await receive(tx, { _id: p._id, purchaseNo: p.purchaseNo, supplier: input.supplier }, lines, s);
    await AuditLog.create([{ hotel: s.hotelId, user: s.userId, userName: s.name, action: "purchase.edit", entity: "Purchase", entityId: p._id, meta: { purchaseNo: p.purchaseNo, oldTotal: p.total, newTotal: total } }], { session: tx.session });
  });
  return Purchase.findById(id);
}

export async function payPurchase(id: string, pay: { amount: number; method: string; date?: string; reference?: string }, s: Session) {
  const p = await Purchase.findOne({ _id: id, hotel: s.hotelId });
  if (!p) throw notFound("Purchase not found");
  if (p.status === "cancelled") throw conflict("Purchase is cancelled");
  const due = p.total - p.paidAmount;
  if (pay.amount > due) throw bad(`Amount exceeds outstanding balance (${due / 100})`);
  const paid = p.paidAmount + pay.amount;
  const upd = await Purchase.findOneAndUpdate(
    { _id: id, paidAmount: p.paidAmount },
    { paidAmount: paid, paymentStatus: status(paid, p.total), $push: { payments: { amount: pay.amount, method: pay.method, date: pay.date ? new Date(pay.date) : new Date(), reference: pay.reference, by: s.userId } } },
    { returnDocument: "after" });
  if (!upd) throw conflict("Purchase was modified, please retry");
  return upd;
}
