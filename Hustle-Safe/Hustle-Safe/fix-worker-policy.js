import fs from "fs";
import pg from "pg";

const env = fs.readFileSync(".env", "utf8");
let dbUrl = "";
for (const line of env.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    dbUrl = line.split("=")[1].trim().replace(/['"]/g, '');
  }
}

const { Pool } = pg;
const pool = new Pool({ connectionString: dbUrl });

async function run() {
  try {
    const res = await pool.query("SELECT id FROM workers WHERE phone = $1", ["+91 9999999999"]);
    const workerId = res.rows[0]?.id;
    if (workerId) {
      const pols = await pool.query("SELECT * FROM policies WHERE worker_id = $1", [workerId]);
      if (pols.rows.length === 0) {
        await pool.query("INSERT INTO policies (worker_id, tier, weekly_premium, coverage_cap, status, zone_id) VALUES ($1, 'basic', 15.00, 400.00, 'active', 'koramangala')", [workerId]);
        console.log("Policy provisioned");
      } else {
        console.log("Policy exists:", pols.rows[0].id);
      }
    }
  } catch (err) {
    console.error("Failed:", err);
  } finally {
    process.exit(0);
  }
}
run();
