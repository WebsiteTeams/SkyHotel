import { route, esc, paging, pageResult, bad } from "@/lib/api";
import { foodSchema } from "@/lib/schemas";
import { Category, FoodItem } from "@/lib/models";


export const GET = route("catalog.view", async ({ session, query }) => {
  const { page, limit, skip } = paging(query, query.get("all") ? 500 : 20);
  const f: Record<string, unknown> = { hotel: session.hotelId, deletedAt: null };
  if (query.get("q")) f.name = new RegExp(esc(query.get("q")!), "i");
  if (query.get("category")) f.category = query.get("category");
  if (query.get("available")) f.available = query.get("available") === "true";
  const [items, total] = await Promise.all([
    FoodItem.find(f).select(session.can("catalog.manage") ? "" : "-cost").sort({ name: 1 }).skip(skip).limit(limit).populate("category", "name").lean(),
    FoodItem.countDocuments(f),
  ]);
  return pageResult(items, total, page, limit);
});

export const POST = route("catalog.manage", async ({ session, body }) => {
  const data = await body(foodSchema);
  if (!(await Category.exists({ _id: data.category, hotel: session.hotelId, deletedAt: null }))) throw bad("Category not found");
  return FoodItem.create({ ...data, hotel: session.hotelId });
});
