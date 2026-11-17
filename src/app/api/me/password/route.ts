import { z } from "zod";
import { route, bad } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { User } from "@/lib/models";
import { audit } from "@/services/audit";

const schema = z.object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: z.string().min(8, "At least 8 characters") });

export const PUT = route(null, async ({ actor, body }) => {
  const d = await body(schema);
  const u = await User.findById(actor.userId).select("+passwordHash");
  if (!u || !(await verifyPassword(d.currentPassword, u.passwordHash))) throw bad("Current password is incorrect", { currentPassword: "Incorrect password" });
  u.passwordHash = await hashPassword(d.newPassword);
  await u.save();
  await audit(actor, { action: "password.change", module: "security", entity: "User", entityId: u._id });
  return true;
});
