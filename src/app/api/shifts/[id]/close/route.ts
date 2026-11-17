import { z } from "zod";
import { route } from "@/lib/api";
import { closeShift } from "@/services/shifts";

const schema = z.object({ actualClosingCash: z.number().int().min(0, "Enter the counted cash"), notes: z.string().trim().max(300).optional() });

export const POST = route<{ id: string }>("shift.close", async ({ actor, params, body }) => {
  const d = await body(schema);
  return closeShift(actor, params.id, d.actualClosingCash, d.notes);
});
