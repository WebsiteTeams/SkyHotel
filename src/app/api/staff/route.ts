import { route } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { assertRoleAssignable } from "@/lib/guards";
import { bad } from "@/lib/api";
import { CASHIER_TOGGLE_KEYS } from "@/lib/rbac";
import { audit } from "@/services/audit";
import { User } from "@/lib/models";
import { staffCreateSchema } from "@/lib/schemas";

export const GET = route("staff.manage", async ({ session }) => User.find({ hotel: session.hotelId, deletedAt: null }).sort({ name: 1 }).lean());

export const POST = route("staff.manage", async ({ session, body }) => {
  const d = await body(staffCreateSchema);
  assertRoleAssignable(session.role, d.role);
  const bogus = Object.keys(d.permissions ?? {}).filter((k) => !CASHIER_TOGGLE_KEYS.has(k));
  if (bogus.length) throw bad(`These permissions cannot be assigned to a cashier: ${bogus.join(", ")}`);
  const u = await User.create({ hotel: session.hotelId, name: d.name, email: d.email, phone: d.phone, role: d.role, active: d.active, passwordHash: await hashPassword(d.password), ...(d.role === "cashier" ? { permissions: d.permissions ?? {}, ...(d.discountPolicy ? { discountPolicy: d.discountPolicy } : {}) } : {}) });
  await audit(session, { action: "staff.create", module: "staff", entity: "User", entityId: u._id, newValue: { role: d.role, email: d.email } });
  return { _id: u._id, name: u.name, email: u.email, role: u.role };
});
