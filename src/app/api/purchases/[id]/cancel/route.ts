import { z } from "zod";
import { route } from "@/lib/api";
import { cancelPurchase } from "@/services/purchases";

const schema = z.object({ reason: z.string().trim().min(3, "A reason is required").max(200) });

export const POST = route<{ id: string }>("purchases.manage", async ({ session, params, body }) => cancelPurchase(params.id, (await body(schema)).reason, session));
