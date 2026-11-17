import { route, paging, pageResult, dateRange } from "@/lib/api";
import { StockMovement } from "@/lib/models";

export const GET = route("inventory.view", async ({ session, query }) => {
  const { page, limit, skip } = paging(query, 25);
  const { from, to } = dateRange(query, 30);
  const f: Record<string, any> = { hotel: session.hotelId, createdAt: { $gte: from, $lte: to } };
  if (query.get("type")) f.type = query.get("type");
  if (query.get("item")) f.item = query.get("item");
  const [items, total] = await Promise.all([
    StockMovement.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("item", "name sku baseUnit").populate("createdBy", "name").lean(),
    StockMovement.countDocuments(f),
  ]);
  return pageResult(items, total, page, limit);
});
