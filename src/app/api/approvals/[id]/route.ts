import { z } from "zod";
import { route } from "@/lib/api";
import { decideApproval } from "@/services/approvals";

const schema = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(200).optional() });

export const POST = route<{ id: string }>("approvals.manage", async ({ actor, params, body }) => {
  const d = await body(schema);
  return decideApproval(actor, params.id, d.decision, d.note);
});
