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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = pg;
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    const claims = await pool.query("SELECT id, status, worker_id, payout_amount FROM claims WHERE id::text LIKE '4bb3316f%'");
    console.log("Claim:", claims.rows);

    if (claims.rows.length > 0) {
        const workerId = claims.rows[0].worker_id;
        const wallets = await pool.query("SELECT * FROM wallets WHERE worker_id = $1", [workerId]);
        console.log("Wallet:", wallets.rows);

        const txns = await pool.query("SELECT * FROM wallet_transactions WHERE wallet_id = $1", [wallets.rows[0].id]);
        console.log("Txns:", txns.rows);
    }
  } catch (err) {
    console.error("FAIL:", err);
  }
  process.exit(0);
}
run();
