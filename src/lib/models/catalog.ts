import { Schema } from "mongoose";
import { define, oid, tenant, softDelete, paise } from "./_base";
import { UNITS } from "../units";

export const Category = define("Category", {
  ...tenant,
  name: { type: String, required: true, trim: true },
  image: { type: String, default: "" },
  description: { type: String, default: "" },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  ...softDelete,
}, {}, (s) => s.index({ hotel: 1, name: 1 }));

const option = new Schema({ name: { type: String, required: true, trim: true }, price: paise }, { _id: true });

export const FoodItem = define("FoodItem", {
  ...tenant,
  name: { type: String, required: true, trim: true },
  image: { type: String, default: "" },
  category: { ...oid("Category", true), index: true },
  description: { type: String, default: "" },
  price: paise, // selling price
  cost: paise, // manual purchase cost (fallback when no recipe)
  type: { type: String, enum: ["veg", "non_veg", "egg"], default: "veg" },
  available: { type: Boolean, default: true },
  gstRate: { type: Number, default: 5, min: 0, max: 28 },
  unit: { type: String, default: "plate" },
  prepNotes: { type: String, default: "" },
  variations: [option], // e.g. Half / Full — price replaces base price
  addons: [option], // e.g. Extra Egg — price added
  ...softDelete,
}, {}, (s) => {
  s.index({ hotel: 1, name: "text" });
  s.index({ hotel: 1, category: 1, available: 1 });
});

export const InventoryItem = define("InventoryItem", {
  ...tenant,
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  category: { type: String, default: "General", trim: true },
  unit: { type: String, enum: UNITS, required: true }, // display / purchase unit
  baseUnit: { type: String, required: true }, // storage unit (g, ml, pcs...)
  openingStock: { type: Number, default: 0, min: 0 }, // base units
  currentStock: { type: Number, default: 0, min: 0 }, // base units - never negative
  minStock: { type: Number, default: 0, min: 0 }, // base units
  purchasePrice: paise, // paise per display unit (latest)
  avgCost: { type: Number, default: 0, min: 0 }, // paise per BASE unit (weighted average, fractional)
  supplier: oid("Supplier"),
  expiryDate: Date,
  location: { type: String, default: "" },
  description: { type: String, default: "" },
  active: { type: Boolean, default: true },
  ...softDelete,
}, {}, (s) => {
  s.index({ hotel: 1, sku: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
  s.index({ hotel: 1, name: "text", sku: "text" });
});

export const Recipe = define("Recipe", {
  ...tenant,
  food: { ...oid("FoodItem", true), unique: true },
  version: { type: Number, default: 1 },
  notes: String,
  ...softDelete,
});

export const RecipeIngredient = define("RecipeIngredient", {
  hotel: oid("Hotel", true),
  recipe: { ...oid("Recipe", true), index: true },
  item: oid("InventoryItem", true),
  quantity: { type: Number, required: true, min: 0.001 }, // in `unit`
  unit: { type: String, enum: UNITS, required: true },
  quantityBase: { type: Number, required: true, min: 0.001 }, // converted
});
