import { Types } from "mongoose";
import { bad, conflict, forbidden, notFound } from "@/lib/api";
import type { Actor } from "@/lib/access";
import { CashierShift, Order, Payment } from "@/lib/models";
import { audit } from "./audit";

export const getOpenShift = (userId: string) => CashierShift.findOne({ cashier: userId, status: "open" });

/** Live numbers for one shift, derived from the immutable Payment records stamped with the shift id. */
export async function shiftTotals(shiftId: string | Types.ObjectId) {
  const [rows, bills, cancelled] = await Promise.all([
    Payment.aggregate([{ $match: { shift: new Types.ObjectId(String(shiftId)) } }, { $group: { _id: { m: "$method", k: "$kind" }, amount: { $sum: "$amount" }, n: { $sum: 1 } } }]),
    Order.countDocuments({ shift: shiftId, status: "confirmed" }),
    Order.countDocuments({ shift: shiftId, status: "cancelled" }),
  ]);
  const sum = (m: string, k: string) => rows.find((r) => r._id.m === m && r._id.k === k)?.amount ?? 0;
  const cashSales = sum("cash", "payment"), upiSales = sum("upi", "payment"), cardSales = sum("card", "payment");
  const cashRefunds = sum("cash", "refund");
  const refunds = ["cash", "upi", "card"].reduce((a, m) => a + sum(m, "refund"), 0);
  return { cashSales, upiSales, cardSales, cashRefunds, refunds, bills, cancelled };
}

/** Opening Cash + Cash Sales - Cash Refunds. UPI and card are tracked separately. */
export const expectedCash = (opening: number, t: { cashSales: number; cashRefunds: number }) => opening + t.cashSales - t.cashRefunds;

export async function describeShift(shift: any) {
  const o = shift.toObject ? shift.toObject() : shift;
  if (o.status === "closed") return { ...o, live: false };
  const t = await shiftTotals(o._id);
  return {
    ...o, live: true, totalCashSales: t.cashSales, totalUPISales: t.upiSales, totalCardSales: t.cardSales, totalRefunds: t.refunds,
    cashRefunds: t.cashRefunds, billCount: t.bills, cancelledCount: t.cancelled, expectedClosingCash: expectedCash(o.openingCash, t),
  };
}

export async function openShift(a: Actor, openingCash: number) {
  if (!a.can("shift.open")) throw forbidden("You are not allowed to open a shift");
  if (await getOpenShift(a.userId)) throw conflict("You already have an open shift");
  try {
    const s = await CashierShift.create({ hotel: a.hotelId, cashier: a.userId, openingCash, expectedClosingCash: openingCash });
    await audit(a, { action: "shift.open", module: "shift", entity: "CashierShift", entityId: s._id, newValue: { openingCash } });
    return describeShift(s);
  } catch (e: any) {
    if (e?.code === 11000) throw conflict("You already have an open shift");
    throw e;
  }
}

export async function closeShift(a: Actor, id: string, actualClosingCash: number, notes?: string) {
  if (!a.can("shift.close")) throw forbidden("You are not allowed to close a shift");
  const shift = await CashierShift.findOne({ _id: id, hotel: a.hotelId });
  if (!shift) throw notFound("Shift not found");
  if (String(shift.cashier) !== a.userId) throw forbidden("You can only close your own shift");
  if (shift.status !== "open") throw conflict("This shift is already closed");
  const t = await shiftTotals(shift._id);
  const expected = expectedCash(shift.openingCash, t);
  const closed = await CashierShift.findOneAndUpdate(
    { _id: id, status: "open" }, // guard against double close
    {
      status: "closed", closedAt: new Date(), actualClosingCash, expectedClosingCash: expected, cashDifference: actualClosingCash - expected,
      totalCashSales: t.cashSales, totalUPISales: t.upiSales, totalCardSales: t.cardSales, totalRefunds: t.refunds, cashRefunds: t.cashRefunds, billCount: t.bills, notes,
    },
    { returnDocument: "after" },
  );
  if (!closed) throw bad("This shift was already closed");
  await audit(a, { action: "shift.close", module: "shift", entity: "CashierShift", entityId: closed._id, previousValue: { expected }, newValue: { actualClosingCash, difference: closed.cashDifference }, reason: notes });
  return closed;
}
