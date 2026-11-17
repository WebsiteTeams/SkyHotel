import { atomic } from "@/lib/atomic";
import { route, esc, paging, pageResult } from "@/lib/api";
import { InventoryItem } from "@/lib/models";
import { inventorySchema } from "@/lib/schemas";
import { baseUnitOf, toBase, type Unit } from "@/lib/units";
import { moveStock } from "@/services/inventory";

export const GET = route("inventory.view", async ({ session, query }) => {
  const { page, limit, skip } = paging(query, query.get("all") ? 1000 : 20);
  const f: Record<string, any> = { hotel: session.hotelId, deletedAt: null };
  const q = query.get("q");
  if (q) f.$or = [{ name: new RegExp(esc(q), "i") }, { sku: new RegExp(esc(q), "i") }];
  if (query.get("category")) f.category = query.get("category");
  const st = query.get("status");
  if (st === "out") f.currentStock = { $lte: 0 };
  if (st === "low") f.$expr = { $and: [{ $gt: ["$currentStock", 0] }, { $lte: ["$currentStock", "$minStock"] }] };
  if (st === "ok") f.$expr = { $gt: ["$currentStock", "$minStock"] };
  const [items, total, categories] = await Promise.all([
    InventoryItem.find(f).sort({ name: 1 }).skip(skip).limit(limit).populate("supplier", "name").lean(),
    InventoryItem.countDocuments(f),
    InventoryItem.distinct("category", { hotel: session.hotelId, deletedAt: null }),
  ]);
  return { ...pageResult(items, total, page, limit), categories };
});

export const POST = route("inventory.manage", async ({ session, body }) => {
  const d = await body(inventorySchema);
  const unit = d.unit as Unit;
  const opening = toBase(d.openingStock, unit);
  return atomic(async (tx) => {
    const [item] = await InventoryItem.create([{
      hotel: session.hotelId, name: d.name, sku: d.sku, category: d.category, unit, baseUnit: baseUnitOf(unit),
      openingStock: opening, currentStock: 0, minStock: toBase(d.minStock, unit), purchasePrice: d.purchasePrice,
      avgCost: d.purchasePrice / toBase(1, unit), supplier: d.supplier || undefined,
      expiryDate: d.expiryDate ? new Date(d.expiryDate) : undefined, location: d.location, description: d.description,
    }], { session: tx.session });
    tx.onRollback(() => InventoryItem.collection.deleteOne({ _id: item._id }));
    // Opening stock enters through the ledger like any other movement.
    if (opening > 0) await moveStock(tx, { hotel: session.hotelId, item: item._id, type: "opening", qty: opening, reason: "Opening stock", userId: session.userId });
    return InventoryItem.findById(item._id);
  });
});
