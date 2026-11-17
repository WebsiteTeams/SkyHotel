/** Stock is stored in a base unit per dimension: g (mass), ml (volume), or a count unit. */
export const UNITS = ["kg", "g", "L", "ml", "pcs", "packet", "box"] as const;
export type Unit = (typeof UNITS)[number];
export type BaseUnit = "g" | "ml" | "pcs" | "packet" | "box";

const TABLE: Record<Unit, { base: BaseUnit; factor: number }> = {
  kg: { base: "g", factor: 1000 },
  g: { base: "g", factor: 1 },
  L: { base: "ml", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  pcs: { base: "pcs", factor: 1 },
  packet: { base: "packet", factor: 1 },
  box: { base: "box", factor: 1 },
};

export const baseUnitOf = (u: Unit): BaseUnit => TABLE[u].base;
export const unitFactor = (u: Unit) => TABLE[u].factor;
export const isCompatible = (a: Unit, b: Unit) => TABLE[a].base === TABLE[b].base;

/** Convert a quantity in `unit` to base units, rounded to 3 decimals to avoid float drift. */
export function toBase(qty: number, unit: Unit) {
  return Math.round(qty * TABLE[unit].factor * 1000) / 1000;
}
export function fromBase(qtyBase: number, unit: Unit) {
  return Math.round((qtyBase / TABLE[unit].factor) * 1000) / 1000;
}
/** Units that can be used for recipes/movements of an item stored in the given unit. */
export const compatibleUnits = (u: Unit) => UNITS.filter((x) => isCompatible(x, u));
