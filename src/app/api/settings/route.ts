import { route } from "@/lib/api";
import { Hotel, Settings } from "@/lib/models";
import { settingsSchema } from "@/lib/schemas";
import { getSettings } from "@/services/billing";

export const GET = route(["settings.manage", "pos.use"], async ({ session, can }) => {
  const [hotel, settings] = await Promise.all([Hotel.findById(session.hotelId).lean(), getSettings(session.hotelId)]);
  if (!can("settings.manage")) {
    // POS only needs the table count and printer defaults - tax / stock / loyalty rules stay private.
    return { hotel: { name: (hotel as any)?.name }, settings: { tables: settings.tables, invoice: { paperSize: settings.invoice.paperSize, autoPrint: settings.invoice.autoPrint } } };
  }
  return { hotel, settings };
});

export const PUT = route("settings.manage", async ({ session, body }) => {
  const d = await body(settingsSchema);
  const hotel = await Hotel.findByIdAndUpdate(session.hotelId, d.hotel, { returnDocument: "after" });
  await getSettings(session.hotelId);
  const settings = await Settings.findOneAndUpdate({ hotel: session.hotelId }, { $set: { invoice: d.invoice, tax: d.tax, stock: d.stock, notifications: d.notifications, loyalty: d.loyalty, tables: d.tables } }, { returnDocument: "after" });
  return { hotel, settings };
});
