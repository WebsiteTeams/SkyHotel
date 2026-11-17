import { route, notFound } from "@/lib/api";
import { AuditLog, Invoice, Order } from "@/lib/models";

export const POST = route<{ id: string }>("billing.reprint", async ({ session, params }) => {
  const o = await Order.findOne({ _id: params.id, hotel: session.hotelId });
  if (!o || (!session.can("billing.view_all") && String(o.createdBy) !== session.userId)) throw notFound("Bill not found");
  await Invoice.updateOne({ _id: o.invoice }, { $inc: { printCount: 1 } });
  await AuditLog.create({ hotel: session.hotelId, user: session.userId, userName: session.name, action: "bill.reprint", entity: "Order", entityId: o._id, meta: { orderNo: o.orderNo } });
  return true;
});
