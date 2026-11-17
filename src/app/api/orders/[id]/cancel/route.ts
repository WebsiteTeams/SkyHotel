import { z } from "zod";
import { route } from "@/lib/api";
import { cancelOrder } from "@/services/billing";

const schema = z.object({ reason: z.string().trim().min(3, "A reason is required").max(200) });

export const POST = route<{ id: string }>("billing.cancel", async ({ session, params, body }) => {
  const { reason } = await body(schema);
  return cancelOrder(params.id, reason, session);
});
