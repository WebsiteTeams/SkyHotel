import { z } from "zod";
import { route, notFound, forbidden, bad } from "@/lib/api";
import { User } from "@/lib/models";
import { CASHIER_TOGGLE_KEYS, DEFAULT_DISCOUNT_POLICY } from "@/lib/rbac";
import { audit } from "@/services/audit";

const permissionsSchema = z.object({
  permissions: z.record(z.string(), z.boolean()),
  discountPolicy: z.object({
    allowPercent: z.boolean(), allowFixed: z.boolean(), maxPercent: z.number().min(0).max(100),
    maxAmount: z.number().int().min(0), requireReason: z.boolean(),
  }),
});

/** Hotel Admin edits ONE cashier's permissions. Unknown keys are rejected, so staff/purchases/etc. can never be granted. */
export const PUT = route<{ id: string }>("staff.manage", async ({ actor, params, body }) => {
  const d = await body(permissionsSchema);
  if (params.id === actor.userId) throw forbidden("You cannot change your own permissions");
  const bogus = Object.keys(d.permissions).filter((k) => !CASHIER_TOGGLE_KEYS.has(k));
  if (bogus.length) throw bad(`These permissions cannot be assigned to a cashier: ${bogus.join(", ")}`);
  const u = await User.findOne({ _id: params.id, hotel: actor.hotelId, deletedAt: null });
  if (!u) throw notFound("User not found");
  if (u.role !== "cashier") throw bad("Permission overrides apply to cashier accounts only");
  const previous = { permissions: u.permissions ?? {}, discountPolicy: { ...DEFAULT_DISCOUNT_POLICY, ...(u.discountPolicy?.toObject?.() ?? u.discountPolicy ?? {}) } };
  u.permissions = d.permissions;
  u.markModified("permissions");
  u.discountPolicy = d.discountPolicy;
  await u.save();
  await audit(actor, { action: "permissions.update", module: "staff", entity: "User", entityId: u._id, previousValue: previous, newValue: d, meta: { cashier: u.name } });
  return { ok: true };
});
