import { route, notFound } from "@/lib/api";
import { CashierShift } from "@/lib/models";
import { describeShift } from "@/services/shifts";

export const GET = route<{ id: string }>(["shift.view", "staff.manage", "approvals.manage"], async ({ actor, params }) => {
  const s = await CashierShift.findOne({ _id: params.id, hotel: actor.hotelId }).populate("cashier", "name");
  const seeAll = actor.can("staff.manage") || actor.can("approvals.manage");
  // Another cashier's shift looks like it does not exist.
  if (!s || (!seeAll && String((s.cashier as any)._id ?? s.cashier) !== actor.userId)) throw notFound("Shift not found");
  return describeShift(s);
});
