import { Schema } from "mongoose";
import { define, oid, tenant, softDelete, paise, signedPaise, immutable } from "./_base";

export const MOVEMENT_TYPES = [
  "opening", "purchase", "purchase_cancel", "consumption", "consumption_reversal",
  "manual_in", "manual_out", "damage", "expired", "wastage",
] as const;

/** Append-only ledger. Inventory is never changed without one of these. */
export const StockMovement = define("StockMovement", {
  ...tenant,
  item: { ...oid("InventoryItem", true), index: true },
  type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },
  qty: { type: Number, required: true }, // signed, base units
  balanceAfter: { type: Number, required: true },
  unitCost: { type: Number, default: 0 }, // paise per base unit at the time
  refModel: String,
  refId: Schema.Types.ObjectId,
  refNo: String,
  reason: String,
  createdBy: oid("User"),
}, {}, (s) => {
  immutable(s);
  s.index({ hotel: 1, createdAt: -1 });
  s.index({ item: 1, createdAt: -1 });
  s.index({ refModel: 1, refId: 1, type: 1 });
});

export const Supplier = define("Supplier", {
  ...tenant,
  name: { type: String, required: true, trim: true },
  company: { type: String, default: "" },
  phone: { type: String, default: "" },
  email: { type: String, default: "" },
  address: { type: String, default: "" },
  gstin: { type: String, default: "" },
  products: [String],
  ...softDelete,
}, {}, (s) => s.index({ hotel: 1, name: 1 }));

export const Purchase = define("Purchase", {
  ...tenant,
  purchaseNo: { type: String, required: true },
  supplier: { ...oid("Supplier", true), index: true },
  invoiceNo: { type: String, default: "" },
  date: { type: Date, required: true, index: true },
  subtotal: paise,
  discount: paise,
  tax: paise,
  charges: paise,
  total: paise,
  paidAmount: paise,
  paymentStatus: { type: String, enum: ["paid", "unpaid", "partial"], default: "unpaid" },
  status: { type: String, enum: ["confirmed", "cancelled"], default: "confirmed", index: true },
  attachment: String,
  notes: String,
  payments: [{
    amount: Number, method: String, date: Date, reference: String,
    by: Schema.Types.ObjectId,
  }],
  cancelReason: String,
  cancelledAt: Date,
  createdBy: oid("User"),
}, {}, (s) => s.index({ hotel: 1, purchaseNo: 1 }, { unique: true }));

export const PurchaseItem = define("PurchaseItem", {
  hotel: oid("Hotel", true),
  purchase: { ...oid("Purchase", true), index: true },
  item: oid("InventoryItem", true),
  name: String,
  quantity: { type: Number, required: true, min: 0.001 }, // in `unit`
  unit: { type: String, required: true },
  quantityBase: { type: Number, required: true },
  rate: paise, // paise per `unit`
  amount: paise,
  expiryDate: Date,
});

export const EXPENSE_CATEGORIES = [
  "Rent", "Electricity", "Water", "Staff salary", "Transportation", "Maintenance", "Other",
] as const;

export const Expense = define("Expense", {
  ...tenant,
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true, index: true },
  amount: { ...paise, min: 1 },
  method: { type: String, enum: ["cash", "upi", "card", "bank"], default: "cash" },
  date: { type: Date, required: true, index: true },
  description: { type: String, default: "" },
  receipt: String,
  createdBy: oid("User"),
  ...softDelete,
});


