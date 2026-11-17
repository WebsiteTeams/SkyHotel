import mongoose, { Schema, type Model } from "mongoose";

export const oid = (ref: string, required = false) => ({ type: Schema.Types.ObjectId, ref, required });

/** Fields every tenant-scoped document carries (multi-branch ready: `hotel`, optional `branch`). */
export const tenant = {
  hotel: { ...oid("Hotel", true), index: true },
  branch: { type: Schema.Types.ObjectId, default: null },
};
export const softDelete = { deletedAt: { type: Date, default: null, index: true } };

/** Defines (or reuses, for hot reload) a model. Typed loosely on purpose: Mongoose's schema inference is very slow to type-check. */
export function define(name: string, def: any, opts: any = {}, setup?: (s: Schema) => void): Model<any> {
  if (mongoose.models[name]) return mongoose.models[name] as Model<any>;
  const schema: Schema = new (Schema as any)(def, { timestamps: true, ...opts });
  setup?.(schema);
  return mongoose.model(name, schema) as unknown as Model<any>;
}

/** Immutable collections (financial / audit history) reject updates and deletes. */
export function immutable(s: Schema) {
  const block = function () {
    throw new Error("This record is immutable");
  };
  for (const h of ["updateOne", "updateMany", "findOneAndUpdate", "deleteOne", "deleteMany", "findOneAndDelete", "replaceOne"] as const)
    s.pre(h, block);
}

export const paise = { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger };
export const signedPaise = { type: Number, required: true, default: 0, validate: Number.isInteger };
