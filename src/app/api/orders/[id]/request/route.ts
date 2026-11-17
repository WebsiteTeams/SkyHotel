import { route } from "@/lib/api";
import { requestApproval, requestInput } from "@/services/approvals";

/** Cashier requests a cancellation / refund. Needs only the right to see the bill; a manager must approve. */
export const POST = route<{ id: string }>("billing.view", async ({ actor, params, body }) => requestApproval(actor, params.id, await body(requestInput)));
