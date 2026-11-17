import mongoose from "mongoose";
import { loadEnvFile } from "node:process";
import { Hotel, Settings, User, Category, FoodItem, InventoryItem, Recipe, RecipeIngredient, Supplier } from "../src/lib/models";
import { hashPassword } from "../src/lib/auth";
import { baseUnitOf, toBase, type Unit } from "../src/lib/units";

try { loadEnvFile(".env.local"); } catch {}
const demo = process.argv.includes("--demo");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  let hotel = await Hotel.findOne();
  if (!hotel) hotel = await Hotel.create({ name: "SkyHotel", address: "12 Main Road, Chennai", phone: "+91 98765 43210", gstin: "" });
  await Settings.updateOne({ hotel: hotel._id }, { $setOnInsert: { hotel: hotel._id } }, { upsert: true });
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@skyhotel.com").toLowerCase();
  if (!(await User.exists({ email })))
    await User.create({ hotel: hotel._id, name: "Super Admin", email, role: "super_admin", passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe@123") });
  console.log(`Admin ready: ${email}`);

  if (demo && !(await Category.exists({ hotel: hotel._id }))) {
    const h = hotel._id;
    const [rice, meals] = await Category.create([{ hotel: h, name: "Biryani & Rice" }, { hotel: h, name: "Beverages" }]);
    const sup = await Supplier.create({ hotel: h, name: "Fresh Farms", company: "Fresh Farms Pvt Ltd", phone: "9000000001" });
    const mk = async (name: string, sku: string, unit: Unit, stock: number, min: number, price: number) =>
      InventoryItem.create({ hotel: h, name, sku, unit, baseUnit: baseUnitOf(unit), currentStock: toBase(stock, unit), openingStock: toBase(stock, unit), minStock: toBase(min, unit), purchasePrice: price, avgCost: price / toBase(1, unit), supplier: sup._id });
    const ri = await mk("Basmati Rice", "RICE-01", "kg", 25, 5, 9000);
    const ch = await mk("Chicken", "CHK-01", "kg", 15, 3, 22000);
    const oil = await mk("Cooking Oil", "OIL-01", "L", 10, 2, 14000);
    const ma = await mk("Biryani Masala", "MSL-01", "kg", 3, 0.5, 40000);
    const on = await mk("Onion", "ONI-01", "kg", 12, 3, 4000);
    const tea = await mk("Tea Powder", "TEA-01", "kg", 2, 0.5, 40000);
    const milk = await mk("Milk", "MLK-01", "L", 20, 4, 6000);
    const bir = await FoodItem.create({ hotel: h, name: "Chicken Biryani", category: rice._id, price: 22000, cost: 9000, type: "non_veg", gstRate: 5, variations: [{ name: "Half", price: 14000 }, { name: "Full", price: 22000 }], addons: [{ name: "Extra Egg", price: 2000 }] });
    const chai = await FoodItem.create({ hotel: h, name: "Tea", category: meals._id, price: 1500, type: "veg", gstRate: 5 });
    const r1 = await Recipe.create({ hotel: h, food: bir._id });
    await RecipeIngredient.create([[ri, 150, "g"], [ch, 125, "g"], [oil, 15, "ml"], [ma, 10, "g"], [on, 50, "g"]].map(([it, q, u]: any) => ({ hotel: h, recipe: r1._id, item: it._id, quantity: q, unit: u, quantityBase: q })));
    const r2 = await Recipe.create({ hotel: h, food: chai._id });
    await RecipeIngredient.create([[tea, 5, "g"], [milk, 100, "ml"]].map(([it, q, u]: any) => ({ hotel: h, recipe: r2._id, item: it._id, quantity: q, unit: u, quantityBase: q })));
    console.log("Demo data created");
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
