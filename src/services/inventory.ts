import type { Types } from "mongoose";
import type { Tx } from "@/lib/atomic";
import { conflict } from "@/lib/api";
import { InventoryItem, StockMovement, Notification } from "@/lib/models";
import type { MOVEMENT_TYPES } from "@/lib/models/stock";

export interface MoveInput {
  hotel: Types.ObjectId | string;
  item: Types.ObjectId | string;
  type: (typeof MOVEMENT_TYPES)[number];
  /** Signed quantity in BASE units. Negative = stock out. */
  qty: number;
  refModel?: string;
  refId?: Types.ObjectId | string;
  refNo?: string;
  reason?: string;
  userId?: Types.ObjectId | string;
  /** Paise per base unit; defaults to the item's current average cost. */
  unitCost?: number;
  /** Deduct only what is available instead of failing (used when blocking is disabled). */
  clamp?: boolean;
}

/**
 * The ONLY way stock changes. Guarantees: never negative (conditional update),
 * always writes an immutable StockMovement, and compensates on failure without transactions.
 */
export async function moveStock(tx: Tx, m: MoveInput) {
  const filter: Record<string, unknown> = { _id: m.item, hotel: m.hotel, deletedAt: null };
  let qty = Math.round(m.qty * 1000) / 1000;
  if (qty === 0) return null;

  if (qty < 0) {
    if (m.clamp) {
      const cur = await InventoryItem.findOne(filter, "currentStock", { session: tx.session });
      if (!cur) throw conflict("Inventory item not found");
      qty = -Math.min(cur.currentStock, -qty);
      if (qty === 0) return null;
    }
    filter.currentStock = { $gte: -qty };
  }
  const updated = await InventoryItem.findOneAndUpdate(filter, { $inc: { currentStock: qty } }, { returnDocument: "after", session: tx.session });
  if (!updated) {
    const it = await InventoryItem.findOne({ _id: m.item, hotel: m.hotel }, "name currentStock baseUnit");
    throw conflict(it ? `Insufficient stock for ${it.name} (available ${it.currentStock} ${it.baseUnit})` : "Inventory item not found");
  }
  tx.onRollback(() => InventoryItem.updateOne({ _id: m.item }, { $inc: { currentStock: -qty } }));

  const [mv] = await StockMovement.create(
    [{
      hotel: m.hotel, item: m.item, type: m.type, qty, balanceAfter: updated.currentStock,
      unitCost: m.unitCost ?? updated.avgCost, refModel: m.refModel, refId: m.refId, refNo: m.refNo,
      reason: m.reason, createdBy: m.userId,
    }],
    { session: tx.session },
  );
  tx.onRollback(async () => {
    await StockMovement.collection.deleteOne({ _id: mv._id });
  });
  return { movement: mv, item: updated };
}

/** Creates low / out-of-stock / expiry notifications, de-duplicated against unread ones. */
export async function raiseStockAlerts(hotel: Types.ObjectId | string, itemIds: Array<Types.ObjectId | string>) {
  const items = await InventoryItem.find({ _id: { $in: itemIds }, hotel, deletedAt: null });
  for (const it of items) {
    const type = it.currentStock <= 0 ? "out_of_stock" : it.currentStock <= it.minStock ? "low_stock" : null;
    if (!type) continue;
    const exists = await Notification.exists({ hotel, refId: it._id, type, read: false });
    if (exists) continue;
    await Notification.create({
      hotel, type, refModel: "InventoryItem", refId: it._id,
      title: type === "out_of_stock" ? `${it.name} is out of stock` : `${it.name} is running low`,
      message: `Current ${it.currentStock} ${it.baseUnit}, minimum ${it.minStock} ${it.baseUnit}`,
    });
  }
}
