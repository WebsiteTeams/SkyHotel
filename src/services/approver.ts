import { ApiError } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { APPROVER_ROLES } from "@/lib/rbac";
import { User } from "@/lib/models";

// Throttle PIN guessing (per approver email). Use a shared store if you run several instances.
const fails = new Map<string, { n: number; until: number }>();

/** Verifies a manager / admin by email + approval PIN. Returns the approver's id and name. */
export async function verifyApprover(hotelId: string, email: string, pin: string, notSelfUserId?: string) {
  const key = `${hotelId}:${email.toLowerCase()}`;
  const f = fails.get(key);
  if (f && f.until > Date.now()) throw new ApiError(429, "Too many wrong PIN attempts. Try again in a few minutes.");
  const u = await User.findOne({ email: email.toLowerCase(), hotel: hotelId, active: true, deletedAt: null, role: { $in: APPROVER_ROLES } }).select("+pinHash name role");
  const ok = !!u && !!u.pinHash && /^\d{4,6}$/.test(pin) && (await verifyPassword(pin, u.pinHash));
  if (!ok) {
    const n = (f?.n ?? 0) + 1;
    fails.set(key, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    throw new ApiError(403, "Invalid manager email or PIN");
  }
  fails.delete(key);
  if (notSelfUserId && String(u._id) === notSelfUserId) throw new ApiError(403, "You cannot approve your own request");
  return { id: String(u._id), name: u.name as string };
}
