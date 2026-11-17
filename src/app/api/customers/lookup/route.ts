import { route } from "@/lib/api";
import { Customer } from "@/lib/models";
import { normalizePhone } from "@/lib/phone";
import { getSettings } from "@/services/billing";

/** POS lookup by phone: returns the customer (if known) and whether the repeat-customer discount applies. */
export const GET = route("pos.use", async ({ session, query }) => {
  const phone = normalizePhone(query.get("phone"));
  if (!phone) return { phone: "", customer: null, eligible: false, percent: 0 };
  const [c, s] = await Promise.all([Customer.findOne({ hotel: session.hotelId, phone }).lean<any>(), getSettings(session.hotelId)]);
  const L = s.loyalty;
  const visits = c?.visits ?? 0;
  const eligible = !!L?.enabled && L.percent > 0 && visits >= L.minVisits;
  return {
    phone, customer: c ? { name: c.name, visits, totalSpent: c.totalSpent, lastVisitAt: c.lastVisitAt } : null,
    eligible, percent: eligible ? L.percent : 0, visitsToGo: L?.enabled && !eligible ? Math.max(0, L.minVisits - visits) : 0, rule: L ? { minVisits: L.minVisits, percent: L.percent, enabled: L.enabled } : null,
  };
});
