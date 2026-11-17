// Starts a local single-node MongoDB replica set (transactions enabled), data persisted in ./.data/rs
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(".data/rs", { recursive: true });
  const rs = await MongoMemoryReplSet.create({
    replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger", dbName: "skyhotel" },
    instanceOpts: [{ port: 27018, dbPath: ".data/rs", storageEngine: "wiredTiger" }],
  });
  console.log("MongoDB replica set ready:", rs.getUri("skyhotel"));
  process.on("SIGINT", async () => { await rs.stop(); process.exit(0); });
}
main();
