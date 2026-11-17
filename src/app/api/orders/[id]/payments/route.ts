import { z } from "zod";
import { route } from "@/lib/api";
import { addPayment } from "@/services/billing";

const schema = z.object({ method: z.enum(["cash", "upi", "card"]), amount: z.number().int().min(1), reference: z.string().max(60).optional() });

export const POST = route<{ id: string }>("bills.create", async ({ session, params, body }) => addPayment(params.id, await body(schema), session));
