import { Schema } from "mongoose";
import { define, oid, tenant, paise } from "./_base";

/** One cashier drawer session. Totals are computed live from Payments while open and frozen at close. */
export const CashierShift = define("CashierShift", {
  ...tenant,
  cashier: oid("User", true),
  status: { type: String, enum: ["open", "closed"], default: "open", index: true },
  openingCash: paise,
  expectedClosingCash: { type: Number, default: 0 },
  actualClosingCash: { type: Number, default: null },
  cashDifference: { type: Number, default: null },
  totalCashSales: paise,
  totalUPISales: paise,
  totalCardSales: paise,
  totalRefunds: paise,
  cashRefunds: paise,
  billCount: { type: Number, default: 0 },
  notes: String,
  openedAt: { type: Date, default: Date.now },
  closedAt: Date,
}, {}, (s) => {
  // A cashier can have at most one open shift (also protects against double-click races).
  s.index({ cashier: 1 }, { unique: true, partialFilterExpression: { status: "open" } });
  s.index({ hotel: 1, openedAt: -1 });
});

/** A cashier's request to cancel / refund a bill (or approve a discount), decided by a manager. */
export const ApprovalRequest = define("ApprovalRequest", {
  ...tenant,
  requestedBy: { ...oid("User", true), index: true },
  approvedBy: oid("User"),
  requestType: { type: String, enum: ["cancel_bill", "refund", "discount"], required: true },
  relatedBill: { ...oid("Order"), index: true },
  reason: { type: String, required: true },
  payload: Schema.Types.Mixed, // e.g. { amount, method } for a refund
  status: { type: String, enum: ["pending", "approved", "rejected", "failed"], default: "pending", index: true },
  decisionNote: String,
  approvedAt: Date,
}, {}, (s) => s.index({ hotel: 1, status: 1, createdAt: -1 }));
