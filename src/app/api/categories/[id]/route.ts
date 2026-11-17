import { route, notFound, conflict } from "@/lib/api";
import { Category, FoodItem } from "@/lib/models";
import { categorySchema } from "@/lib/schemas";

type P = { id: string };

export const PUT = route<P>("catalog.manage", async ({ session, params, body }) => {
  const data = await body(categorySchema);
  const c = await Category.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, data, { returnDocument: "after" });
  if (!c) throw notFound("Category not found");
  return c;
});

export const DELETE = route<P>("catalog.manage", async ({ session, params }) => {
  if (await FoodItem.exists({ category: params.id, hotel: session.hotelId, deletedAt: null }))
    throw conflict("Move or delete the food items in this category first");
  const c = await Category.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, { deletedAt: new Date() });
  if (!c) throw notFound("Category not found");
  return true;
});
