import { route, notFound } from "@/lib/api";
import { Invoice, Order, OrderItem, Payment } from "@/lib/models";

export const GET = route<{ id: string }>("billing.view", async ({ session, params }) => {
  const hideCost = !session.can("reports.profit");
  const order = await Order.findOne({ _id: params.id, hotel: session.hotelId }).select(hideCost ? "-cogs -idempotencyKey" : "").populate("createdBy", "name").populate("cancelledBy", "name").lean<any>();
  if (!order) throw notFound("Bill not found");
  // Someone else's bill looks exactly like a bill that does not exist.
  if (!session.can("billing.view_all") && String(order.createdBy._id) !== session.userId) throw notFound("Bill not found");
  const [items, invoice, payments] = await Promise.all([
    OrderItem.find({ order: order._id }).select(hideCost ? "-cogs -consumption" : "").lean(),
    Invoice.findById(order.invoice).lean(),
    Payment.find({ order: order._id }).sort({ createdAt: 1 }).populate("createdBy", "name").lean(),
  ]);
  return { order, items, invoice, payments };
});
