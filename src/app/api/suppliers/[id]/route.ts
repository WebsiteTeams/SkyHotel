import { route, notFound } from "@/lib/api";
import { Purchase, Supplier } from "@/lib/models";
import { supplierSchema } from "@/lib/schemas";

type P = { id: string };

export const GET = route<P>("suppliers.manage", async ({ session, params }) => {
  const supplier = await Supplier.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null }).lean();
  if (!supplier) throw notFound("Supplier not found");
  const purchases = await Purchase.find({ supplier: params.id, hotel: session.hotelId }).sort({ date: -1 }).lean<any[]>();
  const live = purchases.filter((p) => p.status === "confirmed");
  const payments = live.flatMap((p) => (p.payments ?? []).map((x: any) => ({ ...x, purchaseNo: p.purchaseNo, purchaseId: p._id }))).sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const total = live.reduce((s, p) => s + p.total, 0);
  const paid = live.reduce((s, p) => s + p.paidAmount, 0);
  return { supplier, purchases, payments, totalPurchases: total, outstanding: total - paid };
});

export const PUT = route<P>("suppliers.manage", async ({ session, params, body }) => {
  const s = await Supplier.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, await body(supplierSchema), { returnDocument: "after" });
  if (!s) throw notFound("Supplier not found");
  return s;
});

export const DELETE = route<P>("suppliers.manage", async ({ session, params }) => {
  const s = await Supplier.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, { deletedAt: new Date() });
  if (!s) throw notFound("Supplier not found");
  return true;
});
