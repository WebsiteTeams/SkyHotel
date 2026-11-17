import mongoose, { type ClientSession } from "mongoose";
import { connectDB, supportsTransactions } from "./db";

export interface Tx {
  session?: ClientSession;
  /** Register a compensating action, used only when transactions are unavailable. */
  onRollback: (fn: () => Promise<unknown>) => void;
}

/**
 * Runs related financial + inventory writes atomically.
 * - Replica set: a real MongoDB transaction.
 * - Standalone: guarded conditional updates + compensating rollbacks in reverse order.
 */
export async function atomic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  await connectDB();
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let out!: T;
      await session.withTransaction(async () => {
        out = await fn({ session, onRollback: () => {} });
      });
      return out;
    } finally {
      await session.endSession();
    }
  }
  const undo: Array<() => Promise<unknown>> = [];
  try {
    return await fn({ onRollback: (f) => undo.push(f) });
  } catch (e) {
    for (const f of undo.reverse()) {
      try {
        await f();
      } catch (err) {
        console.error("rollback step failed", err);
      }
    }
    throw e;
  }
}
