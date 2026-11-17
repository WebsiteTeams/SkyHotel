import { User } from "./models";
import type { Session } from "./auth";
import { DEFAULT_DISCOUNT_POLICY, effectivePermissions, type DiscountPolicy, type Permission, type Role } from "./rbac";

/** A signed-in user whose role, active flag and permissions were just re-read from the database. */
export interface Actor extends Session {
  perms: Set<Permission>;
  discountPolicy: DiscountPolicy;
  can: (p: Permission) => boolean;
}

/**
 * The JWT only proves identity. Role, active status and per-user permissions are always reloaded,
 * so deactivating a user or changing their permissions takes effect on the very next request.
 */
export async function loadActor(s: Session): Promise<Actor | null> {
  const u = await User.findOne({ _id: s.userId, hotel: s.hotelId, deletedAt: null, active: true }).lean<any>();
  if (!u) return null;
  const list = effectivePermissions(u.role as Role, u.permissions);
  const perms = new Set<Permission>(list);
  return {
    userId: String(u._id),
    hotelId: String(u.hotel),
    role: u.role,
    name: u.name,
    email: u.email,
    perms,
    discountPolicy: { ...DEFAULT_DISCOUNT_POLICY, ...(u.discountPolicy ?? {}) },
    can: (p) => perms.has(p),
  };
}
