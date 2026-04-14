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
      const claims = await pool.query("SELECT * FROM claims WHERE worker_id = $1", [workerId]);
      console.log("Claims table dumps:", claims.rows);
      
      const wallets = await pool.query("SELECT * FROM wallets WHERE worker_id = $1", [workerId]);
      console.log("Wallets table dumps:", wallets.rows);

      const txns = await pool.query("SELECT * FROM wallet_transactions WHERE wallet_id = $1", [wallets.rows[0]?.id]);
      console.log("Transactions table dumps:", txns.rows);
    }
  } catch (err) {
    console.error("Failed:", err);
  } finally {
    process.exit(0);
  }
}
run();
