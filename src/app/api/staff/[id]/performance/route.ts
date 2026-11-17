import { Types } from "mongoose";
import { route, notFound, dateRange } from "@/lib/api";
import { CashierShift, Order, User } from "@/lib/models";

/** Sales performance of one staff member over a date range (admin view). */
export const GET = route<{ id: string }>("staff.manage", async ({ session, params, query }) => {
  const u = await User.findOne({ _id: params.id, hotel: session.hotelId, deletedAt: null }, "name role");
  if (!u) throw notFound("User not found");
  const { from, to } = dateRange(query, 30);
  const base = { hotel: new Types.ObjectId(session.hotelId), createdBy: u._id, createdAt: { $gte: from, $lte: to } };
  const [agg, cancelled, shifts] = await Promise.all([
    Order.aggregate([{ $match: { ...base, status: "confirmed" } }, { $group: { _id: null, bills: { $sum: 1 }, sales: { $sum: { $subtract: ["$grandTotal", "$refundedAmount"] } }, discounts: { $sum: { $add: ["$itemDiscount", "$billDiscount"] } } } }]),
    Order.countDocuments({ ...base, status: "cancelled" }),
    CashierShift.find({ cashier: u._id, openedAt: { $gte: from, $lte: to } }).sort({ openedAt: -1 }).limit(20).lean(),
  ]);
  const a = agg[0] ?? { bills: 0, sales: 0, discounts: 0 };
  const closed = shifts.filter((s: any) => s.status === "closed");
  return {
    user: u, bills: a.bills, sales: a.sales, discounts: a.discounts, cancelled, avgBill: a.bills ? Math.round(a.sales / a.bills) : 0,
    shifts: shifts.length, cashDifference: closed.reduce((t: number, s: any) => t + (s.cashDifference ?? 0), 0), recentShifts: shifts,
  };
});
