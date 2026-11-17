import { route, paging, pageResult, dateRange } from "@/lib/api";
import { Expense } from "@/lib/models";
import { expenseSchema } from "@/lib/schemas";

export const GET = route("expenses.manage", async ({ session, query }) => {
  const { page, limit, skip } = paging(query, 20);
  const { from, to } = dateRange(query, 30);
  const f: Record<string, any> = { hotel: session.hotelId, deletedAt: null, date: { $gte: from, $lte: to } };
  if (query.get("category")) f.category = query.get("category");
  const [items, total, sum] = await Promise.all([
    Expense.find(f).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Expense.countDocuments(f),
    Expense.aggregate([{ $match: { ...f, hotel: (await import("mongoose")).Types.ObjectId.createFromHexString(session.hotelId) } }, { $group: { _id: "$category", total: { $sum: "$amount" } } }]),
  ]);
  return { ...pageResult(items, total, page, limit), byCategory: sum.map((s) => ({ category: s._id, total: s.total })), total: sum.reduce((a, s) => a + s.total, 0) };
});

export const POST = route("expenses.manage", async ({ session, body }) => {
  const d = await body(expenseSchema);
  return Expense.create({ ...d, date: new Date(d.date), hotel: session.hotelId, createdBy: session.userId });
});
