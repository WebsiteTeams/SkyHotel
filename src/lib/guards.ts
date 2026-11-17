import { forbidden } from "./api";
import type { Role } from "./rbac";

/** Only a Super Admin can mint Super Admins. */
export function assertRoleAssignable(actor: Role, target: Role) {
  if (target === "super_admin" && actor !== "super_admin") throw forbidden("Only a Super Admin can assign the Super Admin role");
}
