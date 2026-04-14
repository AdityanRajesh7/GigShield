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
    const workers = await pool.query("SELECT id, name, phone, created_at FROM workers WHERE phone LIKE '%99999%'");
    console.log("Workers:");
    for (const w of workers.rows) {
        console.log(w);
        const ws = await pool.query("SELECT * FROM wallets WHERE worker_id = $1", [w.id]);
        console.log("  Wallets: ", ws.rows);
    }
  } catch (err) {
    console.error("FAIL:", err);
  }
  process.exit(0);
}
run();
