import fs from "fs";
import pg from "pg";

const envPath = ".env";
const envFile = fs.readFileSync(envPath, "utf-8");
let dbUrl = "";
for (const line of envFile.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    dbUrl = line.split("=").slice(1).join("=").trim().replace(/['"]/g, "");
  }
}

const { Pool } = pg;
const pool = new Pool({ connectionString: dbUrl, max: 1 });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Fixing 679f");
    
    // Provision missing wallet solely for duplicate worker
    await client.query(`
        INSERT INTO wallets (worker_id, balance, currency)
        VALUES ('679fc739-255f-4b4f-9b96-4c92d25b3f9d', '0.00', 'INR')
        ON CONFLICT DO NOTHING
    `);

    // Provision missing policy
    await client.query(`
        INSERT INTO policies (worker_id, tier, weekly_premium, coverage_cap, status, zone_id)
        VALUES ('679fc739-255f-4b4f-9b96-4c92d25b3f9d', 'basic', 15.00, 400.00, 'active', 'koramangala')
        ON CONFLICT DO NOTHING
    `);

    await client.query("COMMIT");
    console.log("Fixed 679f");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("FAIL:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}
run();
