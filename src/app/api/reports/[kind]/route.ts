import { route, bad, dateRange, forbidden } from "@/lib/api";
import { bestSellers, dashboard, inventoryReport, profitReport, salesSummary } from "@/services/reports";

export const GET = route<{ kind: string }>(["reports.view", "reports.profit", "dashboard.view"], async ({ session, params, query, can }) => {
  const need = { dashboard: "dashboard.view", sales: "reports.view", inventory: "reports.view", profit: "reports.profit" } as const;
  const perm = need[params.kind as keyof typeof need];
  if (!perm) throw bad("Unknown report");
  if (!can(perm)) throw forbidden();
  const { from, to } = dateRange(query, 30);
  const h = session.hotelId;
  switch (params.kind) {
    case "dashboard":
      return dashboard(h, (query.get("range") as "day" | "week" | "month") || "week");
    case "sales": {
      const group = (query.get("group") as "day" | "week" | "month") || "day";
      const [summary, best] = await Promise.all([salesSummary(h, from, to, group), bestSellers(h, from, to, 10)]);
      return { ...summary, best };
    }
    case "inventory":
      return inventoryReport(h, from, to);
    case "profit":
      return profitReport(h, from, to);
    default:
      throw bad("Unknown report");
  }
});
