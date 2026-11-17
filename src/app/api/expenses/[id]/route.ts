import { route, notFound } from "@/lib/api";
import { AuditLog, Expense } from "@/lib/models";
import { expenseSchema } from "@/lib/schemas";

type P = { id: string };

export const PUT = route<P>("expenses.manage", async ({ session, params, body }) => {
  const d = await body(expenseSchema);
  const e = await Expense.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, { ...d, date: new Date(d.date) }, { returnDocument: "after" });
  if (!e) throw notFound("Expense not found");
  return e;
});

export const DELETE = route<P>("expenses.manage", async ({ session, params }) => {
  const e = await Expense.findOneAndUpdate({ _id: params.id, hotel: session.hotelId, deletedAt: null }, { deletedAt: new Date() });
  if (!e) throw notFound("Expense not found");
  await AuditLog.create({ hotel: session.hotelId, user: session.userId, userName: session.name, action: "expense.delete", entity: "Expense", entityId: e._id, meta: { amount: e.amount, category: e.category } });
  return true;
});
