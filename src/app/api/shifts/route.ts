import { Types } from "mongoose";
import { z } from "zod";
import { route, paging, pageResult, dateRange } from "@/lib/api";
import { CashierShift } from "@/lib/models";
import { describeShift, openShift } from "@/services/shifts";

/** Cashiers see only their own shifts. Staff managers / approvers can list every cashier's (optionally filtered). */
export const GET = route(["shift.view", "staff.manage", "approvals.manage"], async ({ actor, query }) => {
  const { page, limit, skip } = paging(query, 20);
  const { from, to } = dateRange(query, 60);
  const f: Record<string, any> = { hotel: new Types.ObjectId(actor.hotelId), openedAt: { $gte: from, $lte: to } };
  const seeAll = actor.can("staff.manage") || actor.can("approvals.manage");
  if (!seeAll) f.cashier = new Types.ObjectId(actor.userId);
  else if (query.get("cashier")) f.cashier = new Types.ObjectId(query.get("cashier")!);
  const [rows, total] = await Promise.all([
    CashierShift.find(f).sort({ openedAt: -1 }).skip(skip).limit(limit).populate("cashier", "name").lean(),
    CashierShift.countDocuments(f),
  ]);
  const items = await Promise.all(rows.map((r: any) => describeShift(r)));
  return pageResult(items, total, page, limit);
});

const open = z.object({ openingCash: z.number().int().min(0, "Opening cash cannot be negative") });
export const POST = route("shift.open", async ({ actor, body }) => openShift(actor, (await body(open)).openingCash));
