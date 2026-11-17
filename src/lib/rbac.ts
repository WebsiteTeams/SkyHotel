export const ROLES = ["super_admin", "hotel_admin", "manager", "cashier"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard.view",
  "pos.use",
  "bills.create",
  "pos.price_override",
  "discount.apply",
  "pay.cash",
  "pay.upi",
  "pay.card",
  "pay.split",
  "billing.view", // own bills
  "billing.view_all", // every cashier's bills
  "billing.reprint",
  "billing.cancel",
  "billing.refund",
  "shift.open",
  "shift.close",
  "shift.view",
  "catalog.view",
  "catalog.manage",
  "inventory.view",
  "inventory.manage",
  "recipes.manage",
  "purchases.manage",
  "suppliers.manage",
  "expenses.manage",
  "reports.view",
  "reports.profit",
  "staff.manage",
  "settings.manage",
  "approvals.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** What a cashier gets before the Hotel Admin changes anything (mirrors the spec's default table). */
export const CASHIER_DEFAULTS: Permission[] = [
  "pos.use", "bills.create", "discount.apply", "pay.cash", "pay.upi", "pay.card", "pay.split",
  "billing.view", "billing.reprint", "catalog.view", "shift.open", "shift.close", "shift.view",
];

/** The only permissions an admin may switch on/off for a cashier. Anything else (staff, purchases...) can never be granted. */
export const CASHIER_TOGGLES: Array<{ key: Permission; label: string; group: string; hint?: string }> = [
  { key: "pos.use", label: "Access POS", group: "POS & billing" },
  { key: "bills.create", label: "Create bills", group: "POS & billing" },
  { key: "catalog.view", label: "View food items", group: "POS & billing" },
  { key: "pos.price_override", label: "Change food price at billing", group: "POS & billing", hint: "Lets the cashier type a different price per line." },
  { key: "discount.apply", label: "Apply discount (limits below)", group: "POS & billing" },
  { key: "pay.cash", label: "Accept cash", group: "Payments" },
  { key: "pay.upi", label: "Accept UPI", group: "Payments" },
  { key: "pay.card", label: "Accept card", group: "Payments" },
  { key: "pay.split", label: "Split payments", group: "Payments" },
  { key: "billing.view", label: "View own billing history", group: "Bills" },
  { key: "billing.view_all", label: "View all cashiers' bills", group: "Bills" },
  { key: "billing.reprint", label: "Reprint bills", group: "Bills" },
  { key: "billing.cancel", label: "Cancel bills directly", group: "Bills", hint: "Off = cashier must request it and a manager approves." },
  { key: "billing.refund", label: "Process refunds directly", group: "Bills", hint: "Off = cashier must request it and a manager approves." },
  { key: "shift.open", label: "Open shift (required for billing when on)", group: "Shift" },
  { key: "shift.close", label: "Close shift", group: "Shift" },
  { key: "shift.view", label: "View shift summary", group: "Shift" },
  { key: "inventory.view", label: "View stock", group: "Sensitive" },
  { key: "inventory.manage", label: "Manage stock", group: "Sensitive" },
  { key: "reports.profit", label: "View profit reports", group: "Sensitive" },
  { key: "settings.manage", label: "Manage settings", group: "Sensitive", hint: "Gives access to hotel profile, tax and invoice settings." },
];
export const CASHIER_TOGGLE_KEYS = new Set<string>(CASHIER_TOGGLES.map((t) => t.key));

export interface DiscountPolicy {
  allowPercent: boolean;
  allowFixed: boolean;
  maxPercent: number; // % of the bill before tax
  maxAmount: number; // paise
  requireReason: boolean;
}
export const DEFAULT_DISCOUNT_POLICY: DiscountPolicy = { allowPercent: true, allowFixed: true, maxPercent: 10, maxAmount: 10000, requireReason: true };

const ALL: Permission[] = [...PERMISSIONS];
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,
  hotel_admin: ALL,
  manager: [
    "dashboard.view", "pos.use", "bills.create", "pos.price_override", "discount.apply", "pay.cash", "pay.upi", "pay.card", "pay.split",
    "billing.view", "billing.view_all", "billing.reprint", "billing.cancel", "billing.refund", "shift.view",
    "catalog.view", "inventory.view", "inventory.manage", "recipes.manage", "purchases.manage", "suppliers.manage",
    "reports.view", "reports.profit", "approvals.manage",
  ],
  cashier: CASHIER_DEFAULTS,
};

/** Effective permissions = role defaults, plus per-user overrides (cashiers only), plus implied permissions. */
export function effectivePermissions(role: Role, overrides?: Record<string, unknown> | null): Permission[] {
  const set = new Set<Permission>(ROLE_PERMISSIONS[role]);
  if (role === "cashier" && overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (!CASHIER_TOGGLE_KEYS.has(k) || typeof v !== "boolean") continue;
      if (v) set.add(k as Permission);
      else set.delete(k as Permission);
    }
    if (set.has("inventory.manage")) set.add("inventory.view");
    if (!set.has("pos.use")) for (const p of ["bills.create", "pos.price_override", "discount.apply"] as Permission[]) set.delete(p);
    if (!set.has("billing.view")) {
      set.delete("billing.view_all");
      set.delete("billing.reprint");
    }
  }
  return [...set];
}

export const can = (role: Role | undefined, perm: Permission) => !!role && ROLE_PERMISSIONS[role].includes(perm);

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  hotel_admin: "Hotel Admin",
  manager: "Manager",
  cashier: "Cashier",
};

/** Roles whose PIN / login may authorise discounts, cancellations and refunds. */
export const APPROVER_ROLES: Role[] = ["manager", "hotel_admin", "super_admin"];
