import { route, notFound, conflict } from "@/lib/api";
import { InventoryItem, RecipeIngredient, StockMovement } from "@/lib/models";
import { inventorySchema } from "@/lib/schemas";
import { toBase, baseUnitOf, type Unit } from "@/lib/units";

type P = { id: string };

export const GET = route<P>("inventory.view", async ({ session, params }) => {
  const item = await InventoryItem.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null }).populate("supplier", "name").lean();
  if (!item) throw notFound("Item not found");
  const movements = await StockMovement.find({ item: params.id }).sort({ createdAt: -1 }).limit(100).populate("createdBy", "name").lean();
  return { item, movements };
});

/** Stock quantity is NOT editable here - it only moves via the ledger (purchases, stock in/out). */
export const PUT = route<P>("inventory.manage", async ({ session, params, body }) => {
  const d = await body(inventorySchema);
  const cur = await InventoryItem.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null });
  if (!cur) throw notFound("Item not found");
  const unit = d.unit as Unit;
  if (baseUnitOf(unit) !== cur.baseUnit) throw conflict(`Unit must stay in the ${cur.baseUnit} family because stock history exists`);
  Object.assign(cur, {
    name: d.name, sku: d.sku, category: d.category, unit, minStock: toBase(d.minStock, unit), purchasePrice: d.purchasePrice,
    supplier: d.supplier || undefined, expiryDate: d.expiryDate ? new Date(d.expiryDate) : undefined, location: d.location, description: d.description,
  });
  await cur.save();
  return cur;
});

export const DELETE = route<P>("inventory.manage", async ({ session, params }) => {
  if (await RecipeIngredient.exists({ item: params.id })) throw conflict("This item is used in a recipe. Remove it from recipes first.");
  const it = await InventoryItem.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, { deletedAt: new Date(), active: false });
  if (!it) throw notFound("Item not found");
  return true;
});
