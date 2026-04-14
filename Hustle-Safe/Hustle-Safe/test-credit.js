import fs from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");
const envFile = fs.readFileSync(envPath, "utf-8");
for (const line of envFile.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    process.env.DATABASE_URL = line.split("=").slice(1).join("=").trim().replace(/['"]/g, "");
  }
}

import { db, walletsTable } from "./lib/db/src/index.js";
import { eq } from "drizzle-orm";
import { creditWallet } from "./artifacts/api-server/src/lib/wallet.js";

async function run() {
  try {
    const wallets = await db.select().from(walletsTable).limit(1);
    if (wallets.length === 0) {
      console.log("No wallets");
      process.exit(0);
    }
    const wallet = wallets[0];
    console.log("Crediting wallet:", wallet.id);

    const result = await creditWallet(wallet.id, wallet.worker_id, "10.00", "withdrawal", "123", "Test Credit");
    console.log("Success:", result);
  } catch (err) {
    console.error("FAIL:", err);
  }
  process.exit(0);
}
run();
