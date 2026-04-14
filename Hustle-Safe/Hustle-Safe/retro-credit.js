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

    console.log("Crediting specific claim 4bb3316f...");
    // Retroactively pay wallets for claims marked PAID but with zero wallet sum
    const paidClaims = await client.query("SELECT * FROM claims WHERE id = '4bb3316f-2cc9-4b2d-8a6e-69dc45f9676e'");
    for (const claim of paidClaims.rows) {
        // Did we pay this claim? Check wallet_transactions
        const txs = await client.query("SELECT id FROM wallet_transactions WHERE reference_id = $1", [claim.id]);
        if (txs.rows.length === 0) {
            // Find wallet
            const wallets = await client.query("SELECT id FROM wallets WHERE worker_id = $1", [claim.worker_id]);
            if (wallets.rows.length > 0) {
                const walletId = wallets.rows[0].id;
                console.log("Retro-crediting wallet " + walletId + " for claim " + claim.id);
                // Corrected $1, $2, $3 mapped correctly
                await client.query(`
                    INSERT INTO wallet_transactions (wallet_id, type, amount, reference_type, reference_id, status, description)
                    VALUES ($1, 'credit', $2, 'claim_payout', $3, 'completed', 'Retroactive Payout for Claim')
                `, [walletId, claim.payout_amount, claim.id]);
                
                await client.query(`
                    UPDATE wallets SET balance = balance + $1 WHERE id = $2
                `, [claim.payout_amount, walletId]);
                console.log("Retro-credited " + claim.payout_amount);
            }
        } else {
            console.log("Already credited");
        }
    }

    await client.query("COMMIT");
    console.log("Retro-credited successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("FAIL:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}
run();
