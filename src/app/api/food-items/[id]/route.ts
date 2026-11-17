import { route, notFound } from "@/lib/api";
import { FoodItem, Recipe } from "@/lib/models";
import { foodSchema } from "@/lib/schemas";

type P = { id: string };

export const GET = route<P>("catalog.view", async ({ session, params }) => {
  const f = await FoodItem.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null }).select(session.can("catalog.manage") ? "" : "-cost").lean();
  if (!f) throw notFound("Food item not found");
  return f;
});

export const PUT = route<P>("catalog.manage", async ({ session, params, body }) => {
  const data = await body(foodSchema);
  const f = await FoodItem.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, data, { returnDocument: "after" });
  if (!f) throw notFound("Food item not found");
  return f;
});

export const DELETE = route<P>("catalog.manage", async ({ session, params }) => {
  const f = await FoodItem.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, { deletedAt: new Date(), available: false });
  if (!f) throw notFound("Food item not found");
  await Recipe.updateOne({ food: params.id }, { deletedAt: new Date() });
  return true;
});
