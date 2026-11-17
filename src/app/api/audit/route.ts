import { route, paging, pageResult } from "@/lib/api";
import { AuditLog } from "@/lib/models";

export const GET = route("audit.view", async ({ session, query }) => {
  const { page, limit, skip } = paging(query, 25);
  const f: Record<string, any> = { hotel: session.hotelId };
  if (query.get("action")) f.action = query.get("action");
  if (query.get("module")) f.module = query.get("module");
  if (query.get("user")) f.user = query.get("user");
  const [items, total] = await Promise.all([AuditLog.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("approvedBy", "name").lean(), AuditLog.countDocuments(f)]);
  return pageResult(items, total, page, limit);
});
