import { z } from "zod";
import { route, notFound, bad } from "@/lib/api";
import { AuditLog, FoodItem, InventoryItem, Recipe, RecipeIngredient } from "@/lib/models";
import { UNITS, isCompatible, toBase, type Unit } from "@/lib/units";

type P = { foodId: string };

export const GET = route<P>("recipes.manage", async ({ session, params }) => {
  const food = await FoodItem.findOne({ _id: params.foodId, hotel: session.hotelId, deletedAt: null }).lean();
  if (!food) throw notFound("Food item not found");
  const recipe = await Recipe.findOne({ food: params.foodId, deletedAt: null }).lean();
  const ingredients = recipe ? await RecipeIngredient.find({ recipe: recipe._id }).populate("item", "name unit baseUnit currentStock avgCost").lean() : [];
  return { food, recipe, ingredients };
});

const schema = z.object({
  notes: z.string().max(300).optional(),
  ingredients: z.array(z.object({ item: z.string(), quantity: z.number().positive("Quantity must be > 0"), unit: z.enum(UNITS) })).min(1, "Add at least one ingredient"),
});

/** Replaces the ingredient list and bumps the version. Past orders keep their own consumption snapshots. */
export const PUT = route<P>("recipes.manage", async ({ session, params, body }) => {
  const d = await body(schema);
  const food = await FoodItem.findOne({ _id: params.foodId, hotel: session.hotelId, deletedAt: null });
  if (!food) throw notFound("Food item not found");
  const ids = d.ingredients.map((i) => i.item);
  if (new Set(ids).size !== ids.length) throw bad("An ingredient appears more than once");
  const items = await InventoryItem.find({ _id: { $in: ids }, hotel: session.hotelId, deletedAt: null });
  const by = new Map(items.map((i) => [String(i._id), i]));
  const rows = d.ingredients.map((i) => {
    const it = by.get(i.item);
    if (!it) throw bad("An ingredient no longer exists");
    if (!isCompatible(i.unit as Unit, it.unit as Unit)) throw bad(`${it.name}: ${i.unit} cannot be converted to ${it.unit}`);
    return { item: it._id, quantity: i.quantity, unit: i.unit, quantityBase: toBase(i.quantity, i.unit as Unit) };
  });
  let recipe = await Recipe.findOne({ food: food._id });
  if (recipe) {
    recipe.version += 1; recipe.deletedAt = null; recipe.notes = d.notes; await recipe.save();
    await RecipeIngredient.deleteMany({ recipe: recipe._id });
  } else recipe = await Recipe.create({ hotel: session.hotelId, food: food._id, notes: d.notes });
  await RecipeIngredient.create(rows.map((r) => ({ ...r, hotel: session.hotelId, recipe: recipe!._id })));
  await AuditLog.create({ hotel: session.hotelId, user: session.userId, userName: session.name, action: "recipe.update", entity: "Recipe", entityId: recipe._id, meta: { food: food.name, version: recipe.version } });
  return recipe;
});

export const DELETE = route<P>("recipes.manage", async ({ session, params }) => {
  const r = await Recipe.findOne({ food: params.foodId, hotel: session.hotelId });
  if (!r) throw notFound("Recipe not found");
  await RecipeIngredient.deleteMany({ recipe: r._id });
  await Recipe.deleteOne({ _id: r._id });
  return true;
});
