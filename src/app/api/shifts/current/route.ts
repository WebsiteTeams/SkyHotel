import { route } from "@/lib/api";
import { describeShift, getOpenShift } from "@/services/shifts";

export const GET = route(null, async ({ actor }) => {
  const s = await getOpenShift(actor.userId);
  return s ? describeShift(s) : null;
});
