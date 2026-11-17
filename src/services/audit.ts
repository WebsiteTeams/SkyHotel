import type { Session } from "@/lib/auth";
import { AuditLog } from "@/lib/models";

/** Single place to write audit entries so every important action records who, what, why and who approved. */
export async function audit(
  s: Pick<Session, "hotelId" | "userId" | "name">,
  e: { action: string; module: string; entity: string; entityId?: unknown; reason?: string; approvedBy?: string; previousValue?: unknown; newValue?: unknown; meta?: unknown },
  opts?: { session?: any },
) {
  await AuditLog.create([{ hotel: s.hotelId, user: s.userId, userName: s.name, ...e }], opts?.session ? { session: opts.session } : undefined);
}
