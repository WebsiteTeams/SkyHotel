import { Schema } from "mongoose";
import { define, oid, tenant, paise, immutable } from "./_base";

export const ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;
export const PAY_METHODS = ["cash", "upi", "card"] as const;

export const Order = define("Order", {
  ...tenant,
  orderNo: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  type: { type: String, enum: ORDER_TYPES, required: true },
  table: String,
  customerName: { type: String, default: "" },
  customerPhone: { type: String, default: "", index: true },
  loyaltyPercent: { type: Number, default: 0 },
  discountReason: String,
  discountApprovedBy: oid("User"),
  shift: oid("CashierShift"),
  status: { type: String, enum: ["confirmed", "cancelled"], default: "confirmed", index: true },
  paymentStatus: { type: String, enum: ["paid", "partial", "unpaid"], default: "unpaid" },
  subtotal: paise, // sum of qty*unit price (pre-discount)
  itemDiscount: paise,
  billDiscountType: { type: String, enum: ["none", "percent", "amount"], default: "none" },
  billDiscountValue: { type: Number, default: 0 },
  billDiscount: paise,
  taxable: paise,
  gst: paise,
  gstBreakup: [{ rate: Number, taxable: Number, gst: Number, _id: false }],
  roundOff: { type: Number, default: 0 },
  grandTotal: paise,
  paidAmount: paise,
  refundedAmount: paise,
  cogs: paise, // ingredient cost snapshot at sale time
  stockDeducted: { type: Boolean, default: false },
  invoice: oid("Invoice"),
  createdBy: oid("User", true),
  cancelledAt: Date,
  cancelledBy: oid("User"),
  cancelReason: String,
}, {}, (s) => {
  s.index({ hotel: 1, orderNo: 1 }, { unique: true });
  s.index({ hotel: 1, idempotencyKey: 1 }, { unique: true });
  s.index({ hotel: 1, createdAt: -1 });
});

export const OrderItem = define("OrderItem", {
  hotel: oid("Hotel", true),
  order: { ...oid("Order", true), index: true },
  food: oid("FoodItem", true),
  name: { type: String, required: true },
  variation: String,
  addons: [{ name: String, price: Number, _id: false }],
  type: String,
  qty: { type: Number, required: true, min: 1 },
  priceOverridden: { type: Boolean, default: false },
  unitPrice: paise, // variation price + add-ons, server computed
  discount: paise, // item-wise discount
  gstRate: Number,
  taxable: paise,
  gst: paise,
  total: paise,
  notes: String,
  cogs: paise,
  /** Snapshot of what was consumed so later recipe edits never rewrite history. */
  consumption: [{ item: Schema.Types.ObjectId, name: String, qtyBase: Number, cost: Number, _id: false }],
}, { timestamps: true });

export const Invoice = define("Invoice", {
  ...tenant,
  invoiceNo: { type: String, required: true },
  order: { ...oid("Order", true), unique: true },
  status: { type: String, enum: ["issued", "cancelled"], default: "issued" },
  printCount: { type: Number, default: 1 },
  /** Immutable snapshot used for every reprint: hotel details + lines + totals. */
  snapshot: { type: Schema.Types.Mixed, required: true },
}, {}, (s) => s.index({ hotel: 1, invoiceNo: 1 }, { unique: true }));

export const Payment = define("Payment", {
  ...tenant,
  order: { ...oid("Order", true), index: true },
  invoice: oid("Invoice"),
  kind: { type: String, enum: ["payment", "refund"], default: "payment" },
  method: { type: String, enum: PAY_METHODS, required: true },
  amount: { ...paise, min: 1 },
  tendered: Number, // cash handed over by the customer (change = tendered - amount)
  shift: { ...oid("CashierShift"), index: true },
  reference: String,
  reason: String,
  createdBy: oid("User", true),
}, {}, (s) => {
  immutable(s);
  s.index({ hotel: 1, createdAt: -1 });
});
