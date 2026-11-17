import { route } from "@/lib/api";
import { FoodItem, InventoryItem, Recipe, RecipeIngredient } from "@/lib/models";

/** Every food item with its recipe cost and estimated profit. */
export const GET = route("recipes.manage", async ({ session }) => {
  const foods = await FoodItem.find({ hotel: session.hotelId, deletedAt: null }).sort({ name: 1 }).populate("category", "name").lean();
  const recipes = await Recipe.find({ hotel: session.hotelId, deletedAt: null }).lean();
  const ings = await RecipeIngredient.find({ recipe: { $in: recipes.map((r) => r._id) } }).lean();
  const inv = await InventoryItem.find({ hotel: session.hotelId }, "avgCost").lean();
  const cost = new Map(inv.map((i) => [String(i._id), i.avgCost]));
  const rByFood = new Map(recipes.map((r) => [String(r.food), r]));
  return foods.map((f) => {
    const r = rByFood.get(String(f._id));
    const mine = r ? ings.filter((i) => String(i.recipe) === String(r._id)) : [];
    const recipeCost = Math.round(mine.reduce((s, i) => s + i.quantityBase * (cost.get(String(i.item)) ?? 0), 0));
    return { ...f, hasRecipe: !!r, version: r?.version, ingredientCount: mine.length, recipeCost, profit: f.price - recipeCost };
  });
});
