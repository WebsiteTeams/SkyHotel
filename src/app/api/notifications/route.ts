import { route } from "@/lib/api";
import { InventoryItem, Notification, Settings } from "@/lib/models";

export const GET = route(null, async ({ session }) => {
  const settings = await Settings.findOne({ hotel: session.hotelId }).lean<any>();
  const days = settings?.stock?.expiryAlertDays ?? 7;
  if (settings?.notifications?.expiry !== false) {
    const soon = await InventoryItem.find({ hotel: session.hotelId, deletedAt: null, currentStock: { $gt: 0 }, expiryDate: { $lte: new Date(Date.now() + days * 86400000) } }, "name expiryDate");
    for (const it of soon) {
      if (!(await Notification.exists({ hotel: session.hotelId, refId: it._id, type: "expiry", read: false })))
        await Notification.create({ hotel: session.hotelId, type: "expiry", refModel: "InventoryItem", refId: it._id, title: `${it.name} expiry`, message: `Expires ${it.expiryDate!.toISOString().slice(0, 10)}` });
    }
  }
  const items = await Notification.find({ hotel: session.hotelId }).sort({ read: 1, createdAt: -1 }).limit(30).lean();
  return { items, unread: items.filter((n: any) => !n.read).length };
});

export const POST = route(null, async ({ session }) => {
  await Notification.updateMany({ hotel: session.hotelId, read: false }, { read: true });
  return true;
});
