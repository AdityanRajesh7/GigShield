import fs from "fs";
import { resolve } from "path";
const envPath = resolve(process.cwd(), ".env");
const envFile = fs.readFileSync(envPath, "utf-8");
for (const line of envFile.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    process.env.DATABASE_URL = line.split("=").slice(1).join("=").trim().replace(/['"]/g, "");
  }
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { db, walletsTable } from "@workspace/db";
import { creditWallet } from "./artifacts/api-server/src/lib/wallet.js";
import { eq } from "drizzle-orm";

async function run() {
  try {
    const wallets = await db.select().from(walletsTable).limit(1);
    const wallet = wallets[0];
    console.log("Found wallet:", wallet);
    const result = await creditWallet(wallet.id, wallet.worker_id, "5.00", "withdrawal", "123", "Test");
    console.log("Success:", result);
  } catch (err) {
    console.error("FAIL:", err);
  }
  process.exit(0);
}
run();
