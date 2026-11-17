// Rebuilds indexes after a schema change (drops stale ones that no longer match the model).
import mongoose from "mongoose";
import { loadEnvFile } from "node:process";
import "../src/lib/models";
try { loadEnvFile(".env.local"); } catch {}
async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  for (const name of mongoose.modelNames()) {
    const dropped = await mongoose.model(name).syncIndexes();
    if (dropped.length) console.log(name, "dropped:", dropped.join(", "));
  }
  console.log("indexes in sync");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
