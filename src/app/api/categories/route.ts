import { route, esc } from "@/lib/api";
import { categorySchema } from "@/lib/schemas";
import { Category, FoodItem } from "@/lib/models";


export const GET = route("catalog.view", async ({ session, query }) => {
  const q = query.get("q");
  const cats = await Category.find({ hotel: session.hotelId, deletedAt: null, ...(q ? { name: new RegExp(esc(q), "i") } : {}) }).sort({ sortOrder: 1, name: 1 }).lean();
  const counts = await FoodItem.aggregate([{ $match: { hotel: cats[0]?.hotel, deletedAt: null } }, { $group: { _id: "$category", n: { $sum: 1 } } }]);
  const m = new Map(counts.map((c) => [String(c._id), c.n]));
  return cats.map((c) => ({ ...c, foodCount: m.get(String(c._id)) ?? 0 }));
});

export const POST = route("catalog.manage", async ({ session, body }) => {
  const data = await body(categorySchema);
  return Category.create({ ...data, hotel: session.hotelId });
});
