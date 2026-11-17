import mongoose from "mongoose";
import { z } from "zod";
import { route, forbidden, bad } from "@/lib/api";
import "@/lib/models";

const COLLECTIONS = ["hotels", "settings", "categories", "fooditems", "inventoryitems", "recipes", "recipeingredients", "orders", "orderitems", "invoices", "payments", "suppliers", "purchases", "purchaseitems", "stockmovements", "expenses", "counters"];

/** Full JSON export of this hotel's data (super admin only). */
export const GET = route("settings.manage", async ({ session }) => {
  if (session.role !== "super_admin") throw forbidden("Only a Super Admin can export backups");
  const db = mongoose.connection.db!;
  const out: Record<string, unknown[]> = {};
  for (const c of COLLECTIONS) {
    const filter = c === "hotels" ? { _id: new mongoose.Types.ObjectId(session.hotelId) } : c === "counters" ? { key: { $regex: session.hotelId } } : c.endsWith("items") && ["orderitems", "recipeingredients", "purchaseitems"].includes(c) ? { hotel: new mongoose.Types.ObjectId(session.hotelId) } : { hotel: new mongoose.Types.ObjectId(session.hotelId) };
    out[c] = await db.collection(c).find(filter).toArray();
  }
  return new Response(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: out }), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="skyhotel-backup-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});

const schema = z.object({ confirm: z.literal("RESTORE"), backup: z.object({ version: z.literal(1), data: z.record(z.string(), z.array(z.any())) }) });

/** Replaces this hotel's business data with the backup. Users are never touched. */
export const POST = route("settings.manage", async ({ session, body }) => {
  if (session.role !== "super_admin") throw forbidden("Only a Super Admin can restore backups");
  const { backup } = await body(schema);
  const db = mongoose.connection.db!;
  const hid = new mongoose.Types.ObjectId(session.hotelId);
  const revive = (v: any): any => {
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
    if (typeof v === "string") {
      if (/^[a-f0-9]{24}$/.test(v)) return new mongoose.Types.ObjectId(v);
      if (/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v)) return new Date(v);
    }
    return v;
  };
  let restored = 0;
  for (const c of COLLECTIONS) {
    const rows = backup.data[c];
    if (!rows) continue;
    const docs = rows.map(revive);
    if (docs.some((d: any) => c !== "counters" && c !== "hotels" && String(d.hotel) !== session.hotelId)) throw bad("Backup belongs to a different hotel");
    const filter = c === "hotels" ? { _id: hid } : c === "counters" ? { key: { $regex: session.hotelId } } : { hotel: hid };
    await db.collection(c).deleteMany(filter);
    if (docs.length) await db.collection(c).insertMany(docs);
    restored += docs.length;
  }
  return { restored };
});
