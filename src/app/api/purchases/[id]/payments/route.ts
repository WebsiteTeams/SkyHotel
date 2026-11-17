import { z } from "zod";
import { route } from "@/lib/api";
import { payPurchase } from "@/services/purchases";

const schema = z.object({
  amount: z.number().int().min(1, "Enter an amount"),
  method: z.enum(["cash", "upi", "card", "bank"]),
  date: z.string().optional(),
  reference: z.string().max(60).optional(),
});

export const POST = route<{ id: string }>("purchases.manage", async ({ session, params, body }) => payPurchase(params.id, await body(schema), session));
