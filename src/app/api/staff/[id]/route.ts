import { route, notFound, bad } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { assertRoleAssignable } from "@/lib/guards";
import { AuditLog, User } from "@/lib/models";
import { staffUpdateSchema } from "@/lib/schemas";

type P = { id: string };

export const PUT = route<P>("staff.manage", async ({ session, params, body }) => {
  const d = await body(staffUpdateSchema);
  assertRoleAssignable(session.role, d.role);
  const u = await User.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null });
  if (!u) throw notFound("User not found");
  if (u.role === "super_admin" && session.role !== "super_admin") throw bad("Only a Super Admin can edit a Super Admin");
  if (String(u._id) === session.userId && (!d.active || d.role !== u.role)) throw bad("You cannot deactivate or change the role of your own account");
  Object.assign(u, { name: d.name, phone: d.phone, role: d.role, active: d.active });
  if (d.password) u.passwordHash = await hashPassword(d.password);
  await u.save();
  await AuditLog.create({ hotel: session.hotelId, user: session.userId, userName: session.name, action: "staff.update", entity: "User", entityId: u._id, meta: { role: d.role, active: d.active, passwordReset: !!d.password } });
  return { _id: u._id };
});

export const DELETE = route<P>("staff.manage", async ({ session, params }) => {
  if (params.id === session.userId) throw bad("You cannot delete your own account");
  const u = await User.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null });
  if (!u) throw notFound("User not found");
  if (u.role === "super_admin" && session.role !== "super_admin") throw bad("Only a Super Admin can remove a Super Admin");
  u.deletedAt = new Date(); u.active = false; await u.save();
  return true;
});
