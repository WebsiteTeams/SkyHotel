import { z } from "zod";
import { atomic } from "@/lib/atomic";
import { route, notFound, bad } from "@/lib/api";
import { InventoryItem } from "@/lib/models";
import { UNITS, isCompatible, toBase, type Unit } from "@/lib/units";
import { moveStock, raiseStockAlerts } from "@/services/inventory";

const schema = z.object({
  direction: z.enum(["in", "out"]),
  reason: z.enum(["manual", "damage", "expired", "wastage"]).default("manual"),
  quantity: z.number().positive("Quantity must be greater than zero"),
  unit: z.enum(UNITS),
  note: z.string().trim().min(3, "Please give a reason").max(200),
});

export const POST = route<{ id: string }>("inventory.manage", async ({ session, params, body }) => {
  const d = await body(schema);
  const item = await InventoryItem.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null });
  if (!item) throw notFound("Item not found");
  if (!isCompatible(d.unit as Unit, item.unit as Unit)) throw bad(`Use a ${item.baseUnit}-compatible unit`);
  const qty = toBase(d.quantity, d.unit as Unit);
  const type = d.direction === "in" ? "manual_in" : d.reason === "manual" ? "manual_out" : d.reason;
  await atomic((tx) => moveStock(tx, { hotel: session.hotelId, item: item._id, type, qty: d.direction === "in" ? qty : -qty, reason: d.note, userId: session.userId, refModel: "Manual" }));
  await raiseStockAlerts(session.hotelId, [item._id]);
  return InventoryItem.findById(item._id);
});
