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
const pool = new Pool({ connectionString: dbUrl });

async function run() {
  try {
    const workers = await pool.query("SELECT id FROM workers");
    for (const row of workers.rows) {
      await pool.query("INSERT INTO wallets (worker_id) VALUES ($1) ON CONFLICT DO NOTHING", [row.id]);
      
      // Also provision a policy if missing
      const pols = await pool.query("SELECT id FROM policies WHERE worker_id = $1 AND status = 'active'", [row.id]);
      if (pols.rows.length === 0) {
          await pool.query("INSERT INTO policies (worker_id, tier, weekly_premium, coverage_cap, status, zone_id) VALUES ($1, 'basic', 15.00, 400.00, 'active', 'koramangala')", [row.id]);
      }
    }
    console.log("Provisioned missing wallets and policies for all workers");
  } catch (err) {
    console.error("FAIL:", err);
  }
  process.exit(0);
}
run();
