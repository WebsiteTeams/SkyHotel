import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  image: z.string().optional().default(""),
  description: z.string().max(300).optional().default(""),
  active: z.boolean().default(true),
});

const opt = z.object({ name: z.string().trim().min(1, "Name required"), price: z.number().int().min(0) });
export const foodSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  image: z.string().optional().default(""),
  category: z.string().min(1, "Select a category"),
  description: z.string().max(400).optional().default(""),
  price: z.number().int().min(0, "Price must be positive"),
  cost: z.number().int().min(0).default(0),
  type: z.enum(["veg", "non_veg", "egg"]),
  available: z.boolean().default(true),
  gstRate: z.number().min(0).max(28).default(5),
  unit: z.string().max(20).default("plate"),
  prepNotes: z.string().max(400).optional().default(""),
  variations: z.array(opt).default([]),
  addons: z.array(opt).default([]),
});

export const inventorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  sku: z.string().trim().min(1, "SKU is required").max(30),
  category: z.string().trim().default("General"),
  unit: z.enum(["kg", "g", "L", "ml", "pcs", "packet", "box"]),
  openingStock: z.number().min(0).default(0), // in `unit`
  minStock: z.number().min(0).default(0), // in `unit`
  purchasePrice: z.number().int().min(0).default(0), // paise per `unit`
  supplier: z.string().optional(),
  expiryDate: z.string().optional(),
  location: z.string().max(60).default(""),
  description: z.string().max(300).default(""),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  company: z.string().max(80).default(""),
  phone: z.string().max(20).default(""),
  email: z.union([z.string().email("Invalid email"), z.literal("")]).default(""),
  address: z.string().max(300).default(""),
  gstin: z.string().max(20).default(""),
  products: z.array(z.string()).default([]),
});

export const expenseSchema = z.object({
  category: z.enum(["Rent", "Electricity", "Water", "Staff salary", "Transportation", "Maintenance", "Other"]),
  amount: z.number().int().min(1, "Amount is required"),
  method: z.enum(["cash", "upi", "card", "bank"]).default("cash"),
  date: z.string().min(1, "Date is required"),
  description: z.string().max(300).default(""),
  receipt: z.string().optional(),
});

import { ROLES } from "./rbac";

export const staffCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().default(""),
  role: z.enum(ROLES),
  active: z.boolean().default(true),
  password: z.string().min(8, "At least 8 characters"),
  /** Cashier-only: per-user permission overrides + discount limits (validated against a whitelist on the server). */
  permissions: z.record(z.string(), z.boolean()).optional(),
  discountPolicy: z.object({ allowPercent: z.boolean(), allowFixed: z.boolean(), maxPercent: z.number().min(0).max(100), maxAmount: z.number().int().min(0), requireReason: z.boolean() }).optional(),
});
export const staffUpdateSchema = staffCreateSchema.omit({ email: true, password: true }).extend({
  password: z.string().min(8, "At least 8 characters").optional().or(z.literal("").transform(() => undefined)),
});

export const settingsSchema = z.object({
  hotel: z.object({
    name: z.string().trim().min(1, "Hotel name is required"),
    address: z.string().default(""), phone: z.string().default(""), email: z.string().default(""),
    gstin: z.string().default(""), logo: z.string().default(""),
  }),
  invoice: z.object({
    prefix: z.string().trim().min(1).max(10), padding: z.number().int().min(3).max(8), resetYearly: z.boolean(),
    footer: z.string().max(200), showGstin: z.boolean(), paperSize: z.enum(["58mm", "80mm", "A4"]), autoPrint: z.boolean(),
  }),
  tax: z.object({ enabled: z.boolean(), defaultRate: z.number().min(0).max(28), inclusive: z.boolean(), roundOff: z.boolean() }),
  stock: z.object({ autoDeduct: z.boolean(), blockOnInsufficient: z.boolean(), expiryAlertDays: z.number().int().min(0).max(365) }),
  notifications: z.object({ lowStock: z.boolean(), expiry: z.boolean() }),
  loyalty: z.object({ enabled: z.boolean(), minVisits: z.number().int().min(0).max(100), percent: z.number().min(0).max(50) }),
  tables: z.number().int().min(1).max(200),
});
