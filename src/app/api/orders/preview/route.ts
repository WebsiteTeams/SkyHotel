import { z } from "zod";
import { route } from "@/lib/api";
import { getSettings, orderBase, priceOrder } from "@/services/billing";

const schema = z.object({ items: z.array(z.any()), billDiscount: z.any().optional(), customerPhone: z.string().optional() });

/** Live, server-computed totals for the POS cart. Nothing is written. */
export const POST = route("bills.create", async ({ session, body }) => {
  const d = await body(schema);
  const parsed = orderBase.pick({ items: true, billDiscount: true, customerPhone: true }).parse({ items: d.items, billDiscount: d.billDiscount, customerPhone: d.customerPhone || undefined });
  const settings = await getSettings(session.hotelId);
  const r = await priceOrder(parsed, settings, session.hotelId, session);
  return {
    subtotal: r.subtotal, itemDiscount: r.itemDiscount, billDiscount: r.billDiscount, taxable: r.taxable, gst: r.gst, roundOff: r.roundOff, grandTotal: r.grandTotal,
    breakup: r.breakup, loyalty: r.loyalty, discount: r.discount, lines: r.priced.map((l) => ({ unitPrice: l.unitPrice, gross: l.gross, discount: l.disc, total: l.total })),
  };
});
