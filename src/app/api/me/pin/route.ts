import { z } from "zod";
import { route, bad } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { User } from "@/lib/models";
import { audit } from "@/services/audit";

const schema = z.object({ password: z.string().min(1, "Enter your password"), pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits") });

/** Managers / admins set their own approval PIN. Nobody can set another person's PIN. */
export const PUT = route("approvals.manage", async ({ actor, body }) => {
  const d = await body(schema);
  const u = await User.findById(actor.userId).select("+passwordHash");
  if (!u || !(await verifyPassword(d.password, u.passwordHash))) throw bad("Password is incorrect", { password: "Incorrect password" });
  await User.updateOne({ _id: u._id }, { pinHash: await hashPassword(d.pin), pinSet: true });
  await audit(actor, { action: "pin.set", module: "security", entity: "User", entityId: u._id });
  return true;
});
