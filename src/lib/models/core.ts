import { define, oid, tenant, softDelete } from "./_base";
import { ROLES } from "../rbac";
import { Schema } from "mongoose";

export const Hotel = define("Hotel", {
  name: { type: String, required: true, trim: true },
  address: { type: String, default: "" },
  phone: { type: String, default: "" },
  email: { type: String, default: "" },
  gstin: { type: String, default: "" },
  logo: { type: String, default: "" },
  currency: { type: String, default: "INR" },
  ...softDelete,
});

export const User = define("User", {
  ...tenant,
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: "" },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, required: true, index: true },
  active: { type: Boolean, default: true },
  /** Per-user overrides of cashier permissions, e.g. { "billing.cancel": true }. Only whitelisted keys are ever honoured. */
  permissions: { type: Schema.Types.Mixed, default: {} },
  discountPolicy: {
    allowPercent: { type: Boolean, default: true },
    allowFixed: { type: Boolean, default: true },
    maxPercent: { type: Number, default: 10, min: 0, max: 100 },
    maxAmount: { type: Number, default: 10000, min: 0 }, // paise
    requireReason: { type: Boolean, default: true },
  },
  /** Approval PIN for managers/admins (bcrypt hash). pinSet is a plain flag because the hash is select:false. */
  pinHash: { type: String, select: false },
  pinSet: { type: Boolean, default: false },
  lastLoginAt: Date,
  ...softDelete,
});

/** Atomic sequence generator (invoice / order numbers). */
export const Counter = define("Counter", {
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
}, { timestamps: false });

export const Settings = define("Settings", {
  hotel: { ...oid("Hotel", true), unique: true },
  invoice: {
    prefix: { type: String, default: "INV" },
    padding: { type: Number, default: 5 },
    resetYearly: { type: Boolean, default: true },
    footer: { type: String, default: "Thank you! Visit again." },
    showGstin: { type: Boolean, default: true },
    paperSize: { type: String, enum: ["58mm", "80mm", "A4"], default: "80mm" },
    autoPrint: { type: Boolean, default: false },
  },
  tax: {
    enabled: { type: Boolean, default: true },
    defaultRate: { type: Number, default: 5 },
    inclusive: { type: Boolean, default: false },
    roundOff: { type: Boolean, default: true },
  },
  stock: {
    autoDeduct: { type: Boolean, default: true },
    blockOnInsufficient: { type: Boolean, default: true },
    expiryAlertDays: { type: Number, default: 7 },
  },
  notifications: {
    lowStock: { type: Boolean, default: true },
    expiry: { type: Boolean, default: true },
  },
  loyalty: {
    enabled: { type: Boolean, default: true },
    minVisits: { type: Number, default: 2 }, // previous completed visits needed before the discount starts
    percent: { type: Number, default: 5, min: 0, max: 50 },
  },
  tables: { type: Number, default: 20 },
});

/** Repeat-customer record, keyed by phone number (one per hotel). */
export const Customer = define("Customer", {
  ...tenant,
  phone: { type: String, required: true },
  name: { type: String, default: "" },
  visits: { type: Number, default: 0, min: 0 },
  totalSpent: { type: Number, default: 0, min: 0 },
  lastVisitAt: Date,
}, {}, (s) => s.index({ hotel: 1, phone: 1 }, { unique: true }));

export const Notification = define("Notification", {
  ...tenant,
  type: { type: String, enum: ["low_stock", "out_of_stock", "expiry", "info"], required: true },
  title: { type: String, required: true },
  message: { type: String, default: "" },
  refModel: String,
  refId: Schema.Types.ObjectId,
  read: { type: Boolean, default: false },
}, {}, (s) => s.index({ hotel: 1, read: 1, createdAt: -1 }));

export const AuditLog = define("AuditLog", {
  ...tenant,
  user: oid("User"),
  userName: String,
  action: { type: String, required: true, index: true },
  module: { type: String, index: true },
  entity: { type: String, required: true },
  entityId: Schema.Types.ObjectId,
  reason: String,
  approvedBy: oid("User"),
  previousValue: Schema.Types.Mixed,
  newValue: Schema.Types.Mixed,
  meta: Schema.Types.Mixed,
}, {}, (s) => s.index({ hotel: 1, createdAt: -1 }));
