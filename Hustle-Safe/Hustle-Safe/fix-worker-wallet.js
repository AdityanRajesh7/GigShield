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
      await pool.query("INSERT INTO wallets (worker_id) VALUES ($1) ON CONFLICT DO NOTHING", [workerId]);
      console.log("Wallet provisioned for worker", workerId);
    }
  } catch (err) {
    console.error("Failed:", err);
  } finally {
    process.exit(0);
  }
}
run();
