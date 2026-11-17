import { route } from "@/lib/api";
import { listApprovals } from "@/services/approvals";

export const GET = route("approvals.manage", async ({ session, query }) => listApprovals(session.hotelId, query.get("status") || undefined));
