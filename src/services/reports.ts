import { Types } from "mongoose";
import { Expense, FoodItem, InventoryItem, Order, OrderItem, Payment, Purchase, StockMovement } from "@/lib/models";

const oid = (id: string) => new Types.ObjectId(id);

/** Net of refunds, excluding GST: taxable * (1 - refunded / grandTotal). */
const netTaxable = { $cond: [{ $gt: ["$grandTotal", 0] }, { $multiply: ["$taxable", { $subtract: [1, { $divide: ["$refundedAmount", "$grandTotal"] }] }] }, 0] };

export async function salesSummary(hotel: string, from: Date, to: Date, group: "day" | "week" | "month" = "day") {
  const h = oid(hotel);
  const match = { hotel: h, createdAt: { $gte: from, $lte: to } };
  const fmt = group === "day" ? "%Y-%m-%d" : group === "month" ? "%Y-%m" : "%G-W%V";
  const [totals, cancelled, series, payments] = await Promise.all([
    Order.aggregate([
      { $match: { ...match, status: "confirmed" } },
      { $group: { _id: null, bills: { $sum: 1 }, gross: { $sum: "$grandTotal" }, refunds: { $sum: "$refundedAmount" }, discounts: { $sum: { $add: ["$itemDiscount", "$billDiscount"] } }, gst: { $sum: "$gst" }, taxable: { $sum: "$taxable" }, subtotal: { $sum: "$subtotal" } } },
    ]),
    Order.aggregate([{ $match: { ...match, status: "cancelled" } }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$grandTotal" } } }]),
    Order.aggregate([
      { $match: { ...match, status: "confirmed" } },
      { $group: { _id: { $dateToString: { format: fmt, date: "$createdAt", timezone: "Asia/Kolkata" } }, sales: { $sum: { $subtract: ["$grandTotal", "$refundedAmount"] } }, orders: { $sum: 1 }, gst: { $sum: "$gst" }, discounts: { $sum: { $add: ["$itemDiscount", "$billDiscount"] } } } },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: "$method", amount: { $sum: { $cond: [{ $eq: ["$kind", "payment"] }, "$amount", { $multiply: ["$amount", -1] }] } } } },
      { $sort: { amount: -1 } },
    ]),
  ]);
  const t = totals[0] ?? { bills: 0, gross: 0, refunds: 0, discounts: 0, gst: 0, taxable: 0, subtotal: 0 };
  return {
    bills: t.bills, revenue: t.gross - t.refunds, gross: t.gross, refunds: t.refunds, discounts: t.discounts, gst: t.gst, taxable: t.taxable,
    avgOrder: t.bills ? Math.round((t.gross - t.refunds) / t.bills) : 0,
    cancelledBills: cancelled[0]?.count ?? 0, cancelledAmount: cancelled[0]?.amount ?? 0,
    series: series.map((x) => ({ label: x._id, sales: x.sales, orders: x.orders, gst: x.gst, discounts: x.discounts })),
    payments: payments.map((x) => ({ method: x._id, amount: x.amount })),
  };
}

export async function bestSellers(hotel: string, from: Date, to: Date, limit = 5) {
  return OrderItem.aggregate([
    { $match: { hotel: oid(hotel), createdAt: { $gte: from, $lte: to } } },
    { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "o" } },
    { $match: { "o.status": "confirmed" } },
    { $group: { _id: "$food", name: { $first: "$name" }, qty: { $sum: "$qty" }, revenue: { $sum: "$total" } } },
    { $sort: { qty: -1 } }, { $limit: limit },
  ]);
}

export async function dashboard(hotel: string, range: "day" | "week" | "month") {
  const h = oid(hotel);
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const days = range === "day" ? 1 : range === "week" ? 7 : 30;
  const from = new Date(startOfDay.getTime() - (days - 1) * 86400000);
  const [today, period, foodCount, stockAgg, lowStock, recentOrders, recentPurchases, best, purchasesTotal, expenseToday] = await Promise.all([
    salesSummary(hotel, startOfDay, now),
    salesSummary(hotel, from, now, "day"),
    FoodItem.countDocuments({ hotel: h, deletedAt: null }),
    InventoryItem.aggregate([
      { $match: { hotel: h, deletedAt: null, active: true } },
      { $group: { _id: null, total: { $sum: 1 }, out: { $sum: { $cond: [{ $lte: ["$currentStock", 0] }, 1, 0] } }, low: { $sum: { $cond: [{ $and: [{ $gt: ["$currentStock", 0] }, { $lte: ["$currentStock", "$minStock"] }] }, 1, 0] } } } },
    ]),
    InventoryItem.find({ hotel: h, deletedAt: null, active: true, $expr: { $lte: ["$currentStock", "$minStock"] } }).sort({ currentStock: 1 }).limit(8).lean(),
    Order.find({ hotel: h }).sort({ createdAt: -1 }).limit(8).lean(),
    Purchase.find({ hotel: h, status: "confirmed" }).sort({ date: -1 }).limit(6).populate("supplier", "name").lean(),
    bestSellers(hotel, from, now),
    Purchase.aggregate([{ $match: { hotel: h, status: "confirmed", date: { $gte: from, $lte: now } } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
    Expense.aggregate([{ $match: { hotel: h, deletedAt: null, date: { $gte: startOfDay, $lte: now } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);
  const s = stockAgg[0] ?? { total: 0, out: 0, low: 0 };
  return {
    todaySales: today.revenue, todayOrders: today.bills, revenue: period.revenue, orders: period.bills, avgOrder: period.avgOrder,
    foodItems: foodCount, stockItems: s.total, availableStock: s.total - s.out, lowStock: s.low, outOfStock: s.out,
    purchases: purchasesTotal[0]?.total ?? 0, expensesToday: expenseToday[0]?.total ?? 0,
    series: period.series, payments: period.payments, best, recentOrders, lowStockItems: lowStock, recentPurchases,
  };
}

export async function inventoryReport(hotel: string, from: Date, to: Date) {
  const h = oid(hotel);
  const [items, consumption, wastage, stockIn] = await Promise.all([
    InventoryItem.find({ hotel: h, deletedAt: null }).sort({ name: 1 }).lean(),
    StockMovement.aggregate([
      { $match: { hotel: h, type: { $in: ["consumption", "consumption_reversal"] }, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$item", qty: { $sum: { $multiply: ["$qty", -1] } }, cost: { $sum: { $multiply: [{ $multiply: ["$qty", -1] }, "$unitCost"] } } } },
      { $lookup: { from: "inventoryitems", localField: "_id", foreignField: "_id", as: "i" } }, { $unwind: "$i" },
      { $project: { name: "$i.name", unit: "$i.baseUnit", qty: 1, cost: { $round: ["$cost", 0] } } }, { $sort: { cost: -1 } },
    ]),
    StockMovement.aggregate([
      { $match: { hotel: h, type: { $in: ["damage", "expired", "wastage"] }, createdAt: { $gte: from, $lte: to } } },
      { $lookup: { from: "inventoryitems", localField: "item", foreignField: "_id", as: "i" } }, { $unwind: "$i" },
      { $project: { name: "$i.name", unit: "$i.baseUnit", type: 1, qty: { $multiply: ["$qty", -1] }, cost: { $round: [{ $multiply: [{ $multiply: ["$qty", -1] }, "$unitCost"] }, 0] }, reason: 1, createdAt: 1 } },
      { $sort: { createdAt: -1 } },
    ]),
    Purchase.find({ hotel: h, date: { $gte: from, $lte: to } }).sort({ date: -1 }).populate("supplier", "name").lean(),
  ]);
  const now = new Date();
  const valuation = items.reduce((s, i: any) => s + Math.round(i.currentStock * i.avgCost), 0);
  return {
    items: items.map((i: any) => ({ ...i, value: Math.round(i.currentStock * i.avgCost) })),
    valuation, consumption, wastage, purchases: stockIn,
    low: items.filter((i: any) => i.currentStock <= i.minStock),
    expired: items.filter((i: any) => i.expiryDate && new Date(i.expiryDate) < now && i.currentStock > 0),
  };
}

/**
 * Profit methodology (kept explicit so the three numbers are never conflated):
 *  Revenue (net sales)  = Σ taxable value of confirmed bills net of refunds (GST excluded - it is owed to the government)
 *  COGS                 = ingredient cost consumed, valued at weighted-average cost at the time of sale (recipe-based; manual food cost if no recipe)
 *  Gross profit         = Revenue - COGS
 *  Wastage              = value of damaged / expired / wasted stock
 *  Operating expenses   = recorded expenses (rent, salaries ...)
 *  Net operating profit = Gross profit - Wastage - Operating expenses
 * Purchases are NOT an expense here (they become COGS when consumed); shown for cash-flow context only.
 */
export async function profitReport(hotel: string, from: Date, to: Date) {
  const h = oid(hotel);
  const [rev, wast, exp, pur, expByCat] = await Promise.all([
    Order.aggregate([{ $match: { hotel: h, status: "confirmed", createdAt: { $gte: from, $lte: to } } }, { $group: { _id: null, revenue: { $sum: netTaxable }, cogs: { $sum: "$cogs" }, gst: { $sum: "$gst" }, bills: { $sum: 1 } } }]),
    StockMovement.aggregate([{ $match: { hotel: h, type: { $in: ["damage", "expired", "wastage"] }, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: null, cost: { $sum: { $multiply: [{ $multiply: ["$qty", -1] }, "$unitCost"] } } } }]),
    Expense.aggregate([{ $match: { hotel: h, deletedAt: null, date: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Purchase.aggregate([{ $match: { hotel: h, status: "confirmed", date: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
    Expense.aggregate([{ $match: { hotel: h, deletedAt: null, date: { $gte: from, $lte: to } } }, { $group: { _id: "$category", total: { $sum: "$amount" } } }, { $sort: { total: -1 } }]),
  ]);
  const revenue = Math.round(rev[0]?.revenue ?? 0), cogs = rev[0]?.cogs ?? 0;
  const wastage = Math.round(wast[0]?.cost ?? 0), opex = exp[0]?.total ?? 0;
  const grossProfit = revenue - cogs;
  return {
    bills: rev[0]?.bills ?? 0, revenue, gstCollected: rev[0]?.gst ?? 0, cogs, grossProfit,
    grossMargin: revenue ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
    wastage, operatingExpenses: opex, netProfit: grossProfit - wastage - opex,
    purchases: pur[0]?.total ?? 0, expensesByCategory: expByCat.map((x) => ({ category: x._id, total: x.total })),
  };
}
