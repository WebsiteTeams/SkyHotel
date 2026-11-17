import { route, notFound } from "@/lib/api";
import { Purchase, PurchaseItem } from "@/lib/models";
import { purchaseInput, updatePurchase } from "@/services/purchases";

type P = { id: string };

export const GET = route<P>("purchases.manage", async ({ session, params }) => {
  const purchase = await Purchase.findOne({ _id: params.id, hotel: session.hotelId }).populate("supplier", "name company phone gstin").lean();
  if (!purchase) throw notFound("Purchase not found");
  const items = await PurchaseItem.find({ purchase: params.id }).lean();
  return { purchase, items };
});

export const PUT = route<P>("purchases.manage", async ({ session, params, body }) => updatePurchase(params.id, await body(purchaseInput), session));
