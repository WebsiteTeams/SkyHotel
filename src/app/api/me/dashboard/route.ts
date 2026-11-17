import { Types } from "mongoose";
import { route } from "@/lib/api";
import { Order, Payment } from "@/lib/models";
import { describeShift, getOpenShift } from "@/services/shifts";

/** The signed-in user's own numbers for today (cashier dashboard). Never includes other cashiers' data. */
export const GET = route(["pos.use", "billing.view", "shift.view"], async ({ actor }) => {
  const me = new Types.ObjectId(actor.userId), hotel = new Types.ObjectId(actor.hotelId);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [orders, pays, recent, shift] = await Promise.all([
    Order.aggregate([{ $match: { hotel, createdBy: me, status: "confirmed", createdAt: { $gte: start } } }, { $group: { _id: null, n: { $sum: 1 }, sales: { $sum: { $subtract: ["$grandTotal", "$refundedAmount"] } } } }]),
    Payment.aggregate([{ $match: { hotel, createdBy: me, createdAt: { $gte: start } } }, { $group: { _id: "$method", amount: { $sum: { $cond: [{ $eq: ["$kind", "payment"] }, "$amount", { $multiply: ["$amount", -1] }] } } } }]),
    Order.find({ hotel, createdBy: me }).sort({ createdAt: -1 }).limit(8).select("orderNo grandTotal status paymentStatus createdAt type table").lean(),
    getOpenShift(actor.userId),
  ]);
  const by = (m: string) => pays.find((p) => p._id === m)?.amount ?? 0;
  return { todaySales: orders[0]?.sales ?? 0, orders: orders[0]?.n ?? 0, cash: by("cash"), upi: by("upi"), card: by("card"), shift: shift ? await describeShift(shift) : null, recent };
});
