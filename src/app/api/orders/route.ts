import { route, esc, paging, pageResult, dateRange } from "@/lib/api";
import { Order } from "@/lib/models";
import { createOrder, orderInput } from "@/services/billing";

export const GET = route("billing.view", async ({ session, query }) => {
  const { page, limit, skip } = paging(query, 20);
  const { from, to } = dateRange(query, 30);
  const f: Record<string, any> = { hotel: session.hotelId, createdAt: { $gte: from, $lte: to } };
  if (query.get("status")) f.status = query.get("status");
  if (query.get("payment")) f.paymentStatus = query.get("payment");
  if (query.get("q")) { const r = new RegExp(esc(query.get("q")!), "i"); f.$or = [{ orderNo: r }, { customerPhone: r }, { customerName: r }]; }
  // Without "view all bills" you only ever see your own, whatever the query says.
  if (!session.can("billing.view_all")) f.createdBy = session.userId;
  const [items, total] = await Promise.all([
    Order.find(f).select(session.can("reports.profit") ? "" : "-cogs -idempotencyKey").sort({ createdAt: -1 }).skip(skip).limit(limit).populate("createdBy", "name").lean(),
    Order.countDocuments(f),
  ]);
  return pageResult(items, total, page, limit);
});

export const POST = route("bills.create", async ({ session, body }) => {
  const input = await body(orderInput);
  const { order, duplicate } = await createOrder(input, session);
  return { order, duplicate };
});
