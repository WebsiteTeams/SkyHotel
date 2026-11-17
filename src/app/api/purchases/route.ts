import { route, paging, pageResult, dateRange } from "@/lib/api";
import { Purchase } from "@/lib/models";
import { createPurchase, purchaseInput } from "@/services/purchases";

export const GET = route("purchases.manage", async ({ session, query }) => {
  const { page, limit, skip } = paging(query, 20);
  const { from, to } = dateRange(query, 90);
  const f: Record<string, any> = { hotel: session.hotelId, date: { $gte: from, $lte: to } };
  for (const k of ["supplier", "status", "paymentStatus"]) if (query.get(k)) f[k] = query.get(k);
  const [items, total] = await Promise.all([
    Purchase.find(f).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).populate("supplier", "name").lean(),
    Purchase.countDocuments(f),
  ]);
  return pageResult(items, total, page, limit);
});

export const POST = route("purchases.manage", async ({ session, body }) => createPurchase(await body(purchaseInput), session));
