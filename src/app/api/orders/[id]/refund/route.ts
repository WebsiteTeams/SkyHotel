import { z } from "zod";
import { route } from "@/lib/api";
import { refundOrder } from "@/services/billing";

const schema = z.object({
  amount: z.number().int().min(1, "Enter an amount"),
  method: z.enum(["cash", "upi", "card"]),
  reason: z.string().trim().min(3, "A reason is required").max(200),
});

export const POST = route<{ id: string }>("billing.refund", async ({ session, params, body }) => refundOrder(params.id, await body(schema), session));
