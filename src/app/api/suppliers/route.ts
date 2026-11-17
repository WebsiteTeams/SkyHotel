import { Types } from "mongoose";
import { route, esc } from "@/lib/api";
import { Purchase, Supplier } from "@/lib/models";
import { supplierSchema } from "@/lib/schemas";

export const GET = route(["suppliers.manage", "inventory.view", "purchases.manage"], async ({ session, query }) => {
  const q = query.get("q");
  const suppliers = await Supplier.find({ hotel: session.hotelId, deletedAt: null, ...(q ? { name: new RegExp(esc(q), "i") } : {}) }).sort({ name: 1 }).lean();
  const agg = await Purchase.aggregate([
    { $match: { hotel: new Types.ObjectId(session.hotelId), status: "confirmed" } },
    { $group: { _id: "$supplier", total: { $sum: "$total" }, paid: { $sum: "$paidAmount" }, count: { $sum: 1 } } },
  ]);
  const m = new Map(agg.map((a) => [String(a._id), a]));
  return suppliers.map((s) => {
    const a = m.get(String(s._id));
    return { ...s, totalPurchases: a?.total ?? 0, purchaseCount: a?.count ?? 0, outstanding: (a?.total ?? 0) - (a?.paid ?? 0) };
  });
});

export const POST = route("suppliers.manage", async ({ session, body }) => Supplier.create({ ...(await body(supplierSchema)), hotel: session.hotelId }));
