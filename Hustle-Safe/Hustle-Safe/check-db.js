import pg from "pg";
import fs from "fs";

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
  const res = await pool.query("SELECT * FROM workers WHERE phone = $1", ["+91 9999999999"]);
  console.log("Worker:", res.rows[0]);
  if (res.rows[0]) {
    const claims = await pool.query("SELECT * FROM claims WHERE worker_id = $1", [res.rows[0].id]);
    console.log("Claims:", claims.rows);
    const wallets = await pool.query("SELECT * FROM wallets WHERE worker_id = $1", [res.rows[0].id]);
    console.log("Wallet:", wallets.rows[0]);
    const policies = await pool.query("SELECT * FROM policies WHERE worker_id = $1", [res.rows[0].id]);
    console.log("Policies:", policies.rows);
  }
  process.exit(0);
}
run();
